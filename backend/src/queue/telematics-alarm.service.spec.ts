import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TelematicsAlarmService } from './telematics-alarm.service';
import { TELEMATICS_THRESHOLDS } from './telematics-thresholds';

describe('TelematicsAlarmService', () => {
  it('suppresses duplicate fuel theft notifications within the suppression window', async () => {
    const previous = process.env.TELEMATICS_ALARM_SUPPRESSION_MS;
    process.env.TELEMATICS_ALARM_SUPPRESSION_MS = String(4 * 60 * 60 * 1000);

    let notificationCount = 0;
    const prisma = {
      unscoped: {
        notification: {
          count: async () => notificationCount,
        },
        user: {
          findMany: async () => [{ id: 'office-1' }],
        },
      },
    };
    const notifications = {
      createNotification: async () => {
        notificationCount += 1;
      },
    };

  const service = new TelematicsAlarmService(prisma as never, notifications as never);
    const ctx = {
      tenantId: 'default-tenant',
      vehicleId: 'veh-1',
      recordedAt: new Date(),
      latitude: 52.5,
      longitude: 13.4,
      fuelLevelPct: 40,
      ignition: false,
    };

    const baselineAt = ctx.recordedAt.getTime() - 5 * 60 * 1000;
    (service as unknown as { fuelBaseline: Map<string, { pct: number; atMs: number }> }).fuelBaseline.set(
      'veh-1',
      { pct: 60, atMs: baselineAt },
    );

    await service.evaluateThresholds(ctx);
    await service.evaluateThresholds({ ...ctx, recordedAt: new Date(ctx.recordedAt.getTime() + 60_000) });

    assert.equal(notificationCount, 1);

    if (previous) {
      process.env.TELEMATICS_ALARM_SUPPRESSION_MS = previous;
    } else {
      delete process.env.TELEMATICS_ALARM_SUPPRESSION_MS;
    }
    void TELEMATICS_THRESHOLDS;
  });
});
