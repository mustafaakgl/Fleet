import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FineMatchType,
  FineStatus,
  Prisma,
} from '@prisma/client';
import type { Response } from 'express';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { FineDocumentStorageService } from '../storage/fine-document-storage.service';
import { AssignFineDriverDto } from './dto/assign-fine-driver.dto';
import { CreateFineDto } from './dto/create-fine.dto';
import { UpdateFineStatusDto } from './dto/update-fine-status.dto';
import { FineMatchingService } from './fine-matching.service';
import {
  daysUntilDate,
  DEFAULT_MATCH_TOLERANCE_MINUTES,
  DRIVER_ACK_ESCALATION_HOURS,
  isValidFineTransition,
  PAYMENT_REMINDER_DAYS,
  TERMINAL_FINE_STATUSES,
} from './fine-management.util';

type UploadedDocument = { originalname: string; buffer: Buffer };

const includeRelations = {
  vehicle: { select: { id: true, plateNumber: true, internalCode: true } },
  driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, userId: true } },
  matchedWorkSession: {
    select: { id: true, startedAt: true, endedAt: true, status: true },
  },
  matchedAssignment: {
    select: {
      id: true,
      workDate: true,
      startTime: true,
      endTime: true,
      company: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { id: true, fullName: true, email: true } },
  statusLogs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.FineInclude;

@Injectable()
export class FinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: FineMatchingService,
    private readonly documentStorage: FineDocumentStorageService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly driverNotify: DriverNotifyService,
    private readonly push: PushNotificationsService,
  ) {}

  previewMatch(vehicleId: string, violationAt: string, toleranceMinutes?: number) {
    const at = new Date(violationAt);
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('Invalid violation_at');
    }
    return this.matching.preview(
      vehicleId,
      at,
      toleranceMinutes ?? DEFAULT_MATCH_TOLERANCE_MINUTES,
    );
  }

  async list(query: {
    status?: FineStatus;
    vehicle_id?: string;
    driver_id?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.FineWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.vehicle_id) where.vehicleId = query.vehicle_id;
    if (query.driver_id) where.driverId = query.driver_id;
    if (query.from || query.to) {
      where.violationAt = {};
      if (query.from) where.violationAt.gte = new Date(query.from);
      if (query.to) where.violationAt.lte = new Date(query.to);
    }

    const rows = await this.prisma.fine.findMany({
      where,
      orderBy: [{ violationAt: 'desc' }],
      include: includeRelations,
    });
    return rows.map((row) => this.toClient(row));
  }

  async listDueSoon(days = 7) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(limit.getDate() + days);

    const rows = await this.prisma.fine.findMany({
      where: {
        paymentDueDate: { gte: today, lte: limit },
        status: { notIn: TERMINAL_FINE_STATUSES },
      },
      orderBy: [{ paymentDueDate: 'asc' }],
      include: includeRelations,
    });

    return rows.map((row) => ({
      ...this.toClient(row),
      days_until_due: row.paymentDueDate ? daysUntilDate(row.paymentDueDate) : null,
      is_urgent: row.paymentDueDate ? daysUntilDate(row.paymentDueDate) <= 7 : false,
    }));
  }

  async getStats() {
    const [byStatus, byCategory, byVehicle, byDriver] = await Promise.all([
      this.prisma.fine.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.fine.groupBy({ by: ['violationCategory'], _count: { _all: true } }),
      this.prisma.fine.groupBy({
        by: ['vehicleId'],
        _count: { _all: true },
        orderBy: { _count: { vehicleId: 'desc' } },
        take: 10,
      }),
      this.prisma.fine.groupBy({
        by: ['driverId'],
        where: { driverId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { driverId: 'desc' } },
        take: 10,
      }),
    ]);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: byVehicle.map((row) => row.vehicleId) } },
      select: { id: true, plateNumber: true },
    });
    const drivers = await this.prisma.driver.findMany({
      where: { id: { in: byDriver.map((row) => row.driverId!).filter(Boolean) } },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    });

    return {
      by_status: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      by_category: Object.fromEntries(byCategory.map((row) => [row.violationCategory, row._count._all])),
      top_vehicles: byVehicle.map((row) => ({
        vehicle_id: row.vehicleId,
        plate_number: vehicles.find((v) => v.id === row.vehicleId)?.plateNumber ?? row.vehicleId,
        count: row._count._all,
      })),
      top_drivers: byDriver.map((row) => {
        const driver = drivers.find((d) => d.id === row.driverId);
        return {
          driver_id: row.driverId,
          driver_name: driver ? `${driver.firstName} ${driver.lastName}`.trim() : null,
          employee_number: driver?.employeeNumber ?? null,
          count: row._count._all,
        };
      }),
    };
  }

  async getDriverFineCount(driverId: string): Promise<number> {
    return this.prisma.fine.count({ where: { driverId } });
  }

  async getById(id: string) {
    const row = await this.prisma.fine.findUnique({
      where: { id },
      include: includeRelations,
    });
    if (!row) throw new NotFoundException('Fine not found');
    return this.toClient(row);
  }

  async create(
    dto: CreateFineDto,
    actorUserId: string,
    tenantId: string,
    document?: UploadedDocument,
  ) {
    const violationAt = new Date(dto.violation_at);
    if (Number.isNaN(violationAt.getTime())) {
      throw new BadRequestException('Invalid violation_at');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicle_id },
      select: { id: true, tenantId: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const tolerance = dto.tolerance_minutes ?? DEFAULT_MATCH_TOLERANCE_MINUTES;
    const preview = await this.matching.preview(dto.vehicle_id, violationAt, tolerance);

    let driverId = dto.driver_id ?? null;
    let matchType: FineMatchType = FineMatchType.unmatched;
    let matchedWorkSessionId = dto.matched_work_session_id ?? null;
    let matchedAssignmentId = dto.matched_assignment_id ?? null;

    if (driverId) {
      matchType = FineMatchType.manual;
    } else if (preview.suggested) {
      driverId = preview.suggested.driver_id;
      matchedWorkSessionId = preview.suggested.work_session_id;
      matchedAssignmentId = preview.suggested.assignment_id;
      matchType = FineMatchType.auto;
    } else if (preview.candidates.length > 1) {
      matchType = FineMatchType.manual;
    }

    let documentStoredPath: string | undefined;
    let documentMimeType: string | undefined;
    if (document) {
      const saved = await this.documentStorage.saveEncrypted(document.originalname, document.buffer);
      documentStoredPath = saved.storedPath;
      documentMimeType = saved.mimeType;
    }

    const status = driverId ? FineStatus.fahrer_zugeordnet : FineStatus.neu;

    const created = await this.prisma.$transaction(async (tx) => {
      const fine = await tx.fine.create({
        data: {
          tenantId: vehicle.tenantId ?? tenantId,
          vehicleId: dto.vehicle_id,
          driverId,
          matchType,
          matchedWorkSessionId,
          matchedAssignmentId,
          violationAt,
          violationLocation: dto.violation_location,
          violationType: dto.violation_type,
          violationCategory: dto.violation_category,
          amount: dto.amount,
          paymentDueDate: dto.payment_due_date ? new Date(dto.payment_due_date) : undefined,
          noticeDate: dto.notice_date ? new Date(dto.notice_date) : undefined,
          documentStoredPath,
          documentMimeType,
          status,
          notes: dto.notes,
          matchCandidates: preview.candidates as unknown as Prisma.InputJsonValue,
          matchToleranceMinutes: tolerance,
          createdByUserId: actorUserId,
        },
        include: includeRelations,
      });

      await tx.fineStatusLog.create({
        data: {
          tenantId: fine.tenantId,
          fineId: fine.id,
          fromStatus: null,
          toStatus: FineStatus.neu,
          changedByUserId: actorUserId,
          note: 'Bußgeld erfasst',
        },
      });

      if (driverId) {
        await tx.fineStatusLog.create({
          data: {
            tenantId: fine.tenantId,
            fineId: fine.id,
            fromStatus: FineStatus.neu,
            toStatus: FineStatus.fahrer_zugeordnet,
            changedByUserId: actorUserId,
            note:
              matchType === FineMatchType.auto
                ? 'Automatische Fahrerzuordnung'
                : 'Manuelle Fahrerzuordnung',
          },
        });
      }

      return fine;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'fine.created',
      entityType: 'Fine',
      entityId: created.id,
      summary: `Fine created for vehicle ${created.vehicle.plateNumber}`,
      metadata: { match_type: matchType, driver_id: driverId },
    });

    return this.toClient(created);
  }

  async assignDriver(fineId: string, dto: AssignFineDriverDto, actorUserId: string) {
    const fine = await this.prisma.fine.findUnique({ where: { id: fineId } });
    if (!fine) throw new NotFoundException('Fine not found');

    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driver_id },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const assignmentData = {
      driverId: dto.driver_id,
      matchType: FineMatchType.manual,
      matchedWorkSessionId: dto.matched_work_session_id ?? null,
      matchedAssignmentId: dto.matched_assignment_id ?? null,
    };

    if (fine.status === FineStatus.neu) {
      const updated = await this.transitionStatus(
        fineId,
        FineStatus.fahrer_zugeordnet,
        actorUserId,
        dto.note ?? 'Fahrer manuell zugeordnet',
        assignmentData,
        FineStatus.neu,
      );
      return this.toClient(updated);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fine.update({
        where: { id: fineId },
        data: assignmentData,
        include: includeRelations,
      });
      await tx.fineStatusLog.create({
        data: {
          tenantId: fine.tenantId,
          fineId,
          fromStatus: fine.status,
          toStatus: fine.status,
          changedByUserId: actorUserId,
          note: dto.note ?? 'Fahrerzuordnung aktualisiert',
        },
      });
      return row;
    });

    return this.toClient(updated);
  }

  async notifyDriver(fineId: string, actorUserId: string) {
    const fine = await this.prisma.fine.findUnique({
      where: { id: fineId },
      include: {
        driver: { select: { id: true, userId: true, tenantId: true, firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true } },
      },
    });
    if (!fine) throw new NotFoundException('Fine not found');
    if (!fine.driverId || !fine.driver?.userId) {
      throw new BadRequestException('Assign a driver before notifying');
    }

    const updated = await this.transitionStatus(
      fineId,
      FineStatus.fahrer_benachrichtigt,
      actorUserId,
      'Fahrer benachrichtigt',
      { driverNotifiedAt: new Date() },
      fine.status,
    );

    await this.driverNotify.notifyUser({
      userId: fine.driver.userId,
      key: 'fine_assigned',
      type: 'system',
      priority: 'high',
      params: {
        plate: fine.vehicle.plateNumber,
        date: fine.violationAt.toISOString().slice(0, 10),
      },
      relatedEntityType: 'Fine',
      relatedEntityId: fineId,
    });

    await this.push.sendToUser(fine.driver.userId, {
      title: 'Bußgeldbescheid',
      body: `Neues Bußgeld für ${fine.vehicle.plateNumber} — bitte in der App bestätigen.`,
      data: { type: 'fine_assigned', fineId },
    });

    return this.toClient(updated);
  }

  async updateStatus(fineId: string, dto: UpdateFineStatusDto, actorUserId: string) {
    const fine = await this.prisma.fine.findUnique({ where: { id: fineId } });
    if (!fine) throw new NotFoundException('Fine not found');
    if (!isValidFineTransition(fine.status, dto.status)) {
      throw new BadRequestException(`Invalid status transition ${fine.status} → ${dto.status}`);
    }

    const updated = await this.transitionStatus(
      fineId,
      dto.status,
      actorUserId,
      dto.note,
      {},
      fine.status,
    );
    return this.toClient(updated);
  }

  async getDriverFines(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const rows = await this.prisma.fine.findMany({
      where: {
        driverId: driver.id,
        status: { in: [FineStatus.fahrer_benachrichtigt, FineStatus.bezahlt, FineStatus.widerspruch, FineStatus.abgeschlossen] },
      },
      orderBy: { violationAt: 'desc' },
      include: includeRelations,
    });

    return rows.map((row) =>
      this.toClient(row, {
        driverSelf: true,
        pending_ack:
          row.status === FineStatus.fahrer_benachrichtigt && !row.driverAcknowledgedAt,
      }),
    );
  }

  async acknowledgeFine(userId: string, fineId: string, ackMetadataRaw?: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true, tenantId: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const fine = await this.prisma.fine.findUnique({ where: { id: fineId } });
    if (!fine) throw new NotFoundException('Fine not found');
    if (fine.driverId !== driver.id) {
      throw new ForbiddenException('This fine is not assigned to you');
    }
    if (fine.status !== FineStatus.fahrer_benachrichtigt) {
      throw new BadRequestException('Fine is not awaiting driver acknowledgement');
    }
    if (fine.driverAcknowledgedAt) {
      return this.getById(fineId);
    }

    let driverAckMetadata: Prisma.InputJsonValue | undefined;
    if (ackMetadataRaw) {
      try {
        driverAckMetadata = JSON.parse(ackMetadataRaw) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('ack_metadata must be valid JSON');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fine.update({
        where: { id: fineId },
        data: {
          driverAcknowledgedAt: new Date(),
          driverAckMetadata,
        },
        include: includeRelations,
      });

      await tx.fineStatusLog.create({
        data: {
          tenantId: driver.tenantId,
          fineId,
          fromStatus: fine.status,
          toStatus: fine.status,
          changedByDriverId: driver.id,
          note: 'Fahrer hat Bußgeld zur Kenntnis genommen',
        },
      });

      return row;
    });

    await safeAuditLog(this.auditService, {
      action: 'fine.acknowledged',
      entityType: 'Fine',
      entityId: fineId,
      summary: 'Driver acknowledged fine notice',
    });

    return this.toClient(updated, { driverSelf: true });
  }

  async streamDocument(
    fineId: string,
    actorUserId: string,
    actorRole: string,
    res: Response,
    options?: { driverSelfUserId?: string },
  ) {
    const fine = await this.prisma.fine.findUnique({
      where: { id: fineId },
      include: { driver: { select: { userId: true } } },
    });
    if (!fine || !fine.documentStoredPath) throw new NotFoundException('Document not found');

    const isAdmin = actorRole === 'admin' || actorRole === 'office';
    const isDriverSelf = options?.driverSelfUserId && fine.driver?.userId === options.driverSelfUserId;
    if (!isAdmin && !isDriverSelf) {
      throw new ForbiddenException('Document access denied');
    }

    const payload = await this.documentStorage.readDecrypted(fine.documentStoredPath);
    if (!payload) throw new NotFoundException('Document file missing');

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'fine.document_viewed',
      entityType: 'Fine',
      entityId: fineId,
    });

    res.setHeader('Content-Type', fine.documentMimeType ?? payload.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(payload.buffer);
  }

  async runDailyJobs(referenceDate = new Date()) {
    let paymentReminders = 0;
    let driverEscalations = 0;

    for (const days of PAYMENT_REMINDER_DAYS) {
      const target = new Date(referenceDate);
      target.setHours(0, 0, 0, 0);
      target.setDate(target.getDate() + days);

      const fines = await this.prisma.fine.findMany({
        where: {
          paymentDueDate: target,
          status: { notIn: TERMINAL_FINE_STATUSES },
        },
      });

      for (const fine of fines) {
        if (fine.lastPaymentReminderDays === days && fine.lastPaymentReminderSentAt) {
          const sameDay =
            fine.lastPaymentReminderSentAt.toDateString() === referenceDate.toDateString();
          if (sameDay) continue;
        }

        await this.notifications.notifyAdminsAndOffice({
          title: `Bußgeld: Zahlungsfrist in ${days} Tag(en)`,
          message: `Bußgeld ${fine.id}: Zahlungsfrist läuft in ${days} Tag(en) ab.`,
          type: 'system',
          priority: days <= 3 ? 'high' : 'medium',
          relatedEntityType: 'Fine',
          relatedEntityId: fine.id,
        });

        await this.prisma.fine.update({
          where: { id: fine.id },
          data: {
            lastPaymentReminderDays: days,
            lastPaymentReminderSentAt: referenceDate,
          },
        });
        paymentReminders += 1;
      }
    }

    const escalationCutoff = new Date(
      referenceDate.getTime() - DRIVER_ACK_ESCALATION_HOURS * 3_600_000,
    );
    const pendingAck = await this.prisma.fine.findMany({
      where: {
        status: FineStatus.fahrer_benachrichtigt,
        driverNotifiedAt: { lte: escalationCutoff },
        driverAcknowledgedAt: null,
        OR: [{ lastDriverEscalationSentAt: null }, { lastDriverEscalationSentAt: { lt: escalationCutoff } }],
      },
    });

    for (const fine of pendingAck) {
      await this.notifications.notifyAdminsAndOffice({
        title: 'Bußgeld: Fahrer hat nicht bestätigt',
        message: `Bußgeld ${fine.id}: Fahrer hat innerhalb von 48h nicht bestätigt.`,
        type: 'system',
        priority: 'high',
        relatedEntityType: 'Fine',
        relatedEntityId: fine.id,
      });
      await this.prisma.fine.update({
        where: { id: fine.id },
        data: { lastDriverEscalationSentAt: referenceDate },
      });
      driverEscalations += 1;
    }

    return { paymentReminders, driverEscalations };
  }

  private async transitionStatus(
    fineId: string,
    toStatus: FineStatus,
    actorUserId: string,
    note: string | undefined,
    data: Prisma.FineUpdateInput,
    fromStatus?: FineStatus,
  ) {
    const fine = await this.prisma.fine.findUnique({ where: { id: fineId } });
    if (!fine) throw new NotFoundException('Fine not found');

    const previous = fromStatus ?? fine.status;
    if (toStatus !== previous && !isValidFineTransition(previous, toStatus)) {
      throw new BadRequestException(`Invalid status transition ${previous} → ${toStatus}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.fine.update({
        where: { id: fineId },
        data: { status: toStatus, ...data },
        include: includeRelations,
      });

      if (toStatus !== previous) {
        await tx.fineStatusLog.create({
          data: {
            tenantId: fine.tenantId,
            fineId,
            fromStatus: previous,
            toStatus,
            changedByUserId: actorUserId,
            note,
          },
        });
      }

      return row;
    });
  }

  private toClient(
    row: Prisma.FineGetPayload<{ include: typeof includeRelations }>,
    options?: { driverSelf?: boolean; pending_ack?: boolean },
  ) {
    const documentUrl = row.documentStoredPath
      ? options?.driverSelf
        ? `/driver/fines/${row.id}/document`
        : `/fines/${row.id}/document`
      : null;

    return {
      id: row.id,
      vehicle_id: row.vehicleId,
      vehicle: {
        id: row.vehicle.id,
        plate_number: row.vehicle.plateNumber,
        internal_code: row.vehicle.internalCode,
      },
      driver_id: row.driverId,
      driver: row.driver
        ? {
            id: row.driver.id,
            name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
            employee_number: row.driver.employeeNumber,
          }
        : null,
      match_type: row.matchType,
      matched_work_session_id: row.matchedWorkSessionId,
      matched_work_session: row.matchedWorkSession
        ? {
            id: row.matchedWorkSession.id,
            started_at: row.matchedWorkSession.startedAt.toISOString(),
            ended_at: row.matchedWorkSession.endedAt?.toISOString() ?? null,
            status: row.matchedWorkSession.status,
          }
        : null,
      matched_assignment_id: row.matchedAssignmentId,
      matched_assignment: row.matchedAssignment
        ? {
            id: row.matchedAssignment.id,
            work_date: row.matchedAssignment.workDate.toISOString().slice(0, 10),
            start_time: row.matchedAssignment.startTime,
            end_time: row.matchedAssignment.endTime,
            company_name: row.matchedAssignment.company.name,
          }
        : null,
      violation_at: row.violationAt.toISOString(),
      violation_location: row.violationLocation,
      violation_type: row.violationType,
      violation_category: row.violationCategory,
      amount: row.amount ? Number(row.amount.toString()) : null,
      payment_due_date: row.paymentDueDate?.toISOString().slice(0, 10) ?? null,
      notice_date: row.noticeDate?.toISOString().slice(0, 10) ?? null,
      status: row.status,
      notes: row.notes,
      match_candidates: row.matchCandidates,
      match_tolerance_minutes: row.matchToleranceMinutes,
      driver_notified_at: row.driverNotifiedAt?.toISOString() ?? null,
      driver_acknowledged_at: row.driverAcknowledgedAt?.toISOString() ?? null,
      pending_ack: options?.pending_ack ?? false,
      days_until_due: row.paymentDueDate ? daysUntilDate(row.paymentDueDate) : null,
      document_url: documentUrl,
      created_by: row.createdBy
        ? { id: row.createdBy.id, name: row.createdBy.fullName, email: row.createdBy.email }
        : null,
      status_logs: row.statusLogs.map((log) => ({
        id: log.id,
        from_status: log.fromStatus,
        to_status: log.toStatus,
        changed_by_user_id: log.changedByUserId,
        changed_by_driver_id: log.changedByDriverId,
        note: log.note,
        created_at: log.createdAt.toISOString(),
      })),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
