import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DddFileProcessingStatus,
  DddFileType,
  DddFileSource,
  DtcSeverity,
  Prisma,
  TachoInfringementType,
  TachoWorkState,
} from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { parseDddBuffer, type DddGeneration, type ParsedDddEvent } from './ddd/ddd-parser';
import type { DddParserPort } from './ddd/parser-port';
import {
  mapActivitiesToLike,
  mapParserEventsToCardEvents,
  runTachographRuleEngine,
} from './tachograph-rules.runner';
import type { InfringementCandidate } from './rules/types';

type IngestDddMeta = {
  tenantId: string;
  uploadedByUserId?: string;
  vehicleId?: string;
  fileName: string;
  capturedAt?: string;
  source: DddFileSource;
};

export type EnqueueDddResult = {
  file: { id: string; status: DddFileProcessingStatus };
  deduplicated: boolean;
};

const MAX_ERROR_SUMMARY_LENGTH = 500;

@Injectable()
export class TachographService {
  private readonly logger = new Logger(TachographService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly dddParser?: DddParserPort,
  ) {}

  /**
   * Upload entry point: archives the raw DDD file and records a pending DddFile row,
   * then hands processing off to the queue. Returns immediately so the controller can
   * answer 202 Accepted. Parsing/rules/persist happen in {@link processDddFile}.
   */
  async enqueueDddFile(buffer: Buffer, meta: IngestDddMeta): Promise<EnqueueDddResult> {
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const capturedAt = meta.capturedAt ? new Date(meta.capturedAt) : new Date();

    const existing = await this.prisma.dddFile.findUnique({
      where: {
        tenantId_sha256: {
          tenantId: meta.tenantId,
          sha256,
        },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      return {
        file: { id: existing.id, status: existing.status },
        deduplicated: true,
      };
    }

    const storedPath = await this.archiveDddFile(meta.tenantId, meta.fileName, buffer);

    const created = await this.prisma.dddFile.create({
      data: {
        tenantId: meta.tenantId,
        vehicleId: meta.vehicleId ?? null,
        uploadedByUserId: meta.uploadedByUserId ?? null,
        fileType: DddFileType.unknown,
        source: meta.source,
        capturedAt,
        storedPath,
        sizeBytes: buffer.length,
        sha256,
        status: DddFileProcessingStatus.pending,
      },
      select: { id: true, status: true },
    });

    return {
      file: { id: created.id, status: created.status },
      deduplicated: false,
    };
  }

  /**
   * Queue consumer: parse -> signature -> rules -> persist for a pending DddFile.
   * Marks the row processed on success, failed (with a short summary) on error.
   * Idempotent: an already-processed file is a no-op.
   */
  async processDddFile(tenantId: string, dddFileId: string): Promise<void> {
    const file = await this.prisma.dddFile.findFirst({
      where: { id: dddFileId, tenantId },
      select: {
        id: true,
        tenantId: true,
        vehicleId: true,
        uploadedByUserId: true,
        storedPath: true,
        status: true,
      },
    });

    if (!file) {
      this.logger.warn(`DDD file ${dddFileId} not found for tenant ${tenantId}; skipping.`);
      return;
    }

    if (file.status === DddFileProcessingStatus.processed) {
      // Idempotent: duplicate delivery of an already-completed job.
      return;
    }

    await this.prisma.dddFile.update({
      where: { id: file.id },
      data: {
        processingErrorSummary: null,
      },
    });

    try {
      const buffer = await readFile(file.storedPath);
      const meta: IngestDddMeta = {
        tenantId: file.tenantId,
        uploadedByUserId: file.uploadedByUserId ?? undefined,
        vehicleId: file.vehicleId ?? undefined,
        fileName: file.storedPath,
        source: DddFileSource.manual,
      };

      const parsed = this.parseBuffer(buffer);
      const driver = await this.resolveDriverFromCard(file.tenantId, parsed.driverCardNo);
      const signatureBlocksRuleEngine = parsed.signature.valid === false;

      const infringementsCreated = await this.prisma.$transaction(async (tx) => {
        await tx.dddFile.update({
          where: { id: file.id },
          data: {
            driverId: driver?.id ?? null,
            fileType: parsed.fileType,
            generation: this.mapGeneration(parsed.generation),
            signatureValid: parsed.signature.valid,
            skippedBlocks: parsed.skippedBlocks,
          },
        });

        if (!signatureBlocksRuleEngine && parsed.activities.length > 0 && file.vehicleId) {
          const vehicleId = file.vehicleId;
          await tx.tachoActivity.createMany({
            data: parsed.activities.map((activity) => {
              const startedAt = new Date(activity.startedAt);
              const endedAt = new Date(startedAt.getTime() + activity.durationS * 1000);

              return {
                tenantId: file.tenantId,
                dddFileId: file.id,
                vehicleId,
                driverId: driver?.id ?? null,
                driverCardNo: parsed.driverCardNo ?? null,
                workState: this.mapWorkState(activity.state),
                startedAt,
                endedAt,
                durationS: activity.durationS,
              };
            }),
          });
        } else if (!signatureBlocksRuleEngine && parsed.activities.length > 0) {
          this.logger.warn('Skipping TachoActivity writes: vehicleId is missing');
        } else if (signatureBlocksRuleEngine) {
          this.logger.warn('Skipping rule engine: DDD signature validation failed');
        }

        let created = 0;
        if (!signatureBlocksRuleEngine) {
          created = await this.buildInfringements(
            tx,
            file.tenantId,
            driver?.id,
            file.vehicleId ?? undefined,
            file.id,
            parsed.activities.map((activity) => {
              const startedAt = new Date(activity.startedAt);
              return {
                startedAt,
                endedAt: new Date(startedAt.getTime() + activity.durationS * 1000),
                durationS: activity.durationS,
                workState: this.mapWorkState(activity.state),
              };
            }),
            parsed.events,
          );
        }

        await tx.dddFile.update({
          where: { id: file.id },
          data: {
            status: DddFileProcessingStatus.processed,
            processingErrorSummary: null,
          },
        });

        return created;
      });

      if (signatureBlocksRuleEngine) {
        await this.notifySignatureInvalid(meta, file.id, parsed.warnings);
      }

      this.logger.log(
        `DDD file ${file.id} processed: ${parsed.activities.length} activities, ${infringementsCreated} infringements.`,
      );
    } catch (error) {
      const summary = this.summarizeError(error);
      await this.prisma.dddFile.update({
        where: { id: file.id },
        data: {
          status: DddFileProcessingStatus.failed,
          processingErrorSummary: summary,
        },
      });
      // Re-throw so the queue can apply its retry policy.
      throw error instanceof Error ? error : new Error(summary);
    }
  }

  private summarizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, MAX_ERROR_SUMMARY_LENGTH);
  }

