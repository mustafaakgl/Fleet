import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TachoDownloadReminderStage,
  TachoDownloadSubject,
} from '@prisma/client';
import { NotificationI18nService } from '../i18n/notification-i18n.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TachographDownloadReminderService } from './tachograph-download-reminder.service';

type ScheduleRecord = {
  id: string;
  tenantId: string;
  subject: TachoDownloadSubject;
  driverId: string | null;
  vehicleId: string | null;
  intervalDays: number;
  nextDueAt: Date;
  enabled: boolean;
  lastReminderStage: TachoDownloadReminderStage | null;
  lastReminderSentAt: Date | null;
  driver: { firstName: string; lastName: string } | null;
  vehicle: { plateNumber: string } | null;
};

describe('TachographDownloadReminderService.processDueReminders', () => {
  it('triggers 7d/1d/overdue thresholds and avoids duplicate stage notifications', async () => {
    const reference = new Date('2026-07-10T08:00:00.000Z');

    const schedules: ScheduleRecord[] = [
      {
        id: 'schedule-7d',
        tenantId: 'tenant-1',
        subject: TachoDownloadSubject.driver_card,
        driverId: 'driver-1',
        vehicleId: null,
        intervalDays: 28,
        nextDueAt: new Date('2026-07-15T08:00:00.000Z'),
        enabled: true,
        lastReminderStage: null,
        lastReminderSentAt: null,
        driver: { firstName: 'Max', lastName: 'Meyer' },
        vehicle: null,
      },
      {
        id: 'schedule-1d',
        tenantId: 'tenant-1',
        subject: TachoDownloadSubject.vehicle_unit,
        driverId: null,
        vehicleId: 'vehicle-1',
        intervalDays: 90,
        nextDueAt: new Date('2026-07-11T08:00:00.000Z'),
        enabled: true,
        lastReminderStage: null,
        lastReminderSentAt: null,
        driver: null,
        vehicle: { plateNumber: 'B-AB 1234' },
      },
      {
        id: 'schedule-overdue',
        tenantId: 'tenant-1',
        subject: TachoDownloadSubject.vehicle_unit,
        driverId: null,
        vehicleId: 'vehicle-2',
        intervalDays: 90,
        nextDueAt: new Date('2026-07-01T08:00:00.000Z'),
        enabled: true,
        lastReminderStage: null,
        lastReminderSentAt: null,
        driver: null,
        vehicle: { plateNumber: 'B-CD 6789' },
      },
    ];

    const sent: Array<{ userId: string; relatedEntityId: string; type: string }> = [];

    const prisma = {
      tachoDownloadSchedule: {
        findMany: async () => schedules,
        update: async ({ where, data }: { where: { id: string }; data: { lastReminderStage: TachoDownloadReminderStage; lastReminderSentAt: Date } }) => {
          const found = schedules.find((row) => row.id === where.id);
          if (!found) {
            throw new Error('schedule not found');
          }
          found.lastReminderStage = data.lastReminderStage;
          found.lastReminderSentAt = data.lastReminderSentAt;
          return found;
        },
      },
      user: {
        findMany: async ({ where }: { where: { role: { in: string[] } } }) => {
          const users: Array<{ id: string; language: string }> = [];
          if (where.role.in.includes('office')) {
            users.push({ id: 'office-user', language: 'de' });
          }
          if (where.role.in.includes('boss')) {
            users.push({ id: 'boss-user', language: 'en' });
          }
          return users;
        },
      },
    };

    const notifications = {
      createNotification: async (payload: {
        userId: string;
        relatedEntityId: string;
        type: string;
      }) => {
        sent.push(payload);
        return { id: `notification-${sent.length}` };
      },
    };

    const i18n = {
      resolve: (_language: string | null | undefined, key: string, params: Record<string, string>) => ({
        title: key,
        message: `${params.subject} ${params.deadlineText}`,
      }),
    };

    const service = new TachographDownloadReminderService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      i18n as unknown as NotificationI18nService,
    );

    const firstRun = await service.processDueReminders(reference);
    assert.equal(firstRun, 4);

    const secondRun = await service.processDueReminders(reference);
    assert.equal(secondRun, 0);

    const thirdRun = await service.processDueReminders(new Date('2026-07-17T08:00:00.000Z'));
    assert.equal(thirdRun, 6);

    const stageBySchedule = new Map(schedules.map((row) => [row.id, row.lastReminderStage]));
    assert.equal(stageBySchedule.get('schedule-7d'), TachoDownloadReminderStage.overdue);
    assert.equal(stageBySchedule.get('schedule-1d'), TachoDownloadReminderStage.overdue);
    assert.equal(stageBySchedule.get('schedule-overdue'), TachoDownloadReminderStage.overdue);

    const firstRunTargets = sent.slice(0, 4).map((item) => `${item.relatedEntityId}:${item.userId}`).sort();
    assert.deepEqual(firstRunTargets, [
      'schedule-1d:office-user',
      'schedule-7d:office-user',
      'schedule-overdue:boss-user',
      'schedule-overdue:office-user',
    ]);
  });
});
