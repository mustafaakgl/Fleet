import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DddFileSource,
  DtcSeverity,
  Prisma,
  TachoInfringementType,
  TachoWorkState,
} from '@prisma/client';
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

@Injectable()
export class TachographService {
  private readonly logger = new Logger(TachographService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly dddParser?: DddParserPort,
  ) {}

  async ingestDddFile(buffer: Buffer, meta: IngestDddMeta) {
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const capturedAt = meta.capturedAt ? new Date(meta.capturedAt) : new Date();

    const existing = await this.prisma.dddFile.findUnique({
      where: {
        tenantId_sha256: {
          tenantId: meta.tenantId,
          sha256,
        },
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (existing) {
      return {
        file: existing,
        deduplicated: true,
      };
    }

    const parsed = this.parseBuffer(buffer);
    const driver = await this.resolveDriverFromCard(meta.tenantId, parsed.driverCardNo);
    const storedPath = await this.archiveDddFile(meta.tenantId, meta.fileName, buffer);
    const signatureBlocksRuleEngine = parsed.signature.valid === false;

    const fileRecord = await this.prisma.$transaction(async (tx) => {
      const createdFile = await tx.dddFile.create({
        data: {
          tenantId: meta.tenantId,
          vehicleId: meta.vehicleId,
          driverId: driver?.id ?? null,
          uploadedByUserId: meta.uploadedByUserId ?? null,
          fileType: parsed.fileType,
          source: meta.source,
          capturedAt,
          storedPath,
          sizeBytes: buffer.length,
          sha256,
          generation: this.mapGeneration(parsed.generation),
          signatureValid: parsed.signature.valid,
          skippedBlocks: parsed.skippedBlocks,
        },
      });

      if (!signatureBlocksRuleEngine && parsed.activities.length > 0 && meta.vehicleId) {
        const vehicleId = meta.vehicleId;
        await tx.tachoActivity.createMany({
          data: parsed.activities.map((activity) => {
            const startedAt = new Date(activity.startedAt);
            const endedAt = new Date(startedAt.getTime() + activity.durationS * 1000);

            return {
              tenantId: meta.tenantId,
              dddFileId: createdFile.id,
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

      let infringementsCreated = 0;
      if (!signatureBlocksRuleEngine) {
        infringementsCreated = await this.buildInfringements(
          tx,
          meta.tenantId,
          driver?.id,
          meta.vehicleId,
          createdFile.id,
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

      return { createdFile, infringementsCreated };
    });

    if (signatureBlocksRuleEngine) {
      await this.notifySignatureInvalid(meta, fileRecord.createdFile.id, parsed.warnings);
    }

    return {
      file: fileRecord.createdFile,
      parsed,
      infringementsCreated: fileRecord.infringementsCreated,
      deduplicated: false,
    };
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
