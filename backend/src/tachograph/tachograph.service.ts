import { Injectable, Logger } from '@nestjs/common';
import { DtcSeverity } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { parseDddBuffer, type ParsedDddDailyTotal } from './ddd/ddd-parser';

type IngestDddMeta = {
  tenantId: string;
  uploadedByUserId?: string;
  vehicleId?: string;
  fileName: string;
  capturedAt?: string;
};

type InfringementType =
  | 'daily_driving_exceeded'
  | 'insufficient_daily_rest'
  | 'insufficient_break'
  | 'exceeded_weekly_driving'
  | 'exceeded_two_week_driving';

@Injectable()
export class TachographService {
  private readonly logger = new Logger(TachographService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestDddFile(buffer: Buffer, meta: IngestDddMeta) {
    const db = this.prisma as any;
    const parsed = parseDddBuffer(buffer);
    const capturedAt = meta.capturedAt ? new Date(meta.capturedAt) : new Date();

    const driver = await this.resolveDriverFromCard(meta.tenantId, parsed.driverCardNo);

    const storedPath = await this.archiveDddFile(meta.tenantId, meta.fileName, buffer);

    const fileRecord = await db.dddFile.create({
      data: {
        tenantId: meta.tenantId,
        vehicleId: meta.vehicleId,
        driverId: driver?.id ?? null,
        fileType: parsed.fileType,
        capturedAt,
        storedPath,
        sizeBytes: buffer.length,
      },
    });

    if (parsed.activities.length > 0 && meta.vehicleId) {
      await db.tachoActivity.createMany({
        data: parsed.activities.map((activity) => {
          const startedAt = new Date(activity.startedAt);
          const endedAt = new Date(startedAt.getTime() + activity.durationS * 1000);

          return {
            tenantId: meta.tenantId,
            vehicleId: meta.vehicleId ?? 'unknown-vehicle',
            driverId: driver?.id ?? null,
            driverCardNo: parsed.driverCardNo ?? null,
            workState: this.mapWorkState(activity.state),
            startedAt,
            endedAt,
            durationS: activity.durationS,
          };
        }),
      });
    } else if (parsed.activities.length > 0) {
      this.logger.warn('Skipping TachoActivity writes: vehicleId is missing');
    }

    const infringements = await this.buildInfringements(
      meta.tenantId,
      driver?.id,
      meta.vehicleId,
      parsed.dailyTotals,
      parsed.events,
    );

    return {
      file: fileRecord,
      parsed,
      infringementsCreated: infringements,
    };
  }

  async listDddFiles(tenantId: string) {
    const db = this.prisma as any;
    return db.dddFile.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 200,
    });
  }

  private async archiveDddFile(tenantId: string, fileName: string, buffer: Buffer): Promise<string> {
    const root = join(process.cwd(), 'uploads', 'tachograph-ddd', tenantId);
    await mkdir(root, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(root, `${Date.now()}-${safeName}`);
    await writeFile(filePath, buffer);
    return filePath;
  }

  private mapWorkState(state: 'driving' | 'rest' | 'work' | 'available'): 'driving' | 'rest' | 'work' | 'available' {
    switch (state) {
      case 'driving':
        return 'driving';
      case 'rest':
        return 'rest';
      case 'available':
        return 'available';
      case 'work':
      default:
        return 'work';
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
    tenantId: string,
    driverId: string | undefined,
    vehicleId: string | undefined,
    dailyTotals: ParsedDddDailyTotal[],
    events: Array<{ type: 'overspeed' | 'fault' | 'event'; occurredAt: string; severity?: 'medium' | 'critical'; durationS?: number }>,
  ): Promise<number> {
    if (!driverId) {
      this.logger.warn('Skipping infringement creation: driver could not be resolved from card number');
      return 0;
    }

    const candidates: Array<{
      type: InfringementType;
      occurredAt: Date;
      severity: DtcSeverity;
    }> = [];

    for (const row of dailyTotals) {
      const occurredAt = new Date(row.date);
      if (row.drivingS > 9 * 3600) {
        candidates.push({
          type: 'daily_driving_exceeded',
          occurredAt,
          severity: row.drivingS > 10 * 3600 ? DtcSeverity.critical : DtcSeverity.medium,
        });
      }

      if (row.restS > 0 && row.restS < 11 * 3600) {
        candidates.push({
          type: 'insufficient_daily_rest',
          occurredAt,
          severity: row.restS < 9 * 3600 ? DtcSeverity.critical : DtcSeverity.medium,
        });
      }
    }

    const weeklyByIso = new Map<string, number>();
    for (const row of dailyTotals) {
      const date = new Date(row.date);
      const weekKey = `${date.getUTCFullYear()}-${this.getIsoWeek(date)}`;
      weeklyByIso.set(weekKey, (weeklyByIso.get(weekKey) ?? 0) + row.drivingS);
    }

    for (const [weekKey, drivingS] of weeklyByIso.entries()) {
      if (drivingS > 56 * 3600) {
        const [year, week] = weekKey.split('-').map((v) => Number(v));
        const occurredAt = this.isoWeekStart(year, week);
        candidates.push({
          type: 'exceeded_weekly_driving',
          occurredAt,
          severity: drivingS > 60 * 3600 ? DtcSeverity.critical : DtcSeverity.medium,
        });
      }
    }

    const twoWeekKeys = Array.from(weeklyByIso.keys()).sort();
    for (let i = 1; i < twoWeekKeys.length; i += 1) {
      const total = (weeklyByIso.get(twoWeekKeys[i - 1]) ?? 0) + (weeklyByIso.get(twoWeekKeys[i]) ?? 0);
      if (total > 90 * 3600) {
        const [year, week] = twoWeekKeys[i].split('-').map((v) => Number(v));
        candidates.push({
          type: 'exceeded_two_week_driving',
          occurredAt: this.isoWeekStart(year, week),
          severity: total > 96 * 3600 ? DtcSeverity.critical : DtcSeverity.medium,
        });
      }
    }

    for (const event of events) {
      if (event.type !== 'overspeed') {
        continue;
      }

      if ((event.durationS ?? 0) >= 15 * 60) {
        candidates.push({
          type: 'insufficient_break',
          occurredAt: new Date(event.occurredAt),
          severity: event.severity === 'critical' ? DtcSeverity.critical : DtcSeverity.medium,
        });
      }
    }

    let created = 0;

    for (const candidate of candidates) {
      const db = this.prisma as any;
      const existing = await db.tachoInfringement.findFirst({
        where: {
          tenantId,
          driverId,
          type: candidate.type,
          occurredAt: candidate.occurredAt,
        },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      await db.tachoInfringement.create({
        data: {
          tenantId,
          driverId,
          vehicleId: vehicleId ?? null,
          type: candidate.type,
          severity: candidate.severity,
          occurredAt: candidate.occurredAt,
        },
      });
      created += 1;
    }

    return created;
  }

  private getIsoWeek(date: Date): number {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private isoWeekStart(year: number, week: number): Date {
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const start = new Date(simple);
    if (dow <= 4 && dow > 0) {
      start.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    } else {
      start.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    }
    return start;
  }
}
