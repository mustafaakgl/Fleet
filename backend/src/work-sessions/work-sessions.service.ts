import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkSessionEndReason, WorkSessionSource, WorkSessionStatus, Prisma } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { CorrectWorkSessionDto } from './dto/correct-work-session.dto';

const STALE_SESSION_HOURS = 12;

const includeDriver = {
  driver: {
    select: { id: true, userId: true, firstName: true, lastName: true, employeeNumber: true },
  },
} satisfies Prisma.WorkSessionInclude;

type WorkSessionRow = Prisma.WorkSessionGetPayload<{ include: typeof includeDriver }>;

type SessionClientRow = {
  id: string;
  driverId: string;
  startedAt: string;
  endedAt: string | null;
  originalEndAt: string | null;
  correctionReason: string | null;
  lastSeenAt: string | null;
  source: WorkSessionSource;
  endReason: WorkSessionEndReason | null;
  status: WorkSessionStatus;
  staleOpen: boolean;
  staleSince: string | null;
  driver: { id: string; firstName: string; lastName: string; employeeNumber: string; userId: string | null };
};

function staleThreshold() {
  return new Date(Date.now() - STALE_SESSION_HOURS * 60 * 60 * 1000);
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isStale(row: WorkSessionRow): boolean {
  if (row.status !== WorkSessionStatus.active) {
    return false;
  }
  const threshold = staleThreshold();
  const seenAt = row.lastSeenAt ?? row.startedAt;
  return seenAt < threshold;
}

function staleSince(row: WorkSessionRow): Date | null {
  if (!isStale(row)) {
    return null;
  }
  return row.lastSeenAt ?? row.startedAt;
}

function toClient(row: WorkSessionRow): SessionClientRow {
  return {
    id: row.id,
    driverId: row.driverId,
    startedAt: row.startedAt.toISOString(),
    endedAt: toIso(row.endedAt),
    originalEndAt: toIso(row.originalEndAt),
    correctionReason: row.correctionReason ?? null,
    lastSeenAt: toIso(row.lastSeenAt),
    source: row.source,
    endReason: row.endReason ?? null,
    status: row.status,
    staleOpen: isStale(row),
    staleSince: toIso(staleSince(row)),
    driver: {
      id: row.driver.id,
      firstName: row.driver.firstName,
      lastName: row.driver.lastName,
      employeeNumber: row.driver.employeeNumber,
      userId: row.driver.userId,
    },
  };
}

function correctionPayload(row: WorkSessionRow, dto: CorrectWorkSessionDto) {
  const correctedEndedAt = new Date(dto.ended_at);
  if (Number.isNaN(correctedEndedAt.getTime())) {
    throw new BadRequestException('Invalid corrected end time');
  }
  if (correctedEndedAt < row.startedAt) {
    throw new BadRequestException('Corrected end time must be after the start time');
  }
  return correctedEndedAt;
}

@Injectable()
export class WorkSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly driverNotify: DriverNotifyService,
  ) {}

  async getActiveSessionForDriver(driverId: string) {
    return this.prisma.workSession.findFirst({
      where: { driverId, status: WorkSessionStatus.active },
      orderBy: { startedAt: 'desc' },
      include: includeDriver,
    });
  }

  async getSessionById(id: string) {
    const row = await this.prisma.workSession.findUnique({
      where: { id },
      include: includeDriver,
    });
    if (!row) {
      throw new NotFoundException('Work session not found');
    }
    return row;
  }

  async getCurrentSessionForDriver(driverId: string) {
    const row = await this.getActiveSessionForDriver(driverId);
    return row ? toClient(row) : null;
  }

  async startSession(driverId: string, actorUserId?: string) {
    const active = await this.getActiveSessionForDriver(driverId);
    if (active) {
      return active;
    }

    const row = await this.prisma.workSession.create({
      data: {
        driverId,
        status: WorkSessionStatus.active,
        source: WorkSessionSource.manual,
        lastSeenAt: new Date(),
      },
      include: includeDriver,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'work_session.started',
      entityType: 'work_session',
      entityId: row.id,
      summary: 'Work session started',
    });

    return row;
  }

  async heartbeatSession(driverId: string) {
    const active = await this.getActiveSessionForDriver(driverId);
    if (!active) {
      return null;
    }

    const row = await this.prisma.workSession.update({
      where: { id: active.id },
      data: { lastSeenAt: new Date() },
      include: includeDriver,
    });
    return row;
  }

  async endSession(driverId: string, reason: WorkSessionEndReason, actorUserId?: string) {
    const active = await this.getActiveSessionForDriver(driverId);
    if (!active) {
      return null;
    }

    const row = await this.prisma.workSession.update({
      where: { id: active.id },
      data: {
        status: WorkSessionStatus.ended,
        endedAt: new Date(),
        endReason: reason,
        lastSeenAt: new Date(),
      },
      include: includeDriver,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'work_session.ended',
      entityType: 'work_session',
      entityId: row.id,
      summary: `Work session ended (${reason})`,
      metadata: { reason },
    });

    return row;
  }

  async correctSessionById(id: string, dto: CorrectWorkSessionDto, actorUserId?: string) {
    const row = await this.getSessionById(id);
    return this.applyCorrection(row, dto, actorUserId, 'office_correction');
  }

  async correctActiveSessionForDriver(driverId: string, dto: CorrectWorkSessionDto, actorUserId?: string) {
    const row = await this.getActiveSessionForDriver(driverId);
    if (!row) {
      throw new NotFoundException('Work session not found');
    }
    return this.applyCorrection(row, dto, actorUserId, 'driver_reconciled');
  }

  async listSessions(filters: {
    driverId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: 'active' | 'ended';
    staleOpen?: boolean;
  }) {
    const where: Prisma.WorkSessionWhereInput = {};

    if (filters.driverId) {
      where.driverId = filters.driverId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.staleOpen) {
      const threshold = staleThreshold();
      where.status = WorkSessionStatus.active;
      where.OR = [
        { lastSeenAt: { lt: threshold } },
        { lastSeenAt: null, startedAt: { lt: threshold } },
      ];
    }
    if (filters.dateFrom || filters.dateTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.dateFrom) {
        const parsed = new Date(filters.dateFrom);
        parsed.setHours(0, 0, 0, 0);
        range.gte = parsed;
      }
      if (filters.dateTo) {
        const parsed = new Date(filters.dateTo);
        parsed.setHours(23, 59, 59, 999);
        range.lte = parsed;
      }
      where.startedAt = range;
    }

    const rows = await this.prisma.workSession.findMany({
      where,
      include: includeDriver,
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    return rows.map(toClient);
  }

  async applyCorrection(
    row: WorkSessionRow,
    dto: CorrectWorkSessionDto,
    actorUserId: string | undefined,
    source: WorkSessionSource,
  ) {
    const correctedEndedAt = correctionPayload(row, dto);
    const originalEndAt = row.endedAt ?? row.originalEndAt ?? null;

    const updated = await this.prisma.workSession.update({
      where: { id: row.id },
      data: {
        status: WorkSessionStatus.ended,
        endedAt: correctedEndedAt,
        originalEndAt,
        correctionReason: dto.reason,
        endReason: WorkSessionEndReason.manual,
        source,
        lastSeenAt: correctedEndedAt,
      },
      include: includeDriver,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'work_session.corrected',
      entityType: 'work_session',
      entityId: updated.id,
      summary: 'Work session corrected',
      metadata: {
        originalEndAt: updated.originalEndAt?.toISOString() ?? null,
        endedAt: updated.endedAt?.toISOString() ?? null,
        reason: dto.reason,
        source,
      },
    });

    if (source === 'office_correction' && updated.driver.userId) {
      this.driverNotify.notifyUserSafely({
        userId: updated.driver.userId,
        key: 'work_session_corrected',
        type: 'system',
        relatedEntityType: 'work_session',
        relatedEntityId: updated.id,
      });
    }

    return toClient(updated);
  }
}
