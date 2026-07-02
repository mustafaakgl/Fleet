import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DtcSeverity,
  Prisma,
  TachoDownloadSubject,
  TachoInfringementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { safeAuditLog } from '../audit/audit-helper';
import { WEEKLY_DRIVING } from './rules/constants';
import { isoWeekKey, isoWeekStartMs } from './rules/time';
import { isDriving, sumDrivingSeconds } from './rules/activity-utils';
import { mapActivitiesToLike } from './tachograph-rules.runner';
import { computeDriverRemainingSnapshot } from './rules/remaining-driving';
import { formatDurationS, parseAssignmentDurationSeconds, parseInfringementEvidence } from './tachograph-format.util';
import { getInfringementMeta } from './tachograph-infringement-meta';

const BADGE_CACHE_TTL_MS = 60_000;
const STALE_DDD_DAYS = 7;
const CARD_DOWNLOAD_GREEN_DAYS = 21;
const CARD_DOWNLOAD_AMBER_DAYS = 28;
const ACTIVE_ASSIGNMENT_STATUSES = ['planned', 'confirmed', 'in_progress'] as const;

type BadgeCacheEntry = { expiresAt: number; value: TachographBadgesDto };

export type TachographBadgesDto = {
  openCriticalInfringements: number;
  unacknowledgedInfringements: number;
  overdueCardDownloads: number;
  overdueVuDownloads: number;
  activeCriticalDtcs: number;
};

