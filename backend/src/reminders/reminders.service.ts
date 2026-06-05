import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

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
        targetType_targetId_reminderType_dueDate_notifyBeforeDays: {
          targetType: data.targetType,
          targetId: data.targetId,
          reminderType: data.reminderType,
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
