import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  DefectSeverity,
  DepartureCheckItemStatus,
  DepartureCheckOverallStatus,
  Prisma,
} from '@prisma/client';
import type { Response } from 'express';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DefectPhotoStorageService } from '../storage/defect-photo-storage.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { DefectsService } from './defects.service';
import { DepartureCheckService } from './departure-check.service';
import { SubmitDepartureCheckDto } from './dto/submit-departure-check.dto';
import { dayRange, MAX_DEFECT_PHOTOS, todayDate } from './departure-check.util';

type UploadedPhoto = { originalname: string; buffer: Buffer };

const includeRelations = {
  driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
  vehicle: { select: { id: true, plateNumber: true, internalCode: true, category: true } },
  assignment: {
    select: {
      id: true,
      workDate: true,
      startTime: true,
      company: { select: { id: true, name: true } },
    },
  },
  template: { select: { id: true, name: true, vehicleCategory: true } },
  itemResults: { orderBy: { sortOrder: 'asc' as const } },
  defects: { select: { id: true, severity: true, status: true, title: true } },
} satisfies Prisma.DepartureCheckInclude;

@Injectable()
export class DepartureChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: ChecklistTemplatesService,
    private readonly compliance: DepartureCheckService,
    private readonly defects: DefectsService,
    private readonly photoStorage: DefectPhotoStorageService,
    private readonly auditService: AuditService,
    private readonly driverNotify: DriverNotifyService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: { driver_id?: string; vehicle_id?: string; work_date?: string }) {
    const where: Prisma.DepartureCheckWhereInput = {};
    if (query.driver_id) where.driverId = query.driver_id;
    if (query.vehicle_id) where.vehicleId = query.vehicle_id;
    if (query.work_date) where.workDate = new Date(query.work_date);

    const rows = await this.prisma.departureCheck.findMany({
      where,
      orderBy: { performedAt: 'desc' },
      include: includeRelations,
    });

    return rows.map((row) => this.toClient(row));
  }

  async getById(id: string) {
    const row = await this.prisma.departureCheck.findUnique({
      where: { id },
      include: includeRelations,
    });
    if (!row) throw new NotFoundException('Departure check not found');
    return this.toClient(row);
  }

  async listForVehicle(vehicleId: string, limit = 20) {
    const rows = await this.prisma.departureCheck.findMany({
      where: { vehicleId },
      orderBy: { performedAt: 'desc' },
      take: limit,
      include: includeRelations,
    });
    return rows.map((row) => this.toClient(row));
  }

  async getDriverStatus(userId: string, referenceDate = new Date()) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true, tenantId: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const { start, end } = dayRange(referenceDate);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        driverId: driver.id,
        workDate: { gte: start, lt: end },
        status: {
          in: [AssignmentStatus.planned, AssignmentStatus.confirmed, AssignmentStatus.in_progress],
        },
      },
      orderBy: { startTime: 'asc' },
      include: {
        vehicle: { select: { id: true, plateNumber: true, category: true } },
        company: { select: { id: true, name: true } },
      },
    });

    if (!assignment) {
      return {
        required: false,
        completed_today: false,
        can_submit: false,
        assignment: null,
        template: null,
        vehicle_compliance: null,
      };
    }

    const workDate = todayDate(referenceDate);
    const existing = await this.prisma.departureCheck.findUnique({
      where: {
        driverId_vehicleId_workDate: {
          driverId: driver.id,
          vehicleId: assignment.vehicleId,
          workDate,
        },
      },
      select: { id: true, overallStatus: true, performedAt: true },
    });

    const vehicleCompliance = await this.compliance.getVehicleCompliance(assignment.vehicleId);
    const template = await this.templates.resolveForVehicle(assignment.vehicleId, driver.tenantId);

    return {
      required: true,
      completed_today: Boolean(existing),
      can_submit: !existing && !vehicleCompliance.blocks_departure_check,
      assignment: {
        id: assignment.id,
        work_date: assignment.workDate.toISOString().slice(0, 10),
        start_time: assignment.startTime,
        company_name: assignment.company.name,
        vehicle_id: assignment.vehicle.id,
        vehicle_plate: assignment.vehicle.plateNumber,
      },
      existing_check: existing
        ? {
            id: existing.id,
            overall_status: existing.overallStatus,
            performed_at: existing.performedAt.toISOString(),
          }
        : null,
      template: {
        id: template.id,
        name: template.name,
        items: template.items.map((item) => ({
          id: item.id,
          item_key: item.itemKey,
          label: item.label,
          description: item.description,
          sort_order: item.sortOrder,
          requires_photo_on_defect: item.requiresPhotoOnDefect,
        })),
      },
      vehicle_compliance: vehicleCompliance,
    };
  }

  async submitDriverCheck(
    userId: string,
    dto: SubmitDepartureCheckDto,
    photosByItemKey: Record<string, UploadedPhoto[]>,
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true, tenantId: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    if (dto.client_submission_id) {
      const existing = await this.prisma.departureCheck.findUnique({
        where: { clientSubmissionId: dto.client_submission_id },
        include: includeRelations,
      });
      if (existing) {
        return this.toClient(existing);
      }
    }

    const vehicleGate = await this.compliance.assertDepartureCheckAllowed(dto.vehicle_id);
    if (!vehicleGate.allowed) {
      throw new BadRequestException({
        code: vehicleGate.code,
        message: vehicleGate.message,
        open_critical_count: vehicleGate.open_critical_count,
      });
    }

    const template = await this.templates.resolveForVehicle(dto.vehicle_id, driver.tenantId);
    const activeItems = template.items.filter((item) => item.isActive);
    const itemMap = new Map(activeItems.map((item) => [item.itemKey, item]));

    if (dto.items.length !== activeItems.length) {
      throw new BadRequestException('All checklist items must be answered');
    }

    for (const input of dto.items) {
      const templateItem = itemMap.get(input.item_key);
      if (!templateItem) {
        throw new BadRequestException(`Unknown checklist item: ${input.item_key}`);
      }

      if (input.result === DepartureCheckItemStatus.defekt) {
        if (!input.defect_description?.trim()) {
          throw new BadRequestException(`defect_description required for ${input.item_key}`);
        }
        const itemPhotos = photosByItemKey[input.item_key] ?? [];
        if (templateItem.requiresPhotoOnDefect && !itemPhotos.length) {
          throw new BadRequestException(`Photo required for defect on ${input.item_key}`);
        }
        if (itemPhotos.length > MAX_DEFECT_PHOTOS) {
          throw new BadRequestException(`Maximum ${MAX_DEFECT_PHOTOS} photos per item`);
        }
      } else if (photosByItemKey[input.item_key]?.length) {
        throw new BadRequestException(`Photos only allowed for defect items (${input.item_key})`);
      }
    }

    const performedAt = dto.offline_captured_at ? new Date(dto.offline_captured_at) : new Date();
    const workDate = todayDate(performedAt);

    const existingToday = await this.prisma.departureCheck.findUnique({
      where: {
        driverId_vehicleId_workDate: {
          driverId: driver.id,
          vehicleId: dto.vehicle_id,
          workDate,
        },
      },
      select: { id: true },
    });
    if (existingToday) {
      throw new ConflictException('Departure check already submitted for today');
    }

    if (dto.assignment_id) {
      const assignment = await this.prisma.assignment.findFirst({
        where: { id: dto.assignment_id, driverId: driver.id },
        select: { id: true },
      });
      if (!assignment) throw new BadRequestException('Invalid assignment_id');
    }

    let signatureMetadata: Prisma.InputJsonValue | undefined;
    if (dto.signature_metadata) {
      try {
        signatureMetadata = JSON.parse(dto.signature_metadata) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('signature_metadata must be valid JSON');
      }
    }

    const hasDefect = dto.items.some((item) => item.result === DepartureCheckItemStatus.defekt);
    const overallStatus = hasDefect
      ? DepartureCheckOverallStatus.maengel_gemeldet
      : DepartureCheckOverallStatus.ok;

    const storedPhotosByItem = new Map<string, string[]>();
    for (const [itemKey, photos] of Object.entries(photosByItemKey)) {
      const paths = await Promise.all(
        photos.map((photo, index) =>
          this.photoStorage.saveEncrypted(photo.originalname, `departure_${itemKey}_${index}`, photo.buffer),
        ),
      );
      storedPhotosByItem.set(itemKey, paths);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const check = await tx.departureCheck.create({
        data: {
          tenantId: driver.tenantId,
          driverId: driver.id,
          vehicleId: dto.vehicle_id,
          assignmentId: dto.assignment_id,
          templateId: template.id,
          workDate,
          performedAt,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyM: dto.accuracy_m,
          overallStatus,
          templateNameSnapshot: template.name,
          signatureConfirmedAt: dto.signature_confirmed_at
            ? new Date(dto.signature_confirmed_at)
            : new Date(),
          signatureMetadata,
          clientSubmissionId: dto.client_submission_id,
          offlineCapturedAt: dto.offline_captured_at ? new Date(dto.offline_captured_at) : undefined,
          itemResults: {
            create: dto.items.map((input) => {
              const templateItem = itemMap.get(input.item_key)!;
              return {
                templateItemId: templateItem.id,
                itemKey: templateItem.itemKey,
                itemLabel: templateItem.label,
                sortOrder: templateItem.sortOrder,
                result: input.result,
                defectDescription:
                  input.result === DepartureCheckItemStatus.defekt
                    ? input.defect_description?.trim()
                    : undefined,
                photoStoredPaths: storedPhotosByItem.get(input.item_key) ?? [],
              };
            }),
          },
        },
        include: { itemResults: { orderBy: { sortOrder: 'asc' } } },
      });

      return check;
    });

    for (const result of created.itemResults) {
      if (result.result !== DepartureCheckItemStatus.defekt) continue;
      const input = dto.items.find((item) => item.item_key === result.itemKey);
      await this.defects.createFromDepartureItem({
        tenantId: driver.tenantId,
        vehicleId: dto.vehicle_id,
        driverId: driver.id,
        departureCheckId: created.id,
        departureCheckItemResultId: result.id,
        title: result.itemLabel,
        description: result.defectDescription ?? result.itemLabel,
        severity: this.mapSeverity(input?.defect_severity),
        photoStoredPaths: result.photoStoredPaths,
      });
    }

    const loaded = await this.prisma.departureCheck.findUnique({
      where: { id: created.id },
      include: includeRelations,
    });

    await safeAuditLog(this.auditService, {
      action: 'departure_check.submitted',
      entityType: 'DepartureCheck',
      entityId: loaded!.id,
      summary: `Abfahrtskontrolle ${overallStatus}`,
      metadata: {
        vehicle_id: dto.vehicle_id,
        driver_id: driver.id,
        overall_status: overallStatus,
        client_submission_id: dto.client_submission_id,
      },
    });

    if (hasDefect) {
      await this.notifications.notifyAdminsAndOffice({
        title: 'Mängel aus Abfahrtskontrolle',
        message: `Fahrer hat Mängel bei der Abfahrtskontrolle gemeldet.`,
        type: 'system',
        priority: 'high',
        relatedEntityType: 'DepartureCheck',
        relatedEntityId: loaded!.id,
      });
    }

    return this.toClient(loaded!);
  }

  async streamItemPhoto(
    checkId: string,
    itemResultId: string,
    photoIndex: number,
    actorUserId: string,
    actorRole: string,
    res: Response,
    options?: { driverSelfUserId?: string },
  ) {
    const check = await this.prisma.departureCheck.findUnique({
      where: { id: checkId },
      include: {
        driver: { select: { userId: true } },
        itemResults: true,
      },
    });
    if (!check) throw new NotFoundException('Departure check not found');

    const isAdmin = actorRole === 'admin';
    const isDriverSelf = options?.driverSelfUserId && check.driver.userId === options.driverSelfUserId;
    if (!isAdmin && !isDriverSelf) {
      throw new ForbiddenException('Photo access denied');
    }

    const item = check.itemResults.find((row) => row.id === itemResultId);
    if (!item) throw new NotFoundException('Checklist item result not found');

    const storedPath = item.photoStoredPaths[photoIndex];
    if (!storedPath) throw new NotFoundException('Photo not found');

    const payload = await this.photoStorage.readDecrypted(storedPath);
    if (!payload) throw new NotFoundException('Photo file missing');

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'departure_check.photo_viewed',
      entityType: 'DepartureCheck',
      entityId: checkId,
      metadata: { item_result_id: itemResultId, photo_index: photoIndex },
    });

    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(payload.buffer);
  }

  async runDailyJobs(referenceDate = new Date()) {
    const due = await this.compliance.findDriversDueForDepartureCheckReminder(referenceDate);
    let reminders = 0;
    let escalations = 0;

    for (const row of due) {
      const minutes = Math.floor((referenceDate.getTime() - row.shiftStartedAt.getTime()) / 60_000);
      if (minutes < 30) continue;

      const state = await this.prisma.departureCheckReminderState.upsert({
        where: {
          driverId_workDate: {
            driverId: row.driverId,
            workDate: todayDate(referenceDate),
          },
        },
        create: {
          tenantId: row.tenantId,
          driverId: row.driverId,
          workDate: todayDate(referenceDate),
        },
        update: {},
      });

      if (minutes >= 60 && !state.lastEscalationSentAt) {
        await this.notifications.notifyAdminsAndOffice({
          title: 'Abfahrtskontrolle fehlt',
          message: 'Fahrer hat die morgendliche Abfahrtskontrolle nicht durchgeführt (Eskalation).',
          type: 'system',
          priority: 'high',
          relatedEntityType: 'Driver',
          relatedEntityId: row.driverId,
        });
        await this.prisma.departureCheckReminderState.update({
          where: { id: state.id },
          data: { lastEscalationSentAt: referenceDate },
        });
        escalations += 1;
        continue;
      }

      if (minutes >= 30) {
        const lastReminder = state.lastReminderSentAt;
        const canSend =
          !lastReminder ||
          referenceDate.getTime() - lastReminder.getTime() >= 30 * 60_000;
        if (!canSend) continue;

        await this.driverNotify.notifyUser({
          userId: row.userId!,
          key: 'departure_check_reminder',
          type: 'system',
          priority: 'high',
          relatedEntityType: 'Assignment',
          relatedEntityId: row.assignmentId,
        });

        await this.prisma.departureCheckReminderState.update({
          where: { id: state.id },
          data: { lastReminderSentAt: referenceDate },
        });
        reminders += 1;
      }
    }

    const retentionMonths = Number(process.env.DEFECT_RETENTION_MONTHS ?? 24);
    const cutoff = new Date(referenceDate);
    cutoff.setMonth(cutoff.getMonth() - (Number.isFinite(retentionMonths) ? retentionMonths : 24));
    const purged = await this.defects.purgeRetainedData(cutoff);

    return { reminders, escalations, purged };
  }

  private mapSeverity(value?: 'gering' | 'mittel' | 'kritisch'): DefectSeverity {
    if (value === 'kritisch') return DefectSeverity.kritisch;
    if (value === 'mittel') return DefectSeverity.mittel;
    return DefectSeverity.gering;
  }

  private toClient(row: Prisma.DepartureCheckGetPayload<{ include: typeof includeRelations }>) {
    return {
      id: row.id,
      driver_id: row.driverId,
      driver: {
        id: row.driver.id,
        name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
        employee_number: row.driver.employeeNumber,
      },
      vehicle_id: row.vehicleId,
      vehicle: {
        id: row.vehicle.id,
        plate_number: row.vehicle.plateNumber,
        internal_code: row.vehicle.internalCode,
        category: row.vehicle.category,
      },
      assignment_id: row.assignmentId,
      assignment: row.assignment
        ? {
            id: row.assignment.id,
            work_date: row.assignment.workDate.toISOString().slice(0, 10),
            start_time: row.assignment.startTime,
            company_name: row.assignment.company.name,
          }
        : null,
      template_id: row.templateId,
      template_name: row.templateNameSnapshot,
      work_date: row.workDate.toISOString().slice(0, 10),
      performed_at: row.performedAt.toISOString(),
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      accuracy_m: row.accuracyM,
      overall_status: row.overallStatus,
      signature_confirmed_at: row.signatureConfirmedAt?.toISOString() ?? null,
      client_submission_id: row.clientSubmissionId,
      offline_captured_at: row.offlineCapturedAt?.toISOString() ?? null,
      item_results: row.itemResults.map((item) => ({
        id: item.id,
        item_key: item.itemKey,
        item_label: item.itemLabel,
        sort_order: item.sortOrder,
        result: item.result,
        defect_description: item.defectDescription,
        photo_count: item.photoStoredPaths.length,
      })),
      defects: row.defects,
      created_at: row.createdAt.toISOString(),
    };
  }
}
