import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DtcSeverity } from '@prisma/client';
import { NotificationI18nService } from '../i18n/notification-i18n.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TachographInfringementNotificationService } from './tachograph-infringement-notification.service';

type NotificationRecord = {
  tenantId: string;
  userId: string;
  type: string;
  relatedEntityType: string;
  relatedEntityId: string;
  createdAt: Date;
};

function createHarness(row: {
  id: string;
  tenantId: string;
  severity: DtcSeverity;
  driverUserId: string | null;
  driverFirstName: string;
  driverLastName: string;
  vehiclePlate: string | null;
}) {
  const sent: Array<{ userId: string; type: string; relatedEntityId: string; priority: string }> = [];
  const notifications: NotificationRecord[] = [];

  const officeRecipient = { id: 'office-user', language: 'de' };
  const bossRecipient = { id: 'boss-user', language: 'en' };
  const driverRecipient = { id: 'driver-user', language: 'tr', status: 'active' as const };

  const prisma = {
    tachoInfringement: {
      findFirst: async () => ({
        id: row.id,
        tenantId: row.tenantId,
        type: 'daily_driving_exceeded',
        severity: row.severity,
        driver: row.driverUserId
          ? {
              id: 'driver-id',
              firstName: row.driverFirstName,
              lastName: row.driverLastName,
              userId: row.driverUserId,
            }
          : null,
        vehicle: row.vehiclePlate ? { id: 'vehicle-id', plateNumber: row.vehiclePlate } : null,
      }),
      findMany: async () => [],
    },
    notification: {
      findFirst: async ({ where }: { where: { tenantId: string; userId: string; type: string; relatedEntityId: string } }) =>
        notifications.some(
          (record) =>
            record.tenantId === where.tenantId &&
            record.userId === where.userId &&
            record.type === where.type &&
            record.relatedEntityId === where.relatedEntityId,
        )
          ? { id: 'notification-id' }
          : null,
    },
    user: {
      findMany: async () => [officeRecipient, bossRecipient],
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === driverRecipient.id ? driverRecipient : null,
    },
  };

  const notificationsService = {
    createNotification: async (payload: {
      tenantId: string;
      userId: string;
      type: string;
      priority: string;
      relatedEntityId: string;
    }) => {
      sent.push(payload);
      notifications.push({
        tenantId: payload.tenantId,
        userId: payload.userId,
        type: payload.type,
        relatedEntityType: 'TachoInfringement',
        relatedEntityId: payload.relatedEntityId,
        createdAt: new Date(),
      });
      return { id: `notification-${sent.length}` };
    },
  };

  const i18n = {
    resolve: (_language: string | null | undefined, key: string, params: Record<string, string>) => ({
      title: `${key}:${params.severityLabel}`,
      message: params.subject,
    }),
  };

  const service = new TachographInfringementNotificationService(
    prisma as unknown as PrismaService,
    notificationsService as unknown as NotificationsService,
    i18n as unknown as NotificationI18nService,
  );

  return { service, sent, notifications };
}

describe('TachographInfringementNotificationService.notifyCreated', () => {
  it('sends created notifications to office and boss for medium infringements', async () => {
    const harness = createHarness({
      id: 'infr-1',
      tenantId: 'tenant-1',
      severity: DtcSeverity.medium,
      driverUserId: null,
      driverFirstName: 'Murat',
      driverLastName: 'Demir',
      vehiclePlate: '34TR123',
    });

    await harness.service.notifyCreated('tenant-1', 'infr-1');

    assert.deepEqual(
      harness.sent.map((entry) => entry.userId).sort(),
      ['boss-user', 'office-user'],
    );
    assert.equal(harness.sent.some((entry) => entry.userId === 'driver-user'), false);
  });

  it('includes the driver for critical infringements when the driver user is active', async () => {
    const harness = createHarness({
      id: 'infr-2',
      tenantId: 'tenant-1',
      severity: DtcSeverity.critical,
      driverUserId: 'driver-user',
      driverFirstName: 'Murat',
      driverLastName: 'Demir',
      vehiclePlate: '34TR123',
    });

    await harness.service.notifyCreated('tenant-1', 'infr-2');

    assert.deepEqual(
      harness.sent.map((entry) => entry.userId).sort(),
      ['boss-user', 'driver-user', 'office-user'],
    );
  });

  it('does not create duplicate notifications for the same infringement and recipient', async () => {
    const harness = createHarness({
      id: 'infr-3',
      tenantId: 'tenant-1',
      severity: DtcSeverity.critical,
      driverUserId: 'driver-user',
      driverFirstName: 'Murat',
      driverLastName: 'Demir',
      vehiclePlate: '34TR123',
    });

    await harness.service.notifyCreated('tenant-1', 'infr-3');
    await harness.service.notifyCreated('tenant-1', 'infr-3');

    assert.equal(harness.sent.length, 3);
  });
});
