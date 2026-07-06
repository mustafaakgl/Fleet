import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DtcSeverity } from '@prisma/client';
import { NotificationI18nService } from '../i18n/notification-i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getTachoAckSlaCutoff } from './tachograph-infringement-sla.util';

type InfringementRecipient = { id: string; language: string | null };

@Injectable()
export class TachographInfringementNotificationService {
  private readonly logger = new Logger(TachographInfringementNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly notificationI18n: NotificationI18nService,
  ) {}

  async notifyCreated(tenantId: string, infringementId: string): Promise<void> {
    const row = await this.prisma.tachoInfringement.findFirst({
      where: { id: infringementId, tenantId },
      select: {
        id: true,
        tenantId: true,
        type: true,
        severity: true,
        driver: {
          select: { id: true, firstName: true, lastName: true, userId: true },
        },
        vehicle: { select: { id: true, plateNumber: true } },
      },
    });

    if (!row) {
      return;
    }

    const recipients = await this.collectCreatedRecipients(row.tenantId, row.driver?.userId ?? null, row.severity);
    if (recipients.length === 0) {
      return;
    }

    const subject = this.buildSubject(row.driver, row.vehicle);

    for (const recipient of recipients) {
      const alreadySent = await this.prisma.notification.findFirst({
        where: {
          tenantId: row.tenantId,
          userId: recipient.id,
          type: 'tacho_infringement',
          relatedEntityType: 'TachoInfringement',
          relatedEntityId: row.id,
        },
        select: { id: true },
      });

      if (alreadySent) {
        continue;
      }

      const copy = this.notificationI18n.resolve(recipient.language, 'tacho_infringement', {
        severityLabel: this.severityLabel(row.severity, recipient.language),
        subject,
      });

      try {
        await this.notifications.createNotification({
          tenantId: row.tenantId,
          userId: recipient.id,
          title: copy.title,
          message: copy.message,
          type: 'tacho_infringement',
          priority: row.severity === DtcSeverity.critical ? 'critical' : 'medium',
          relatedEntityType: 'TachoInfringement',
          relatedEntityId: row.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to notify infringement ${row.id} for user ${recipient.id}: ${message}`);
      }
    }
  }

  @Cron('0 7 * * *', { timeZone: 'Europe/Berlin' })
  async runDailyAcknowledgementSweep(): Promise<void> {
    if ((process.env.TACHO_ACK_SLA_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      await this.processAcknowledgementReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`tachograph acknowledgement sweep failed: ${message}`);
    }
  }

  async processAcknowledgementReminders(referenceDate = new Date()): Promise<number> {
    const cutoff = getTachoAckSlaCutoff(referenceDate);
    const openInfringements = await this.prisma.tachoInfringement.findMany({
      where: {
        acknowledgedAt: null,
        occurredAt: { lte: cutoff },
      },
      select: {
        id: true,
        tenantId: true,
        severity: true,
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        vehicle: { select: { id: true, plateNumber: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });

    let reminders = 0;
    for (const infringement of openInfringements) {
      const recipientUsers = await this.prisma.user.findMany({
        where: {
          tenantId: infringement.tenantId,
          role: { in: ['boss', 'office'] },
          status: 'active',
        },
        select: { id: true, language: true },
      });

      const subject = this.buildSubject(infringement.driver, infringement.vehicle);
      const startOfDay = new Date(referenceDate);
      startOfDay.setHours(0, 0, 0, 0);

      for (const recipient of recipientUsers) {
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            tenantId: infringement.tenantId,
            userId: recipient.id,
            type: 'system',
            relatedEntityType: 'TachoInfringement',
            relatedEntityId: infringement.id,
            createdAt: { gte: startOfDay },
          },
          select: { id: true },
        });

        if (alreadySent) {
          continue;
        }

        const copy = this.notificationI18n.resolve(recipient.language, 'tacho_infringement_ack_reminder', {
          severityLabel: this.severityLabel(infringement.severity, recipient.language),
          subject,
        });

        try {
          await this.notifications.createNotification({
            tenantId: infringement.tenantId,
            userId: recipient.id,
            title: copy.title,
            message: copy.message,
            type: 'system',
            priority: 'high',
            relatedEntityType: 'TachoInfringement',
            relatedEntityId: infringement.id,
          });
          reminders += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to send acknowledgement reminder for infringement ${infringement.id}: ${message}`);
        }
      }
    }

    return reminders;
  }

  private async collectCreatedRecipients(
    tenantId: string,
    driverUserId: string | null,
    severity: DtcSeverity,
  ): Promise<InfringementRecipient[]> {
    const recipients = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['boss', 'office'] },
        status: 'active',
      },
      select: { id: true, language: true },
    });

    if (severity !== DtcSeverity.critical || !driverUserId) {
      return recipients;
    }

    const driver = await this.prisma.user.findUnique({
      where: { id: driverUserId },
      select: { id: true, language: true, status: true },
    });

    if (!driver || driver.status !== 'active') {
      return recipients;
    }

    const merged = [...recipients, { id: driver.id, language: driver.language }];
    const seen = new Set<string>();
    return merged.filter((recipient) => {
      if (seen.has(recipient.id)) {
        return false;
      }
      seen.add(recipient.id);
      return true;
    });
  }

  private severityLabel(severity: DtcSeverity, language?: string | null): string {
    const lang = language?.trim().toLowerCase();
    if (severity === DtcSeverity.critical) {
      if (lang === 'tr') return 'kritik';
      if (lang === 'en') return 'critical';
      return 'kritischer';
    }
    if (lang === 'tr') return 'orta seviyede';
    if (lang === 'en') return 'medium-severity';
    return 'mittelschwerer';
  }

  private buildSubject(
    driver: { firstName: string; lastName: string } | null | undefined,
    vehicle: { plateNumber: string } | null | undefined,
  ): string {
    const name = driver ? `${driver.firstName} ${driver.lastName}`.trim() : null;
    if (name && vehicle?.plateNumber) {
      return `${name} (${vehicle.plateNumber})`;
    }
    return name ?? vehicle?.plateNumber ?? 'tachograph record';
  }
}