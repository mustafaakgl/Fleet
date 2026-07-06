import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DtcSeverity } from '@prisma/client';
import { NotificationI18nService } from '../i18n/notification-i18n.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TachographInfringementNotificationService } from './tachograph-infringement-notification.service';

function createHarness() {
  const notifications: Array<{
    tenantId: string;
    userId: string;
    type: string;
    relatedEntityId: string;
    createdAt: Date;
  }> = [];

  const openOverdue = {
    id: 'open-overdue',
    tenantId: 'tenant-1',
    severity: DtcSeverity.critical,
    occurredAt: new Date('2026-06-20T07:00:00.000Z'),
    acknowledgedAt: null,
    driver: {
      id: 'driver-id',
      firstName: 'Murat',
      lastName: 'Demir',
      userId: 'driver-user',
    },
    vehicle: { id: 'vehicle-id', plateNumber: '34TR123' },
  };

  const acknowledgedOverdue = {
    id: 'ack-overdue',
    tenantId: 'tenant-1',
    severity: DtcSeverity.medium,
    occurredAt: new Date('2026-06-15T07:00:00.000Z'),
    acknowledgedAt: new Date('2026-06-16T07:00:00.000Z'),
    driver: {
      id: 'driver-id-2',
      firstName: 'Aylin',
      lastName: 'Yilmaz',
      userId: 'driver-user-2',
    },
    vehicle: { id: 'vehicle-id-2', plateNumber: '06ANK456' },
  };

  const recentOpen = {
    id: 'recent-open',
    tenantId: 'tenant-1',
    severity: DtcSeverity.medium,
    occurredAt: new Date('2026-07-04T07:00:00.000Z'),
    acknowledgedAt: null,
    driver: {
      id: 'driver-id-3',
      firstName: 'Can',
      lastName: 'Kaya',
      userId: 'driver-user-3',
    },
    vehicle: { id: 'vehicle-id-3', plateNumber: '35IZM789' },
  };

  const prisma = {
    tachoInfringement: {
      findMany: async ({ where }: { where: { acknowledgedAt: null; occurredAt: { lte: Date } } }) =>
        [openOverdue, acknowledgedOverdue, recentOpen].filter(
          (row) =>
            row.acknowledgedAt == null &&
            row.occurredAt <= where.occurredAt.lte,
        ),
    },
    notification: {
      findFirst: async ({ where }: { where: { tenantId: string; userId: string; relatedEntityId: string; createdAt?: { gte: Date } } }) =>
        notifications.some(
          (record) =>
            record.tenantId === where.tenantId &&
            record.userId === where.userId &&
            record.relatedEntityId === where.relatedEntityId &&
            (!where.createdAt || record.createdAt >= where.createdAt.gte),
        )
          ? { id: 'notification-id' }
          : null,
    },
    user: {
      findMany: async () => [
        { id: 'office-user', language: 'de' },
        { id: 'boss-user', language: 'en' },
      ],
    },
  };

  const notificationsService = {
    createNotification: async (payload: {
      tenantId: string;
      userId: string;
      type: string;
      relatedEntityId: string;
      priority: string;
    }) => {
      notifications.push({
        tenantId: payload.tenantId,
        userId: payload.userId,
        type: payload.type,
        relatedEntityId: payload.relatedEntityId,
        createdAt: new Date(),
      });
      return { id: `notification-${notifications.length}` };
    },
  };

  const i18n = {
    resolve: (_language: string | null | undefined, key: string) => ({
      title: key,
      message: key,
    }),
  };

  const service = new TachographInfringementNotificationService(
    prisma as unknown as PrismaService,
    notificationsService as unknown as NotificationsService,
    i18n as unknown as NotificationI18nService,
  );

  return { service, notifications };
}

describe('TachographInfringementNotificationService.processAcknowledgementReminders', () => {
  it('sends one reminder per recipient and skips acknowledged or recent infringements', async () => {
    const harness = createHarness();
    const firstRun = await harness.service.processAcknowledgementReminders(new Date('2026-07-06T07:00:00.000Z'));

    assert.equal(firstRun, 2);
    assert.equal(harness.notifications.length, 2);

    const secondRun = await harness.service.processAcknowledgementReminders(new Date('2026-07-06T07:00:00.000Z'));

    assert.equal(secondRun, 0);
    assert.equal(harness.notifications.length, 2);
  });
});