export type InfringementListQuery = {
  driverId?: string;
  types?: TachoInfringementType[];
  severity?: DtcSeverity;
  status?: 'open' | 'acknowledged';
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class TachographApiService {
  private readonly badgeCache = new Map<string, BadgeCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getBadges(tenantId: string): Promise<TachographBadgesDto> {
    const cached = this.badgeCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const now = new Date();
    const [
      openCriticalInfringements,
      unacknowledgedInfringements,
      overdueCardDownloads,
      overdueVuDownloads,
      activeCriticalDtcs,
    ] = await Promise.all([
      this.prisma.tachoInfringement.count({
        where: { tenantId, acknowledgedAt: null, severity: DtcSeverity.critical },
      }),
      this.prisma.tachoInfringement.count({
        where: { tenantId, acknowledgedAt: null },
      }),
      this.prisma.tachoDownloadSchedule.count({
        where: {
          tenantId,
          subject: TachoDownloadSubject.driver_card,
          enabled: true,
          nextDueAt: { lt: now },
        },
      }),
      this.prisma.tachoDownloadSchedule.count({
        where: {
          tenantId,
          subject: TachoDownloadSubject.vehicle_unit,
          enabled: true,
          nextDueAt: { lt: now },
        },
      }),
      this.prisma.vehicleDtc.count({
        where: { tenantId, severity: DtcSeverity.critical, clearedAt: null },
      }),
    ]);

    const value: TachographBadgesDto = {
      openCriticalInfringements,
      unacknowledgedInfringements,
      overdueCardDownloads,
      overdueVuDownloads,
      activeCriticalDtcs,
    };

    this.badgeCache.set(tenantId, { expiresAt: Date.now() + BADGE_CACHE_TTL_MS, value });
    return value;
  }

  invalidateBadgeCache(tenantId: string): void {
    this.badgeCache.delete(tenantId);
  }

  async getComplianceOverview(tenantId: string, fromIso?: string, toIso?: string) {
    const to = toIso ? new Date(toIso) : new Date();
    const from = fromIso
      ? new Date(fromIso)
      : new Date(to.getTime() - 28 * 24 * 3600 * 1000);

    const prevSpanMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - prevSpanMs);
    const prevTo = new Date(from.getTime());

    const [
      openInfringements,
      overdueCardDownloads,
      overdueVuDownloads,
      drivers,
      weeklyTrend,
      vuSchedules,
      dddFileCount,
    ] = await Promise.all([
      this.prisma.tachoInfringement.count({
        where: { tenantId, acknowledgedAt: null, occurredAt: { gte: from, lte: to } },
      }),
      this.prisma.tachoDownloadSchedule.count({
        where: {
          tenantId,
          subject: TachoDownloadSubject.driver_card,
          enabled: true,
          nextDueAt: { lt: new Date() },
        },
      }),
      this.prisma.tachoDownloadSchedule.count({
        where: {
          tenantId,
          subject: TachoDownloadSubject.vehicle_unit,
          enabled: true,
          nextDueAt: { lt: new Date() },
        },
      }),
      this.prisma.driver.findMany({
        where: { tenantId, status: 'active' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.buildWeeklyInfringementTrend(tenantId, 12),
      this.prisma.tachoDownloadSchedule.findMany({
        where: {
          tenantId,
          subject: TachoDownloadSubject.vehicle_unit,
          enabled: true,
          vehicleId: { not: null },
        },
        include: {
          vehicle: { select: { id: true, plateNumber: true } },
        },
        orderBy: { nextDueAt: 'asc' },
        take: 50,
      }),
      this.prisma.dddFile.count({ where: { tenantId } }),
    ]);

    const driverIds = drivers.map((d) => d.id);
    const nowMs = Date.now();
    const sparklineFrom = new Date(nowMs - 7 * 24 * 3600 * 1000);
    const drivingFrom = new Date(nowMs - 28 * 24 * 3600 * 1000);

    const [activities, openByDriver, lastCardDownloads, lastActivities] = await Promise.all([
      this.prisma.tachoActivity.findMany({
        where: {
          tenantId,
          driverId: { in: driverIds },
          startedAt: { gte: drivingFrom },
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
      }),
      this.prisma.tachoInfringement.groupBy({
        by: ['driverId'],
        where: {
          tenantId,
          driverId: { in: driverIds },
          acknowledgedAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.dddFile.groupBy({
        by: ['driverId'],
        where: {
          tenantId,
          driverId: { in: driverIds },
          fileType: 'card',
        },
        _max: { capturedAt: true },
      }),
      this.prisma.tachoActivity.groupBy({
        by: ['driverId'],
        where: {
          tenantId,
          driverId: { in: driverIds },
        },
        _max: { startedAt: true },
      }),
    ]);

    const openCountByDriver = new Map(openByDriver.map((row) => [row.driverId, row._count._all]));
    const lastCardByDriver = new Map(
      lastCardDownloads
        .filter((row) => row.driverId)
        .map((row) => [row.driverId!, row._max.capturedAt]),
    );
    const lastActivityByDriver = new Map(lastActivities.map((row) => [row.driverId!, row._max.startedAt]));

    const activitiesByDriver = new Map<string, typeof activities>();
    for (const activity of activities) {
      if (!activity.driverId) continue;
      const bucket = activitiesByDriver.get(activity.driverId) ?? [];
      bucket.push(activity);
      activitiesByDriver.set(activity.driverId, bucket);
    }

    const currentWeekKey = isoWeekKey(nowMs);
    const driverMatrix = drivers.map((driver) => {
      const driverActivities = activitiesByDriver.get(driver.id) ?? [];
      const mapped = mapActivitiesToLike(
        driverActivities.map((a) => ({ ...a, driverId: a.driverId! })),
      );

      const driving28dS = sumDrivingSeconds(
        mapped.filter((a) => a.startedAtMs >= drivingFrom.getTime()),
      );

      const sparkline = this.buildDailyDrivingSparkline(
        mapped.filter((a) => a.startedAtMs >= sparklineFrom.getTime()),
        7,
      );

      const weekDrivingS = sumDrivingSeconds(
        mapped.filter((a) => isoWeekKey(a.startedAtMs) === currentWeekKey),
      );
      const weeklyRemainingS = WEEKLY_DRIVING.STANDARD - weekDrivingS;

      const lastCardAt = lastCardByDriver.get(driver.id);
      const daysSinceCardDownload = lastCardAt
        ? Math.floor((nowMs - lastCardAt.getTime()) / (24 * 3600 * 1000))
        : null;

      const stale =
        !lastCardAt ||
        nowMs - lastCardAt.getTime() > STALE_DDD_DAYS * 24 * 3600 * 1000;

      return {
        driverId: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        photoUrl: null,
        cardDownload: {
          lastAt: lastCardAt?.toISOString() ?? null,
          daysSince: daysSinceCardDownload,
          status: this.cardDownloadStatus(daysSinceCardDownload),
        },
        openInfringementCount: openCountByDriver.get(driver.id) ?? 0,
        driving28dS,
        driving28dFormatted: formatDurationS(driving28dS),
        sparklineDrivingS: sparkline,
        weeklyRemainingS,
        weeklyRemainingFormatted: formatDurationS(Math.max(0, weeklyRemainingS)),
        weeklyRemainingStatus:
          weeklyRemainingS <= 0 ? 'critical' : weeklyRemainingS < 5 * 3600 ? 'warning' : 'ok',
        lastActivityAt: lastActivityByDriver.get(driver.id)?.toISOString() ?? null,
        isEstimated: stale,
      };
    });

    const fleetComplianceScorePct = await this.computeFleetComplianceScore(
      tenantId,
      driverIds,
      from,
      to,
      prevFrom,
      prevTo,
    );

    const vuDownloads = await Promise.all(
      vuSchedules.map(async (schedule) => {
        const lastVu = schedule.vehicleId
          ? await this.prisma.dddFile.findFirst({
              where: {
                tenantId,
                vehicleId: schedule.vehicleId,
                fileType: 'vu',
              },
              orderBy: { capturedAt: 'desc' },
              select: { capturedAt: true },
            })
          : null;

        const lastAt = lastVu?.capturedAt ?? schedule.lastDownloadAt;
        const daysSince = lastAt
          ? Math.floor((nowMs - lastAt.getTime()) / (24 * 3600 * 1000))
          : schedule.intervalDays;

        return {
          vehicleId: schedule.vehicleId,
          plateNumber: schedule.vehicle?.plateNumber ?? '—',
          lastDownloadAt: lastAt?.toISOString() ?? null,
          daysSinceLastDownload: daysSince,
          intervalDays: schedule.intervalDays,
          progressPct: Math.min(100, Math.round((daysSince / 90) * 100)),
          overdue: schedule.nextDueAt < new Date(),
        };
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      range: { from: from.toISOString(), to: to.toISOString() },
      hasDddFiles: dddFileCount > 0,
      kpis: {
        openInfringements,
        overdueCardDownloads,
        overdueVuDownloads,
        fleetComplianceScorePct: fleetComplianceScorePct.current,
        fleetComplianceTrendPct: fleetComplianceScorePct.trend,
      },
      weeklyInfringementTrend: weeklyTrend,
      driverMatrix,
      vuDownloads,
    };
  }

  async listInfringements(tenantId: string, query: InfringementListQuery) {
    const page = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(200, Math.max(1, Number(query.limit))) : 50;

    const where: Prisma.TachoInfringementWhereInput = { tenantId };

    if (query.driverId) {
      where.driverId = query.driverId;
    }
    if (query.types?.length) {
      where.type = { in: query.types };
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.status === 'open') {
      where.acknowledgedAt = null;
    } else if (query.status === 'acknowledged') {
      where.acknowledgedAt = { not: null };
    }
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) {
        where.occurredAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.occurredAt.lte = new Date(query.to);
      }
    }

    const [total, rows, typeGroups] = await Promise.all([
      this.prisma.tachoInfringement.count({ where }),
      this.prisma.tachoInfringement.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { occurredAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          driver: { select: { id: true, firstName: true, lastName: true } },
          vehicle: { select: { id: true, plateNumber: true } },
          dddFile: {
            select: { id: true, fileType: true, signatureValid: true, capturedAt: true },
          },
        },
      }),
      this.prisma.tachoInfringement.groupBy({
        by: ['type', 'severity'],
        where,
        _count: { _all: true },
      }),
    ]);

    const typeBreakdown = this.aggregateTypeBreakdown(typeGroups);

    return {
      page,
      limit,
      total,
      typeBreakdown,
      items: rows.map((row) => this.mapInfringementRow(row)),
    };
  }

  async getInfringementDetail(tenantId: string, id: string) {
    const row = await this.prisma.tachoInfringement.findFirst({
      where: { id, tenantId },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, plateNumber: true } },
        dddFile: {
          select: {
            id: true,
            fileType: true,
            signatureValid: true,
            capturedAt: true,
            sha256: true,
            source: true,
          },
        },
        acknowledgedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!row) {
      throw new NotFoundException('Infringement not found');
    }

    const dayStart = new Date(row.occurredAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const activities = await this.prisma.tachoActivity.findMany({
      where: {
        tenantId,
        driverId: row.driverId,
        startedAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        workState: true,
        startedAt: true,
        endedAt: true,
        durationS: true,
      },
    });

    const evidence = parseInfringementEvidence(row.notes);
    const infringementWindow = this.resolveInfringementWindow(row.occurredAt, evidence);

    return {
      ...this.mapInfringementRow(row),
      acknowledgementNote: row.acknowledgementNote,
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: row.acknowledgedBy
        ? { id: row.acknowledgedBy.id, fullName: row.acknowledgedBy.fullName }
        : null,
      evidence,
      evidenceFormatted: this.formatEvidence(evidence),
      activityTimeline: activities.map((activity) => ({
        id: activity.id,
        workState: activity.workState,
        startedAt: activity.startedAt.toISOString(),
        endedAt: activity.endedAt.toISOString(),
        durationS: activity.durationS,
        durationFormatted: formatDurationS(activity.durationS),
      })),
      infringementWindow,
      dddFile: row.dddFile
        ? {
            id: row.dddFile.id,
            fileType: row.dddFile.fileType,
            signatureValid: row.dddFile.signatureValid,
            capturedAt: row.dddFile.capturedAt.toISOString(),
            sha256: row.dddFile.sha256,
            source: row.dddFile.source,
          }
        : null,
    };
  }

  async acknowledgeInfringement(
    tenantId: string,
    id: string,
    userId: string,
    note: string,
  ) {
    if (!note || note.trim().length < 10) {
      throw new BadRequestException('acknowledgement note must be at least 10 characters');
    }

    const existing = await this.prisma.tachoInfringement.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Infringement not found');
    }
    if (existing.acknowledgedAt) {
      throw new ConflictException('Infringement already acknowledged');
    }

    const updated = await this.prisma.tachoInfringement.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
        acknowledgementNote: note.trim(),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, plateNumber: true } },
        dddFile: {
          select: { id: true, fileType: true, signatureValid: true, capturedAt: true },
        },
      },
    });

    this.invalidateBadgeCache(tenantId);

    await safeAuditLog(this.auditService, {
      actorUserId: userId,
      action: 'tacho_infringement_acknowledged',
      entityType: 'TachoInfringement',
      entityId: id,
      summary: `Acknowledged tachograph infringement ${existing.type}`,
      metadata: {
        driverId: existing.driverId,
        type: existing.type,
        severity: existing.severity,
        note: note.trim(),
      },
    });

    return this.mapInfringementRow(updated);
  }

  private mapInfringementRow(
    row: {
      id: string;
      type: TachoInfringementType;
      severity: DtcSeverity;
      occurredAt: Date;
      acknowledgedAt: Date | null;
      notes: string | null;
      driver: { id: string; firstName: string; lastName: string } | null;
      vehicle: { id: string; plateNumber: string } | null;
      dddFile: {
        id: string;
        fileType: string;
        signatureValid: boolean | null;
        capturedAt: Date;
      } | null;
    },
  ) {
    const meta = getInfringementMeta(row.type);
    return {
      id: row.id,
      type: row.type,
      typeLabelKey: meta.labelKey,
      article: meta.article,
      severity: row.severity,
      occurredAt: row.occurredAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      status: row.acknowledgedAt ? 'acknowledged' : 'open',
      driver: row.driver,
      vehicle: row.vehicle,
      dddFile: row.dddFile
        ? {
            id: row.dddFile.id,
            fileType: row.dddFile.fileType,
            signatureValid: row.dddFile.signatureValid,
            capturedAt: row.dddFile.capturedAt.toISOString(),
          }
        : null,
      evidence: parseInfringementEvidence(row.notes),
    };
  }

  private cardDownloadStatus(daysSince: number | null): 'green' | 'amber' | 'red' | 'unknown' {
    if (daysSince === null) {
      return 'unknown';
    }
    if (daysSince <= CARD_DOWNLOAD_GREEN_DAYS) {
      return 'green';
    }
    if (daysSince <= CARD_DOWNLOAD_AMBER_DAYS) {
      return 'amber';
    }
    return 'red';
  }

  private buildDailyDrivingSparkline(
    activities: ReturnType<typeof mapActivitiesToLike>,
    days: number,
  ): number[] {
    const now = Date.now();
    const result: number[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const dayStart = new Date(now - i * 24 * 3600 * 1000);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 24 * 3600 * 1000;
      const drivingS = sumDrivingSeconds(
        activities.filter(
          (a) => a.startedAtMs >= dayStart.getTime() && a.startedAtMs < dayEnd,
        ),
      );
      result.push(drivingS);
    }
    return result;
  }

  private async buildWeeklyInfringementTrend(tenantId: string, weeks: number) {
    const nowMs = Date.now();
    const buckets: Array<{
      weekKey: string;
      weekStart: string;
      medium: number;
      critical: number;
    }> = [];

    for (let i = weeks - 1; i >= 0; i -= 1) {
      const weekStartMs = isoWeekStartMs(nowMs - i * 7 * 24 * 3600 * 1000);
      const weekEndMs = weekStartMs + 7 * 24 * 3600 * 1000;
      const weekKey = isoWeekKey(weekStartMs);

      const [medium, critical] = await Promise.all([
        this.prisma.tachoInfringement.count({
          where: {
            tenantId,
            severity: DtcSeverity.medium,
            occurredAt: { gte: new Date(weekStartMs), lt: new Date(weekEndMs) },
          },
        }),
        this.prisma.tachoInfringement.count({
          where: {
            tenantId,
            severity: DtcSeverity.critical,
            occurredAt: { gte: new Date(weekStartMs), lt: new Date(weekEndMs) },
          },
        }),
      ]);

      buckets.push({
        weekKey,
        weekStart: new Date(weekStartMs).toISOString(),
        medium,
        critical,
      });
    }

    return buckets;
  }

  private async computeFleetComplianceScore(
    tenantId: string,
    driverIds: string[],
    from: Date,
    to: Date,
    prevFrom: Date,
    prevTo: Date,
  ) {
    if (driverIds.length === 0) {
      return { current: 100, trend: 0 };
    }

    const [currentOpen, prevOpen] = await Promise.all([
      this.prisma.tachoInfringement.groupBy({
        by: ['driverId'],
        where: {
          tenantId,
          driverId: { in: driverIds },
          acknowledgedAt: null,
          occurredAt: { gte: from, lte: to },
        },
      }),
      this.prisma.tachoInfringement.groupBy({
        by: ['driverId'],
        where: {
          tenantId,
          driverId: { in: driverIds },
          acknowledgedAt: null,
          occurredAt: { gte: prevFrom, lte: prevTo },
        },
      }),
    ]);

    const currentCompliant = driverIds.length - currentOpen.length;
    const prevCompliant = driverIds.length - prevOpen.length;
    const current = Math.round((currentCompliant / driverIds.length) * 100);
    const prev = Math.round((prevCompliant / driverIds.length) * 100);

    return { current, trend: current - prev };
  }

  private aggregateTypeBreakdown(
    groups: Array<{
      type: TachoInfringementType;
      severity: DtcSeverity;
      _count: { _all: number };
    }>,
  ) {
    const byType = new Map<
      TachoInfringementType,
      { count: number; dominantSeverity: DtcSeverity }
    >();

    for (const group of groups) {
      const existing = byType.get(group.type);
      if (!existing) {
        byType.set(group.type, { count: group._count._all, dominantSeverity: group.severity });
        continue;
      }
      existing.count += group._count._all;
      if (group.severity === DtcSeverity.critical) {
        existing.dominantSeverity = DtcSeverity.critical;
      }
    }

    return Array.from(byType.entries()).map(([type, value]) => ({
      type,
      ...getInfringementMeta(type),
      count: value.count,
      dominantSeverity: value.dominantSeverity,
    }));
  }

  private resolveInfringementWindow(
    occurredAt: Date,
    evidence: Record<string, unknown> | null,
  ): { startMs: number; endMs: number } {
    const calculated = evidence?.calculatedValues;
    if (calculated && typeof calculated === 'object') {
      const values = calculated as Record<string, unknown>;
      if (typeof values.windowStartMs === 'number' && typeof values.windowEndMs === 'number') {
        return { startMs: values.windowStartMs, endMs: values.windowEndMs };
      }
    }
    const ms = occurredAt.getTime();
    return { startMs: ms, endMs: ms + 3600 * 1000 };
  }

  private formatEvidence(evidence: Record<string, unknown> | null): Array<{ label: string; value: string }> {
    if (!evidence) {
      return [];
    }
    const calculated = evidence.calculatedValues;
    if (!calculated || typeof calculated !== 'object') {
      return [];
    }
    const values = calculated as Record<string, unknown>;
    const lines: Array<{ label: string; value: string }> = [];

    for (const [key, raw] of Object.entries(values)) {
      if (typeof raw === 'number') {
        lines.push({
          label: key,
          value: key.toLowerCase().includes('s') ? formatDurationS(raw) : String(Math.round(raw)),
        });
      }
    }

    if (typeof values.drivingS === 'number' && typeof values.thresholdS === 'number') {
      lines.unshift(
        {
          label: 'calculatedDriving',
          value: formatDurationS(values.drivingS as number),
        },
        {
          label: 'limit',
          value: formatDurationS(values.thresholdS as number),
        },
      );
    }

    return lines;
  }

  async getRemainingDriving(tenantId: string) {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const activityFrom = new Date(nowMs - 14 * 24 * 3600 * 1000);

    const [drivers, activities, lastDddByDriver, todayAssignments] = await Promise.all([
      this.prisma.driver.findMany({
        where: { tenantId, status: 'active' },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.tachoActivity.findMany({
        where: {
          tenantId,
          driverId: { not: null },
          startedAt: { gte: activityFrom },
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
      }),
      this.prisma.dddFile.groupBy({
        by: ['driverId'],
        where: { tenantId, driverId: { not: null }, fileType: 'card' },
        _max: { capturedAt: true },
      }),
      this.prisma.assignment.findMany({
        where: {
          tenantId,
          workDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 24 * 3600 * 1000) },
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
        },
        select: {
          id: true,
          driverId: true,
          startTime: true,
          endTime: true,
        },
      }),
    ]);

    const activitiesByDriver = new Map<string, typeof activities>();
    for (const row of activities) {
      if (!row.driverId) continue;
      const bucket = activitiesByDriver.get(row.driverId) ?? [];
      bucket.push(row);
      activitiesByDriver.set(row.driverId, bucket);
    }

    const lastDddMap = new Map(
      lastDddByDriver
        .filter((row) => row.driverId)
        .map((row) => [row.driverId!, row._max.capturedAt]),
    );

    const plannedByDriver = new Map<string, { plannedTodayS: number; assignmentId: string }>();
    for (const assignment of todayAssignments) {
      const durationS = parseAssignmentDurationSeconds(assignment.startTime, assignment.endTime);
      const existing = plannedByDriver.get(assignment.driverId);
      if (existing) {
        existing.plannedTodayS += durationS;
      } else {
        plannedByDriver.set(assignment.driverId, {
          plannedTodayS: durationS,
          assignmentId: assignment.id,
        });
      }
    }

    const driverRows = drivers.map((driver) => {
      const driverActivities = activitiesByDriver.get(driver.id) ?? [];
      const mapped = mapActivitiesToLike(
        driverActivities.map((row) => ({ ...row, driverId: row.driverId! })),
      );
      const snapshot = computeDriverRemainingSnapshot(mapped, nowMs);
      const lastDddAt = lastDddMap.get(driver.id) ?? null;
      const daysSinceDdd = lastDddAt
        ? Math.floor((nowMs - lastDddAt.getTime()) / (24 * 3600 * 1000))
        : null;
      const isStale =
        !lastDddAt || nowMs - lastDddAt.getTime() > STALE_DDD_DAYS * 24 * 3600 * 1000;
      const planned = plannedByDriver.get(driver.id);
      const plannedTodayS = planned?.plannedTodayS ?? 0;
      const exceedsRemaining =
        plannedTodayS > 0 && plannedTodayS > snapshot.todayRemainingDrivingS;

      return {
        driverId: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        ...snapshot,
        lastDddAt: lastDddAt?.toISOString() ?? null,
        daysSinceDdd,
        isStale,
        plannedTodayS,
        exceedsRemaining,
        assignmentId: planned?.assignmentId ?? null,
      };
    });

    driverRows.sort((a, b) => a.todayRemainingDrivingS - b.todayRemainingDrivingS);

    const warnings = driverRows
      .filter((row) => row.exceedsRemaining)
      .map((row) => ({
        driverId: row.driverId,
        driverName: `${row.firstName} ${row.lastName}`,
        plannedTodayS: row.plannedTodayS,
        remainingDrivingS: row.todayRemainingDrivingS,
        assignmentId: row.assignmentId,
      }));

    return {
      generatedAt: now.toISOString(),
      hasActivityData: activities.length > 0,
      drivers: driverRows,
      warnings,
    };
  }

  async assignDddFile(tenantId: string, fileId: string, driverId: string, userId: string) {
    const file = await this.prisma.dddFile.findFirst({
      where: { id: fileId, tenantId },
      select: { id: true, driverId: true, fileType: true },
    });
    if (!file) {
      throw new NotFoundException('DDD file not found');
    }
    if (file.driverId) {
      throw new ConflictException('DDD file already assigned to a driver');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const updated = await this.prisma.dddFile.update({
      where: { id: fileId },
      data: { driverId },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId: userId,
      action: 'tacho_ddd_file_assigned',
      entityType: 'DddFile',
      entityId: fileId,
      summary: `Assigned DDD file to ${driver.firstName} ${driver.lastName}`,
      metadata: { driverId, fileType: file.fileType },
    });

    return updated;
  }
}