  async listDddFiles(tenantId: string) {
    const rows = await this.prisma.dddFile.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 200,
    });

    const fileIds = rows.map((row) => row.id);
    const periodRows =
      fileIds.length > 0
        ? await this.prisma.tachoActivity.groupBy({
            by: ['dddFileId'],
            where: { tenantId, dddFileId: { in: fileIds } },
            _min: { startedAt: true },
            _max: { endedAt: true },
          })
        : [];

    const periodByFile = new Map(
      periodRows
        .filter((row) => row.dddFileId)
        .map((row) => [
          row.dddFileId!,
          {
            from: row._min.startedAt?.toISOString() ?? null,
            to: row._max.endedAt?.toISOString() ?? null,
          },
        ]),
    );

    return rows.map((row) => ({
      id: row.id,
      fileType: row.fileType,
      source: row.source,
      status: row.status,
      processingErrorSummary: row.processingErrorSummary,
      capturedAt: row.capturedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      generation: row.generation,
      signatureValid: row.signatureValid,
      skippedBlocks: Array.isArray(row.skippedBlocks) ? row.skippedBlocks : [],
      coveredPeriod: periodByFile.get(row.id) ?? { from: null, to: null },
      vehicle: row.vehicle,
      driver: row.driver,
    }));
  }

  private parseBuffer(buffer: Buffer) {
    return this.dddParser?.parse(buffer) ?? parseDddBuffer(buffer);
  }

  private mapGeneration(generation: DddGeneration): number | null {
    if (generation === 'unknown') {
      return null;
    }
    return generation;
  }

  private async notifySignatureInvalid(
    meta: IngestDddMeta,
    dddFileId: string,
    warnings: string[],
  ): Promise<void> {
    if (!meta.uploadedByUserId || !this.notifications) {
      return;
    }

    try {
      await this.notifications.createNotification({
        tenantId: meta.tenantId,
        userId: meta.uploadedByUserId,
        title: 'Tachograph file signature invalid',
        message: `Uploaded DDD file "${meta.fileName}" failed digital signature validation and was archived without compliance evaluation.`,
        type: 'tacho_signature_invalid',
        priority: 'high',
        relatedEntityType: 'DddFile',
        relatedEntityId: dddFileId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to emit tacho_signature_invalid notification: ${message}`);
    }

    if (warnings.length > 0) {
      this.logger.warn(`DDD signature warnings: ${warnings.join('; ')}`);
    }
  }

  private async archiveDddFile(tenantId: string, fileName: string, buffer: Buffer): Promise<string> {
    const root = join(process.cwd(), 'uploads', 'tachograph-ddd', tenantId);
    await mkdir(root, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(root, `${Date.now()}-${safeName}`);
    await writeFile(filePath, buffer);
    return filePath;
  }

  private mapWorkState(state: 'driving' | 'rest' | 'work' | 'available'): TachoWorkState {
    switch (state) {
      case 'driving':
        return TachoWorkState.driving;
      case 'rest':
        return TachoWorkState.rest;
      case 'available':
        return TachoWorkState.available;
      case 'work':
      default:
        return TachoWorkState.work;
    }
  }

  private async resolveDriverFromCard(tenantId: string, driverCardNo?: string) {
    if (!driverCardNo) {
      return null;
    }

    return this.prisma.driver.findFirst({
      where: {
        tenantId,
        OR: [
          { licenseNumber: driverCardNo },
          { licenseNumber: { contains: driverCardNo } },
        ],
      },
      select: { id: true },
    });
  }

  private async buildInfringements(
    tx: Prisma.TransactionClient,
    tenantId: string,
    driverId: string | undefined,
    vehicleId: string | undefined,
    dddFileId: string,
    ingestedActivities: Array<{
      startedAt: Date;
      endedAt: Date;
      durationS: number;
      workState: TachoWorkState;
    }>,
    events: ParsedDddEvent[],
  ): Promise<number> {
    const cardEvents = mapParserEventsToCardEvents(events);
    const unassignedCardEvents = cardEvents.filter(() => !driverId);
    if (unassignedCardEvents.length > 0) {
      this.logger.warn(
        `Skipping ${unassignedCardEvents.length} driving_without_card event(s): driver unresolved`,
      );
    }

    if (!driverId) {
      return 0;
    }

    const range = this.resolveEvaluationRange(ingestedActivities);
    const dbActivities = await tx.tachoActivity.findMany({
      where: {
        tenantId,
        driverId,
        startedAt: {
          gte: new Date(range.fromMs - 21 * 24 * 3600 * 1000),
          lte: new Date(range.toMs),
        },
      },
      select: {
        id: true,
        driverId: true,
        startedAt: true,
        endedAt: true,
        durationS: true,
        workState: true,
      },
      orderBy: { startedAt: 'asc' },
    });

    const candidates = runTachographRuleEngine(mapActivitiesToLike(dbActivities), range, {
      driverId,
      cardEvents,
    });

    return this.persistInfringementCandidates(
      tx,
      tenantId,
      driverId,
      vehicleId,
      dddFileId,
      candidates,
    );
  }

  private resolveEvaluationRange(
    ingestedActivities: Array<{ startedAt: Date; endedAt: Date }>,
  ): { fromMs: number; toMs: number } {
    if (ingestedActivities.length === 0) {
      const now = Date.now();
      return { fromMs: now - 24 * 3600 * 1000, toMs: now };
    }

    const fromMs = Math.min(...ingestedActivities.map((row) => row.startedAt.getTime()));
    const toMs = Math.max(...ingestedActivities.map((row) => row.endedAt.getTime()));
    return { fromMs, toMs: toMs + 1000 };
  }

  private async persistInfringementCandidates(
    tx: Prisma.TransactionClient,
    tenantId: string,
    driverId: string,
    vehicleId: string | undefined,
    dddFileId: string,
    candidates: InfringementCandidate[],
  ): Promise<number> {
    let created = 0;

    for (const candidate of candidates) {
      if (!candidate.driverId) {
        this.logger.warn(`Skipping unassigned infringement candidate type=${candidate.type}`);
        continue;
      }

      const occurredAt = new Date(candidate.occurredAtMs);
      const existing = await tx.tachoInfringement.findUnique({
        where: {
          tenantId_driverId_type_occurredAt: {
            tenantId,
            driverId,
            type: candidate.type as TachoInfringementType,
            occurredAt,
          },
        },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      await tx.tachoInfringement.create({
        data: {
          tenantId,
          driverId,
          vehicleId: vehicleId ?? null,
          dddFileId,
          type: candidate.type as TachoInfringementType,
          severity: candidate.severity as DtcSeverity,
          occurredAt,
          notes: JSON.stringify(candidate.evidence),
        },
      });
      created += 1;
    }

    return created;
  }
}
