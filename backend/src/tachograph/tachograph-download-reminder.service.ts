import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TachoDownloadReminderStage, TachoDownloadSubject, UserRole } from '@prisma/client';
import { NotificationI18nService } from '../i18n/notification-i18n.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class TachographDownloadReminderService {
  private readonly logger = new Logger(TachographDownloadReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly notificationI18n: NotificationI18nService,
  ) {}

  @Cron('15 7 * * *', { timeZone: 'Europe/Berlin' })
  async runDailyReminderSweep(): Promise<void> {
    if ((process.env.TACHO_DOWNLOAD_REMINDER_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      await this.processDueReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`tachograph download reminder sweep failed: ${message}`);
    }
  }

  async processDueReminders(referenceDate = new Date()): Promise<number> {
    const schedules = await this.prisma.tachoDownloadSchedule.findMany({
      where: {
        enabled: true,
      },
      include: {
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true } },
      },
      orderBy: { nextDueAt: 'asc' },
    });

    let sent = 0;

    for (const schedule of schedules) {
      const stage = this.resolveStage(referenceDate, schedule.nextDueAt);
      if (!stage) {
        continue;
      }

      if (!this.shouldNotify(stage, schedule.lastReminderStage, schedule.lastReminderSentAt, referenceDate)) {
        continue;
      }

      const recipients = await this.collectRecipients(schedule.tenantId, stage);
      if (recipients.length === 0) {
        continue;
      }

      const params = this.buildTemplateParams(schedule.subject, schedule.driver, schedule.vehicle, schedule.nextDueAt, schedule.intervalDays, referenceDate);

      for (const recipient of recipients) {
        const subject = this.subjectTextForLanguage(recipient.language, schedule.subject, params.entityName);
        const copy = this.notificationI18n.resolve(recipient.language, 'tacho_download_due', {
          ...params,
          subject,
          deadlineText: this.deadlineTextForStage(
            recipient.language,
            stage,
            Number(params.daysRemaining),
            Number(params.overdueDays),
          ),
        });

        await this.notifications.createNotification({
          tenantId: schedule.tenantId,
          userId: recipient.id,
          title: copy.title,
          message: copy.message,
          type: 'tacho_download_due',
          priority: stage === TachoDownloadReminderStage.overdue ? 'critical' : stage === TachoDownloadReminderStage.due_1d ? 'high' : 'medium',
          relatedEntityType: 'TachoDownloadSchedule',
          relatedEntityId: schedule.id,
        });

        sent += 1;
      }

      await this.prisma.tachoDownloadSchedule.update({
        where: { id: schedule.id },
        data: {
          lastReminderStage: stage,
          lastReminderSentAt: referenceDate,
        },
      });
    }

    return sent;
  }

  private shouldNotify(
    stage: TachoDownloadReminderStage,
    lastStage: TachoDownloadReminderStage | null,
    lastSentAt: Date | null,
    referenceDate: Date,
  ): boolean {
    if (stage === TachoDownloadReminderStage.overdue) {
      if (lastStage !== TachoDownloadReminderStage.overdue || !lastSentAt) {
        return true;
      }
      return this.diffInCalendarDays(lastSentAt, referenceDate) >= 7;
    }

    if (stage === TachoDownloadReminderStage.due_1d) {
      return lastStage !== TachoDownloadReminderStage.due_1d && lastStage !== TachoDownloadReminderStage.overdue;
    }

    return lastStage == null;
  }

  private resolveStage(referenceDate: Date, dueAt: Date): TachoDownloadReminderStage | null {
    const daysRemaining = this.diffInCalendarDays(referenceDate, dueAt);
    if (daysRemaining < 0) {
      return TachoDownloadReminderStage.overdue;
    }
    if (daysRemaining <= 1) {
      return TachoDownloadReminderStage.due_1d;
    }
    if (daysRemaining <= 7) {
      return TachoDownloadReminderStage.due_7d;
    }
    return null;
  }

  private diffInCalendarDays(from: Date, to: Date): number {
    const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.floor((toDay - fromDay) / DAY_MS);
  }

  private async collectRecipients(
    tenantId: string,
    stage: TachoDownloadReminderStage,
  ): Promise<Array<{ id: string; language: string | null }>> {
    const roles: UserRole[] =
      stage === TachoDownloadReminderStage.overdue ? ['office', 'boss'] : ['office'];
    return this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: roles },
        status: 'active',
      },
      select: {
        id: true,
        language: true,
      },
    });
  }

  private buildTemplateParams(
    subject: TachoDownloadSubject,
    driver: { firstName: string; lastName: string } | null,
    vehicle: { plateNumber: string } | null,
    nextDueAt: Date,
    intervalDays: number,
    referenceDate: Date,
  ): Record<string, string> {
    const daysRemaining = this.diffInCalendarDays(referenceDate, nextDueAt);
    const overdueDays = Math.max(0, -daysRemaining);

    const entityName = subject === TachoDownloadSubject.driver_card
      ? (driver ? `${driver.firstName} ${driver.lastName}`.trim() : 'unknown')
      : (vehicle?.plateNumber ?? 'unknown');

    return {
      subjectKind: subject,
      entityName,
      dueDate: nextDueAt.toISOString().slice(0, 10),
      intervalDays: String(intervalDays),
      daysRemaining: String(Math.max(0, daysRemaining)),
      overdueDays: String(overdueDays),
    };
  }

  private subjectTextForLanguage(
    language: string | null,
    subject: TachoDownloadSubject,
    entityName: string,
  ): string {
    const lang = language?.trim().toLowerCase();
    if (lang === 'tr') {
      return subject === TachoDownloadSubject.driver_card
        ? `Surucu karti ${entityName}`
        : `Arac unitesi ${entityName}`;
    }
    if (lang === 'en') {
      return subject === TachoDownloadSubject.driver_card
        ? `Driver card ${entityName}`
        : `Vehicle unit ${entityName}`;
    }
    return subject === TachoDownloadSubject.driver_card
      ? `Fahrerkarte ${entityName}`
      : `Massenspeicher ${entityName}`;
  }

  private deadlineTextForStage(
    language: string | null,
    stage: TachoDownloadReminderStage,
    daysRemaining: number,
    overdueDays: number,
  ): string {
    const lang = language?.trim().toLowerCase();

    if (lang === 'tr') {
      if (stage === TachoDownloadReminderStage.overdue) {
        return `okuma vadesi ${overdueDays} gündür aşıldı`;
      }
      if (stage === TachoDownloadReminderStage.due_1d && daysRemaining === 0) {
        return 'okuma vadesi bugün doluyor';
      }
      if (stage === TachoDownloadReminderStage.due_1d) {
        return `okuma vadesine ${daysRemaining} gün kaldı`;
      }
      return `okuma vadesine ${daysRemaining} gün kaldı`;
    }

    if (lang === 'en') {
      if (stage === TachoDownloadReminderStage.overdue) {
        return `download deadline overdue by ${overdueDays} days`;
      }
      if (stage === TachoDownloadReminderStage.due_1d && daysRemaining === 0) {
        return 'download deadline is due today';
      }
      if (stage === TachoDownloadReminderStage.due_1d) {
        return `download deadline in ${daysRemaining} day`;
      }
      return `download deadline in ${daysRemaining} days`;
    }

    if (stage === TachoDownloadReminderStage.overdue) {
      return `Auslesefrist seit ${overdueDays} Tagen überschritten`;
    }
    if (stage === TachoDownloadReminderStage.due_1d && daysRemaining === 0) {
      return 'Auslesefrist ist heute fällig';
    }
    return `Auslesefrist in ${daysRemaining} Tagen`;
  }
}
