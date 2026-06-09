import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceReminderDto } from './dto/create-service-reminder.dto';
import type { CreateVehicleReminderDto } from './dto/create-vehicle-reminder.dto';

type ReminderType =
  | 'license_expiry'
  | 'passport_expiry'
  | 'tuv_expiry'
  | 'sp_expiry'
  | 'insurance_expiry'
  | 'document_expiry'
  | 'custom';

type ReminderStatus = 'open' | 'sent' | 'resolved' | 'ignored';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
const REMINDER_STATUSES: ReminderStatus[] = ['open', 'sent', 'resolved', 'ignored'];
const REMINDER_TYPES: ReminderType[] = [
  'license_expiry',
  'passport_expiry',
  'tuv_expiry',
  'sp_expiry',
  'insurance_expiry',
  'document_expiry',
  'custom',
];

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  private readonly reminderWindows = [90, 60, 30, 7];

  private ensureReminderStatus(value: string): ReminderStatus {
    if (!REMINDER_STATUSES.includes(value as ReminderStatus)) {
      throw new BadRequestException('Invalid reminder status');
    }

    return value as ReminderStatus;
  }

  private ensureReminderType(value: string): ReminderType {
    if (!REMINDER_TYPES.includes(value as ReminderType)) {
      throw new BadRequestException('Invalid reminder type');
    }

    return value as ReminderType;
  }

  private normalizeDate(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private diffInDays(fromDate: Date, toDate: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((this.normalizeDate(toDate).getTime() - this.normalizeDate(fromDate).getTime()) / msPerDay);
  }

  getPriorityByNotifyWindow(days: number): NotificationPriority {
    if (days <= 7) return 'critical';
    if (days <= 30) return 'high';
    if (days <= 60) return 'medium';
    return 'low';
  }

  getReminderWindows(): number[] {
    return [...this.reminderWindows];
  }

  isDueWithinWindow(date: Date, days: number): boolean {
    const today = this.normalizeDate(new Date());
    const due = this.normalizeDate(date);
    const diff = this.diffInDays(today, due);
    return diff <= days;
  }

  private shouldCreateReminder(daysUntilDue: number): { shouldCreate: boolean; notifyBeforeDays: number } {
    if (daysUntilDue < 0) {
      return { shouldCreate: true, notifyBeforeDays: 7 };
    }

    for (const window of this.reminderWindows) {
      if (daysUntilDue <= window) {
        return { shouldCreate: true, notifyBeforeDays: window };
      }
    }

    return { shouldCreate: false, notifyBeforeDays: 90 };
  }

  async createReminderIfNotExists(data: {
    targetType: string;
    targetId: string;
    reminderType: ReminderType;
    title: string;
    description?: string;
    dueDate: Date;
    notifyBeforeDays: number;
  }) {
    const db = this.prisma as any;
    const dueDate = this.normalizeDate(data.dueDate);

    const existing = await db.reminder.findUnique({
      where: {
        tenantId_targetType_targetId_reminderType_title_dueDate_notifyBeforeDays: {
          tenantId: 'default-tenant',
          targetType: data.targetType,
          targetId: data.targetId,
          reminderType: data.reminderType,
          title: data.title,
          dueDate,
          notifyBeforeDays: data.notifyBeforeDays,
        },
      },
    });

    if (existing) {
      return { reminder: existing, created: false };
    }

    const reminder = await db.reminder.create({
      data: {
        targetType: data.targetType,
        targetId: data.targetId,
        reminderType: data.reminderType,
        title: data.title,
        description: data.description ?? null,
        dueDate,
        notifyBeforeDays: data.notifyBeforeDays,
        status: 'open' as ReminderStatus,
      },
    });

    return { reminder, created: true };
  }

  async getDueDrivers(referenceDate = new Date()) {
    const today = this.normalizeDate(referenceDate);

    const drivers = await this.prisma.driver.findMany({
      where: {
        OR: [{ licenseExpiryDate: { not: null } }, { passportExpiryDate: { not: null } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenseExpiryDate: true,
        passportExpiryDate: true,
      },
    });

    return drivers.flatMap((driver) => {
      const items: Array<{
        targetType: string;
        targetId: string;
        reminderType: ReminderType;
        dueDate: Date;
        title: string;
        description: string;
        priority: NotificationPriority;
        notifyBeforeDays: number;
      }> = [];

      if (driver.licenseExpiryDate) {
        const days = this.diffInDays(today, driver.licenseExpiryDate);
        const decision = this.shouldCreateReminder(days);
        if (decision.shouldCreate) {
          items.push({
            targetType: 'driver',
            targetId: driver.id,
            reminderType: 'license_expiry',
            dueDate: driver.licenseExpiryDate,
            title: 'Driver license expires soon',
            description: `${driver.firstName} ${driver.lastName} license expiry`,
            priority: this.getPriorityByNotifyWindow(decision.notifyBeforeDays),
            notifyBeforeDays: decision.notifyBeforeDays,
          });
        }
      }

      if (driver.passportExpiryDate) {
        const days = this.diffInDays(today, driver.passportExpiryDate);
        const decision = this.shouldCreateReminder(days);
        if (decision.shouldCreate) {
          items.push({
            targetType: 'driver',
            targetId: driver.id,
            reminderType: 'passport_expiry',
            dueDate: driver.passportExpiryDate,
            title: 'Driver passport expires soon',
            description: `${driver.firstName} ${driver.lastName} passport expiry`,
            priority: this.getPriorityByNotifyWindow(decision.notifyBeforeDays),
            notifyBeforeDays: decision.notifyBeforeDays,
          });
        }
      }

      return items;
    });
  }

  async getDueVehicles(referenceDate = new Date()) {
    const today = this.normalizeDate(referenceDate);

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        OR: [
          { tuvExpiryDate: { not: null } },
          { spExpiryDate: { not: null } },
          { insuranceExpiryDate: { not: null } },
        ],
      },
      select: {
        id: true,
        plateNumber: true,
        tuvExpiryDate: true,
        spExpiryDate: true,
        insuranceExpiryDate: true,
      },
    });

    return vehicles.flatMap((vehicle) => {
      const items: Array<{
        targetType: string;
        targetId: string;
        reminderType: ReminderType;
        dueDate: Date;
        title: string;
        description: string;
        priority: NotificationPriority;
        notifyBeforeDays: number;
      }> = [];

      if (vehicle.tuvExpiryDate) {
        const days = this.diffInDays(today, vehicle.tuvExpiryDate);
        const decision = this.shouldCreateReminder(days);
        if (decision.shouldCreate) {
          items.push({
            targetType: 'vehicle',
            targetId: vehicle.id,
            reminderType: 'tuv_expiry',
            dueDate: vehicle.tuvExpiryDate,
            title: 'Vehicle TUEV expires soon',
            description: `Vehicle ${vehicle.plateNumber} TUEV expiry`,
            priority: this.getPriorityByNotifyWindow(decision.notifyBeforeDays),
            notifyBeforeDays: decision.notifyBeforeDays,
          });
        }
      }

      if (vehicle.spExpiryDate) {
        const days = this.diffInDays(today, vehicle.spExpiryDate);
        const decision = this.shouldCreateReminder(days);
        if (decision.shouldCreate) {
          items.push({
            targetType: 'vehicle',
            targetId: vehicle.id,
            reminderType: 'sp_expiry',
            dueDate: vehicle.spExpiryDate,
            title: 'Vehicle SP expires soon',
            description: `Vehicle ${vehicle.plateNumber} SP expiry`,
            priority: this.getPriorityByNotifyWindow(decision.notifyBeforeDays),
            notifyBeforeDays: decision.notifyBeforeDays,
          });
        }
      }

      if (vehicle.insuranceExpiryDate) {
        const days = this.diffInDays(today, vehicle.insuranceExpiryDate);
        const decision = this.shouldCreateReminder(days);
        if (decision.shouldCreate) {
          items.push({
            targetType: 'vehicle',
            targetId: vehicle.id,
            reminderType: 'insurance_expiry',
            dueDate: vehicle.insuranceExpiryDate,
            title: 'Vehicle insurance expires soon',
            description: `Vehicle ${vehicle.plateNumber} insurance expiry`,
            priority: this.getPriorityByNotifyWindow(decision.notifyBeforeDays),
            notifyBeforeDays: decision.notifyBeforeDays,
          });
        }
      }

      return items;
    });
  }

  async getDueDocuments(referenceDate = new Date()) {
    const today = this.normalizeDate(referenceDate);

    const db = this.prisma as any;
    const documents: Array<{
      id: string;
      fileName: string;
      ownerType: string;
      ownerId: string;
      expiryDate: Date | null;
    }> = await db.document.findMany({
      where: {
        expiryDate: { not: null },
      },
      select: {
        id: true,
        fileName: true,
        ownerType: true,
        ownerId: true,
        expiryDate: true,
      },
    });

    return documents.flatMap((document) => {
      if (!document.expiryDate) {
        return [];
      }

      const days = this.diffInDays(today, document.expiryDate);
      const decision = this.shouldCreateReminder(days);
      if (!decision.shouldCreate) {
        return [];
      }

      return [
        {
          targetType: 'document',
          targetId: document.id,
          reminderType: 'document_expiry' as ReminderType,
          dueDate: document.expiryDate,
          title: 'Document expires soon',
          description: `${document.fileName} (${document.ownerType}:${document.ownerId})`,
          priority: this.getPriorityByNotifyWindow(decision.notifyBeforeDays),
          notifyBeforeDays: decision.notifyBeforeDays,
        },
      ];
    });
  }

  private async notifyDriverForDocumentExpiry(item: {
    targetId: string;
    reminderType: ReminderType;
    dueDate: Date;
    notifyBeforeDays: number;
    priority: NotificationPriority;
  }) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: item.targetId },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        user: { select: { language: true } },
      },
    });

    if (!driver?.userId) {
      return;
    }

    const dueDate = this.normalizeDate(item.dueDate).toISOString().slice(0, 10);
    const isLicense = item.reminderType === 'license_expiry';
    const lang = driver.user?.language?.toLowerCase() ?? 'de';

    const copyByLang: Record<string, { title: string; message: string }> = {
      de: {
        title: isLicense ? 'Führerschein läuft ab' : 'Reisepass läuft ab',
        message: isLicense
          ? `Ihr Führerschein läuft am ${dueDate} ab (${item.notifyBeforeDays} Tage Vorlauf). Bitte rechtzeitig verlängern.`
          : `Ihr Reisepass läuft am ${dueDate} ab (${item.notifyBeforeDays} Tage Vorlauf). Bitte rechtzeitig verlängern.`,
      },
      en: {
        title: isLicense ? 'Driving license expiring' : 'Passport expiring',
        message: isLicense
          ? `Your driving license expires on ${dueDate} (${item.notifyBeforeDays}-day notice). Please renew in time.`
          : `Your passport expires on ${dueDate} (${item.notifyBeforeDays}-day notice). Please renew in time.`,
      },
      tr: {
        title: isLicense ? 'Ehliyet süresi doluyor' : 'Pasaport süresi doluyor',
        message: isLicense
          ? `Ehliyetiniz ${dueDate} tarihinde sona eriyor (${item.notifyBeforeDays} gün önceden bildirim). Lütfen zamanında yenileyin.`
          : `Pasaportunuz ${dueDate} tarihinde sona eriyor (${item.notifyBeforeDays} gün önceden bildirim). Lütfen zamanında yenileyin.`,
      },
    };

    const copy = copyByLang[lang] ?? copyByLang.de;

    await this.notificationsService.notifyUsers([driver.userId], {
      title: copy.title,
      message: copy.message,
      type: 'reminder',
      priority: item.priority,
      relatedEntityType: 'driver',
      relatedEntityId: item.targetId,
    });
  }

  async generateReminders(actorUserId?: string) {
    const dueDrivers = await this.getDueDrivers();
    const dueVehicles = await this.getDueVehicles();
    const dueDocuments = await this.getDueDocuments();

    const candidates = [...dueDrivers, ...dueVehicles, ...dueDocuments];
    const createdReminders: Array<unknown> = [];

    for (const item of candidates) {
      const { reminder, created } = await this.createReminderIfNotExists({
        targetType: item.targetType,
        targetId: item.targetId,
        reminderType: item.reminderType,
        title: item.title,
        description: item.description,
        dueDate: item.dueDate,
        notifyBeforeDays: item.notifyBeforeDays,
      });

      if (created) {
        createdReminders.push(reminder);

        await this.notificationsService.notifyAdminsAndOffice({
          title: item.title,
          message: `${item.description}. Due date: ${this.normalizeDate(item.dueDate).toISOString().slice(0, 10)}`,
          type: 'reminder',
          priority: item.priority,
          relatedEntityType: item.targetType,
          relatedEntityId: item.targetId,
        });

        if (
          item.targetType === 'driver'
          && (item.reminderType === 'license_expiry' || item.reminderType === 'passport_expiry')
        ) {
          await this.notifyDriverForDocumentExpiry(item);
        }
      }
    }

    const result = {
      totalCandidates: candidates.length,
      created: createdReminders.length,
      reminders: createdReminders,
    };

    if (createdReminders.length > 0) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'reminders.generated',
        entityType: 'reminder',
        summary: 'Reminders generated from due items',
        metadata: {
          totalCandidates: result.totalCandidates,
          created: result.created,
        },
      });
    }

    return result;
  }

  async listReminders(filters: {
    status?: string;
    reminderType?: string;
    targetType?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.status) {
      where.status = this.ensureReminderStatus(filters.status);
    }
    if (filters.reminderType) {
      where.reminderType = this.ensureReminderType(filters.reminderType);
    }
    if (filters.targetType) {
      where.targetType = filters.targetType;
    }

    const db = this.prisma as any;
    return db.reminder.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async resolveReminder(id: string, actorUserId?: string) {
    const db = this.prisma as any;
    const reminder = await db.reminder.findUnique({ where: { id } });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    const updated = await db.reminder.update({
      where: { id },
      data: {
        status: 'resolved' as ReminderStatus,
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'reminder.resolved',
      entityType: 'reminder',
      entityId: id,
      summary: 'Reminder resolved',
    });

    return updated;
  }

  private thresholdToDays(value: number, unit: 'weeks' | 'months' | 'days'): number {
    if (unit === 'months') return value * 30;
    if (unit === 'weeks') return value * 7;
    return value;
  }

  private intervalToMonths(value: number, unit: 'weeks' | 'months'): number {
    if (unit === 'months') return value;
    return Math.max(1, Math.round(value / 4));
  }

  private addMonthsIso(iso: string, months: number): string {
    const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
    date.setMonth(date.getMonth() + months);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private vehicleRenewalLabel(kind: CreateVehicleReminderDto['renewalKind']): string {
    switch (kind) {
      case 'emission_test':
        return 'Emission Test';
      case 'registration':
        return 'Registration';
      case 'insurance':
        return 'Insurance';
      case 'inspection':
      default:
        return 'Inspection';
    }
  }

  private async ensureVehicleExists(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, plateNumber: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async createManualReminderRecord(data: {
    targetType: string;
    targetId: string;
    title: string;
    dueDate: Date;
    notifyBeforeDays: number;
    metadata: Record<string, unknown>;
    notifications: boolean;
    actorUserId?: string;
  }) {
    const db = this.prisma as any;
    const dueDate = this.normalizeDate(data.dueDate);
    const description = JSON.stringify(data.metadata);
    const notifyBeforeDays = Math.max(1, Math.min(365, data.notifyBeforeDays));

    try {
      const reminder = await db.reminder.create({
        data: {
          targetType: data.targetType,
          targetId: data.targetId,
          reminderType: 'custom' as ReminderType,
          title: data.title,
          description,
          metadata: data.metadata,
          dueDate,
          notifyBeforeDays,
          status: 'open' as ReminderStatus,
        },
      });

      if (data.notifications) {
        await this.notificationsService.notifyAdminsAndOffice({
          title: data.title,
          message: `Manual reminder due on ${dueDate.toISOString().slice(0, 10)}`,
          type: 'reminder',
          priority: this.getPriorityByNotifyWindow(notifyBeforeDays),
          relatedEntityType: data.targetType,
          relatedEntityId: data.targetId,
        });
      }

      await safeAuditLog(this.auditService, {
        actorUserId: data.actorUserId,
        action: 'reminder.created',
        entityType: 'reminder',
        entityId: reminder.id,
        summary: 'Manual reminder created',
        metadata: {
          category: String(data.metadata.category ?? ''),
          targetType: data.targetType,
          targetId: data.targetId,
        },
      });

      return reminder;
    } catch (error: unknown) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('A reminder with the same vehicle, task, and due date already exists');
      }
      throw error;
    }
  }

  async createServiceReminder(dto: CreateServiceReminderDto, actorUserId?: string) {
    const vehicle = await this.ensureVehicleExists(dto.vehicleId);
    const serviceTask = dto.serviceTask.trim();
    if (!serviceTask) {
      throw new BadRequestException('Service task is required');
    }

    const months = this.intervalToMonths(dto.timeInterval, dto.timeIntervalUnit);
    const dueDateIso =
      dto.manualOverride && dto.nextDueDate
        ? dto.nextDueDate.slice(0, 10)
        : this.addMonthsIso(new Date().toISOString().slice(0, 10), months);
    const dueDate = this.normalizeDate(new Date(`${dueDateIso}T12:00:00`));
    const notifyBeforeDays = this.thresholdToDays(
      dto.timeDueSoonThreshold,
      dto.timeDueSoonThresholdUnit,
    );

    const metadata = {
      category: 'service',
      serviceTask,
      timeInterval: dto.timeInterval,
      timeIntervalUnit: dto.timeIntervalUnit,
      timeDueSoonThreshold: dto.timeDueSoonThreshold,
      timeDueSoonThresholdUnit: dto.timeDueSoonThresholdUnit,
      meterIntervalKm: dto.meterIntervalKm,
      meterDueSoonThresholdKm: dto.meterDueSoonThresholdKm,
      manualOverride: dto.manualOverride,
      nextDueDate: dto.manualOverride ? dueDateIso : undefined,
      notifications: dto.notifications,
      watchers: dto.watchers ?? [],
      vehiclePlate: vehicle.plateNumber,
    };

    return this.createManualReminderRecord({
      targetType: 'vehicle',
      targetId: vehicle.id,
      title: serviceTask,
      dueDate,
      notifyBeforeDays,
      metadata,
      notifications: dto.notifications,
      actorUserId,
    });
  }

  async createVehicleReminder(dto: CreateVehicleReminderDto, actorUserId?: string) {
    const vehicle = await this.ensureVehicleExists(dto.vehicleId);
    const dueDateIso = dto.dueDate.slice(0, 10);
    const dueDate = this.normalizeDate(new Date(`${dueDateIso}T12:00:00`));
    const notifyBeforeDays = this.thresholdToDays(dto.dueSoonThreshold, dto.dueSoonThresholdUnit);
    const title = this.vehicleRenewalLabel(dto.renewalKind);

    const metadata = {
      category: 'vehicle',
      renewalKind: dto.renewalKind,
      dueSoonThreshold: dto.dueSoonThreshold,
      dueSoonThresholdUnit: dto.dueSoonThresholdUnit,
      notifications: dto.notifications,
      watchers: dto.watchers ?? [],
      comment: dto.comment?.trim() || undefined,
      vehiclePlate: vehicle.plateNumber,
    };

    return this.createManualReminderRecord({
      targetType: 'vehicle',
      targetId: vehicle.id,
      title,
      dueDate,
      notifyBeforeDays,
      metadata,
      notifications: dto.notifications,
      actorUserId,
    });
  }

  async bulkCreateVehicleReminders(items: CreateVehicleReminderDto[], actorUserId?: string) {
    const created: unknown[] = [];
    const skipped: Array<{ index: number; reason: string }> = [];

    for (let index = 0; index < items.length; index += 1) {
      try {
        const reminder = await this.createVehicleReminder(items[index], actorUserId);
        created.push(reminder);
      } catch (error) {
        skipped.push({
          index,
          reason: error instanceof Error ? error.message : 'Failed to create reminder',
        });
      }
    }

    return { created: created.length, skipped };
  }

  async ignoreReminder(id: string, actorUserId?: string) {
    const db = this.prisma as any;
    const reminder = await db.reminder.findUnique({ where: { id } });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    const updated = await db.reminder.update({
      where: { id },
      data: {
        status: 'ignored' as ReminderStatus,
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'reminder.ignored',
      entityType: 'reminder',
      entityId: id,
      summary: 'Reminder ignored',
    });

    return updated;
  }
}
