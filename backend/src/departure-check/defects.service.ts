import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DefectSeverity,
  DefectSource,
  DefectStatus,
  NotificationPriority,
  Prisma,
  VehicleStatus,
} from '@prisma/client';
import type { Response } from 'express';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DefectPhotoStorageService } from '../storage/defect-photo-storage.service';
import { UpdateDefectStatusDto } from './dto/update-defect-status.dto';
import { ReportDefectDto } from './dto/report-defect.dto';
import { isValidDefectTransition, MAX_DEFECT_PHOTOS } from './departure-check.util';

type UploadedPhoto = { originalname: string; buffer: Buffer };

const includeRelations = {
  vehicle: { select: { id: true, plateNumber: true, internalCode: true, status: true } },
  reportedBy: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, userId: true } },
  confirmationDriver: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true, userId: true },
  },
  serviceRecord: {
    select: { id: true, repairCompany: true, date: true, serviceType: true },
  },
  statusLogs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.DefectInclude;

@Injectable()
export class DefectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoStorage: DefectPhotoStorageService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly driverNotify: DriverNotifyService,
    private readonly push: PushNotificationsService,
  ) {}

  async list(query: {
    vehicle_id?: string;
    status?: DefectStatus;
    severity?: DefectSeverity;
    driver_id?: string;
  }) {
    const where: Prisma.DefectWhereInput = { anonymizedAt: null };
    if (query.vehicle_id) where.vehicleId = query.vehicle_id;
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.driver_id) where.reportedByDriverId = query.driver_id;

    const rows = await this.prisma.defect.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      include: includeRelations,
    });

    return rows.map((row) => this.toClient(row, { includePhotoUrls: true }));
  }

  async listForVehicle(vehicleId: string, openOnly = false) {
    return this.list({
      vehicle_id: vehicleId,
      ...(openOnly ? { status: undefined } : {}),
    }).then((rows) =>
      openOnly ? rows.filter((row) => row.status !== DefectStatus.bestaetigt) : rows,
    );
  }

  async getById(id: string) {
    const row = await this.prisma.defect.findUnique({
      where: { id },
      include: includeRelations,
    });
    if (!row || row.anonymizedAt) throw new NotFoundException('Defect not found');
    return this.toClient(row, { includePhotoUrls: true });
  }

  async listRepairCompanies(): Promise<string[]> {
    const rows = await this.prisma.serviceRecord.findMany({
      distinct: ['repairCompany'],
      select: { repairCompany: true },
      orderBy: { repairCompany: 'asc' },
    });
    return rows.map((row) => row.repairCompany).filter(Boolean);
  }

  async reportManualDefect(
    userId: string,
    dto: ReportDefectDto,
    photos: UploadedPhoto[],
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true, tenantId: true, userId: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    if (!photos.length) {
      throw new BadRequestException('At least one photo is required');
    }
    if (photos.length > MAX_DEFECT_PHOTOS) {
      throw new BadRequestException(`Maximum ${MAX_DEFECT_PHOTOS} photos allowed`);
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicle_id },
      select: { id: true, tenantId: true, plateNumber: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const storedPaths = await Promise.all(
      photos.map((photo, index) =>
        this.photoStorage.saveEncrypted(photo.originalname, `manual_${index}`, photo.buffer),
      ),
    );

    const defect = await this.prisma.$transaction(async (tx) => {
      const created = await tx.defect.create({
        data: {
          tenantId: driver.tenantId,
          vehicleId: vehicle.id,
          reportedByDriverId: driver.id,
          source: DefectSource.manual_report,
          title: dto.title,
          description: dto.description,
          severity: dto.severity,
          status: DefectStatus.offen,
          photoStoredPaths: storedPaths,
        },
        include: includeRelations,
      });

      await tx.defectStatusLog.create({
        data: {
          tenantId: driver.tenantId,
          defectId: created.id,
          fromStatus: null,
          toStatus: DefectStatus.offen,
          changedByDriverId: driver.id,
          note: 'Manuelle Mängelmeldung',
        },
      });

      if (dto.severity === DefectSeverity.kritisch) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { status: VehicleStatus.broken },
        });
      }

      return created;
    });

    await this.notifyCriticalDefect(defect.id, vehicle.plateNumber, dto.severity);

    await safeAuditLog(this.auditService, {
      action: 'defect.reported',
      entityType: 'Defect',
      entityId: defect.id,
      summary: `Manual defect reported for ${vehicle.plateNumber}`,
      metadata: { severity: dto.severity, source: DefectSource.manual_report },
    });

    return this.toClient(defect, { includePhotoUrls: true, driverSelf: true });
  }

  async getDriverDefects(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const rows = await this.prisma.defect.findMany({
      where: {
        OR: [{ reportedByDriverId: driver.id }, { confirmationDriverId: driver.id }],
        anonymizedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: includeRelations,
    });

    return rows.map((row) =>
      this.toClient(row, {
        includePhotoUrls: true,
        driverSelf: true,
        pending_confirmation:
          row.confirmationDriverId === driver.id && row.status === DefectStatus.behoben,
      }),
    );
  }

  async confirmDefect(userId: string, defectId: string, note?: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true, tenantId: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      include: { vehicle: { select: { id: true, plateNumber: true } } },
    });
    if (!defect || defect.anonymizedAt) throw new NotFoundException('Defect not found');
    if (defect.confirmationDriverId !== driver.id) {
      throw new ForbiddenException('You are not assigned to confirm this defect');
    }
    if (defect.status !== DefectStatus.behoben) {
      throw new BadRequestException('Only BEHOBEN defects can be confirmed');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.defect.update({
        where: { id: defectId },
        data: {
          status: DefectStatus.bestaetigt,
          confirmedAt: new Date(),
        },
        include: includeRelations,
      });

      await tx.defectStatusLog.create({
        data: {
          tenantId: driver.tenantId,
          defectId,
          fromStatus: DefectStatus.behoben,
          toStatus: DefectStatus.bestaetigt,
          changedByDriverId: driver.id,
          note: note ?? 'Bestätigt durch Fahrer',
        },
      });

      const openCritical = await tx.defect.count({
        where: {
          vehicleId: defect.vehicleId,
          severity: DefectSeverity.kritisch,
          status: { not: DefectStatus.bestaetigt },
          anonymizedAt: null,
        },
      });
      if (openCritical === 0) {
        await tx.vehicle.update({
          where: { id: defect.vehicleId },
          data: { status: VehicleStatus.active },
        });
      }

      return row;
    });

    await safeAuditLog(this.auditService, {
      action: 'defect.confirmed',
      entityType: 'Defect',
      entityId: defectId,
      summary: `Defect confirmed by driver for ${defect.vehicle.plateNumber}`,
    });

    return this.toClient(updated, { includePhotoUrls: true, driverSelf: true });
  }

  async updateStatus(defectId: string, dto: UpdateDefectStatusDto, actorUserId: string) {
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      include: {
        vehicle: { select: { id: true, plateNumber: true, currentDriverId: true } },
        reportedBy: { select: { id: true, userId: true } },
      },
    });
    if (!defect || defect.anonymizedAt) throw new NotFoundException('Defect not found');
    if (dto.status === defect.status) {
      throw new BadRequestException('Defect is already in the requested status');
    }
    if (!isValidDefectTransition(defect.status, dto.status)) {
      throw new BadRequestException(`Invalid status transition ${defect.status} → ${dto.status}`);
    }

    if (dto.status === DefectStatus.in_reparatur) {
      if (!dto.repair_company?.trim()) {
        throw new BadRequestException('repair_company is required for IN_REPARATUR');
      }
    }

    if (dto.status === DefectStatus.behoben) {
      if (!dto.confirmation_driver_id && !defect.vehicle.currentDriverId && !defect.reportedBy.id) {
        throw new BadRequestException('confirmation_driver_id is required for BEHOBEN');
      }
    }

    if (dto.service_record_id) {
      const serviceRecord = await this.prisma.serviceRecord.findUnique({
        where: { id: dto.service_record_id },
        select: { id: true, vehicleId: true },
      });
      if (!serviceRecord || serviceRecord.vehicleId !== defect.vehicleId) {
        throw new BadRequestException('Invalid service_record_id for this vehicle');
      }
    }

    const confirmationDriverId =
      dto.confirmation_driver_id ??
      (dto.status === DefectStatus.behoben
        ? defect.vehicle.currentDriverId ?? defect.reportedBy.id
        : undefined);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.defect.update({
        where: { id: defectId },
        data: {
          status: dto.status,
          repairCompany: dto.repair_company ?? defect.repairCompany,
          estimatedRepairDate: dto.estimated_repair_date
            ? new Date(dto.estimated_repair_date)
            : defect.estimatedRepairDate,
          serviceRecordId: dto.service_record_id ?? defect.serviceRecordId,
          confirmationDriverId:
            dto.status === DefectStatus.behoben ? confirmationDriverId : defect.confirmationDriverId,
        },
        include: includeRelations,
      });

      await tx.defectStatusLog.create({
        data: {
          tenantId: defect.tenantId,
          defectId,
          fromStatus: defect.status,
          toStatus: dto.status,
          changedByUserId: actorUserId,
          note: dto.note,
          repairCompany: dto.repair_company,
          estimatedRepairDate: dto.estimated_repair_date
            ? new Date(dto.estimated_repair_date)
            : undefined,
        },
      });

      if (dto.status === DefectStatus.in_reparatur) {
        await tx.vehicle.update({
          where: { id: defect.vehicleId },
          data: { status: VehicleStatus.maintenance },
        });
      }

      return row;
    });

    if (dto.status === DefectStatus.behoben && confirmationDriverId) {
      await this.notifyDefectConfirmationTask(updated.id, confirmationDriverId);
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'defect.status_changed',
      entityType: 'Defect',
      entityId: defectId,
      summary: `Defect ${defect.status} → ${dto.status}`,
      metadata: {
        repair_company: dto.repair_company,
        estimated_repair_date: dto.estimated_repair_date,
      },
    });

    return this.toClient(updated, { includePhotoUrls: true });
  }

  async streamPhoto(
    defectId: string,
    photoIndex: number,
    actorUserId: string,
    actorRole: string,
    res: Response,
    options?: { driverSelfUserId?: string },
  ) {
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      include: { reportedBy: { select: { userId: true } }, confirmationDriver: { select: { userId: true } } },
    });
    if (!defect || defect.anonymizedAt) throw new NotFoundException('Defect not found');

    const isAdmin = actorRole === 'admin';
    const isDriverSelf =
      options?.driverSelfUserId &&
      (defect.reportedBy.userId === options.driverSelfUserId ||
        defect.confirmationDriver?.userId === options.driverSelfUserId);

    if (!isAdmin && !isDriverSelf) {
      throw new ForbiddenException('Photo access denied');
    }

    const storedPath = defect.photoStoredPaths[photoIndex];
    if (!storedPath) throw new NotFoundException('Photo not found');

    const payload = await this.photoStorage.readDecrypted(storedPath);
    if (!payload) throw new NotFoundException('Photo file missing');

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'defect.photo_viewed',
      entityType: 'Defect',
      entityId: defectId,
      metadata: { photo_index: photoIndex },
    });

    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(payload.buffer);
  }

  async purgeRetainedData(cutoff: Date): Promise<number> {
    const rows = await this.prisma.defect.findMany({
      where: {
        status: DefectStatus.bestaetigt,
        anonymizedAt: null,
        updatedAt: { lt: cutoff },
      },
      take: 50,
      select: { id: true, photoStoredPaths: true, description: true },
    });

    for (const row of rows) {
      await this.photoStorage.deleteMany(row.photoStoredPaths);
      await this.prisma.defect.update({
        where: { id: row.id },
        data: {
          anonymizedAt: new Date(),
          description: '[anonymized]',
          title: null,
          photoStoredPaths: [],
          photoMetadata: Prisma.JsonNull,
          repairCompany: null,
        },
      });
    }

    return rows.length;
  }

  async createFromDepartureItem(params: {
    tenantId: string;
    vehicleId: string;
    driverId: string;
    departureCheckId: string;
    departureCheckItemResultId: string;
    title: string;
    description: string;
    severity: DefectSeverity;
    photoStoredPaths: string[];
  }) {
    const defect = await this.prisma.$transaction(async (tx) => {
      const created = await tx.defect.create({
        data: {
          tenantId: params.tenantId,
          vehicleId: params.vehicleId,
          reportedByDriverId: params.driverId,
          source: DefectSource.departure_check,
          departureCheckId: params.departureCheckId,
          departureCheckItemResultId: params.departureCheckItemResultId,
          title: params.title,
          description: params.description,
          severity: params.severity,
          status: DefectStatus.offen,
          photoStoredPaths: params.photoStoredPaths,
        },
        include: includeRelations,
      });

      await tx.defectStatusLog.create({
        data: {
          tenantId: params.tenantId,
          defectId: created.id,
          fromStatus: null,
          toStatus: DefectStatus.offen,
          changedByDriverId: params.driverId,
          note: 'Aus Abfahrtskontrolle',
        },
      });

      if (params.severity === DefectSeverity.kritisch) {
        await tx.vehicle.update({
          where: { id: params.vehicleId },
          data: { status: VehicleStatus.broken },
        });
      }

      return created;
    });

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: params.vehicleId },
      select: { plateNumber: true },
    });

    await this.notifyCriticalDefect(
      defect.id,
      vehicle?.plateNumber ?? params.vehicleId,
      params.severity,
    );

    return defect;
  }

  private async notifyCriticalDefect(defectId: string, plateNumber: string, severity: DefectSeverity) {
    if (severity !== DefectSeverity.kritisch) return;

    await this.notifications.notifyAdminsAndOffice({
      title: 'Kritischer Mangel gemeldet',
      message: `Fahrzeug ${plateNumber}: kritischer Mangel — Fahrzeug gesperrt.`,
      type: 'system',
      priority: NotificationPriority.critical,
      relatedEntityType: 'Defect',
      relatedEntityId: defectId,
    });
  }

  private async notifyDefectConfirmationTask(defectId: string, confirmationDriverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: confirmationDriverId },
      select: { userId: true, tenantId: true },
    });
    if (!driver?.userId) return;

    await this.driverNotify.notifyUser({
      userId: driver.userId,
      key: 'defect_confirm_due',
      type: 'system',
      priority: 'high',
      relatedEntityType: 'Defect',
      relatedEntityId: defectId,
    });
    await this.push.sendToUser(driver.userId, {
      title: 'Mangel bestätigen',
      body: 'Ein behobener Mangel wartet auf deine Bestätigung.',
      data: { type: 'defect_confirm_due', defectId },
    });
  }

  private toClient(
    row: Prisma.DefectGetPayload<{ include: typeof includeRelations }>,
    options?: {
      includePhotoUrls?: boolean;
      driverSelf?: boolean;
      pending_confirmation?: boolean;
    },
  ) {
    return {
      id: row.id,
      vehicle_id: row.vehicleId,
      vehicle: {
        id: row.vehicle.id,
        plate_number: row.vehicle.plateNumber,
        internal_code: row.vehicle.internalCode,
        status: row.vehicle.status,
      },
      reported_by_driver_id: row.reportedByDriverId,
      reported_by: {
        id: row.reportedBy.id,
        name: `${row.reportedBy.firstName} ${row.reportedBy.lastName}`.trim(),
        employee_number: row.reportedBy.employeeNumber,
      },
      source: row.source,
      departure_check_id: row.departureCheckId,
      departure_check_item_result_id: row.departureCheckItemResultId,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      repair_company: row.repairCompany,
      estimated_repair_date: row.estimatedRepairDate?.toISOString().slice(0, 10) ?? null,
      service_record_id: row.serviceRecordId,
      service_record: row.serviceRecord
        ? {
            id: row.serviceRecord.id,
            repair_company: row.serviceRecord.repairCompany,
            date: row.serviceRecord.date.toISOString().slice(0, 10),
            service_type: row.serviceRecord.serviceType,
          }
        : null,
      confirmation_driver_id: row.confirmationDriverId,
      confirmation_driver: row.confirmationDriver
        ? {
            id: row.confirmationDriver.id,
            name: `${row.confirmationDriver.firstName} ${row.confirmationDriver.lastName}`.trim(),
            employee_number: row.confirmationDriver.employeeNumber,
          }
        : null,
      confirmed_at: row.confirmedAt?.toISOString() ?? null,
      pending_confirmation: options?.pending_confirmation ?? false,
      photo_count: row.photoStoredPaths.length,
      photo_urls: options?.includePhotoUrls
        ? row.photoStoredPaths.map((_, index) =>
            options.driverSelf
              ? `/driver/defects/${row.id}/photo/${index}`
              : `/defects/${row.id}/photo/${index}`,
          )
        : undefined,
      status_logs: row.statusLogs.map((log) => ({
        id: log.id,
        from_status: log.fromStatus,
        to_status: log.toStatus,
        changed_by_user_id: log.changedByUserId,
        changed_by_driver_id: log.changedByDriverId,
        note: log.note,
        repair_company: log.repairCompany,
        estimated_repair_date: log.estimatedRepairDate?.toISOString().slice(0, 10) ?? null,
        created_at: log.createdAt.toISOString(),
      })),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
