import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TelemetryIngestService } from './telemetry-ingest.service';

function createHarness() {
  const telemetryLatest = new Map<string, { recordedAt: Date; ignition: boolean }>();
  const processed = new Set<string>();
  let telemetryUpsertCalls = 0;

  const prisma = {
    unscoped: {
      telemetryProcessedRecord: {
        createMany: async ({ data }: { data: Array<{ imei: string; recordedAt: Date; priority: number }> }) => {
          const row = data[0];
          const key = `${row.imei}:${row.recordedAt.toISOString()}:${row.priority}`;
          if (processed.has(key)) {
            return { count: 0 };
          }
          processed.add(key);
          return { count: 1 };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(prisma.unscoped),
      assignment: {
        findFirst: async () => ({ driverId: 'driver-1' }),
      },
      driverLocationLatest: { upsert: async () => {} },
      driverLocationHistory: { create: async () => {} },
      vehicleTelemetryLatest: {
        findUnique: async ({ where }: { where: { vehicleId: string } }) =>
          telemetryLatest.get(where.vehicleId) ?? null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { vehicleId: string };
          create: { recordedAt: Date; ignition: boolean };
          update: { recordedAt: Date; ignition: boolean };
        }) => {
          telemetryUpsertCalls += 1;
          telemetryLatest.set(where.vehicleId, {
            recordedAt: update?.recordedAt ?? create.recordedAt,
            ignition: update?.ignition ?? create.ignition,
          });
        },
      },
      device: { updateMany: async () => ({ count: 1 }) },
    },
  };

  const metrics = { telematicsFramesTotal: { inc() {} } };
  const tripBuilder = { handleRecord: async () => {} };
  const alarms = { evaluateThresholds: async () => {} };

  const service = new TelemetryIngestService(
    prisma as never,
    metrics as never,
    tripBuilder as never,
    alarms as never,
  );

  return { service, telemetryLatest, getTelemetryUpsertCalls: () => telemetryUpsertCalls };
}

describe('TelemetryIngestService', () => {
  it('skips duplicate imei+timestamp+priority records', async () => {
    const { service, getTelemetryUpsertCalls } = createHarness();
    const payload = {
      tenantId: 'default-tenant',
      vehicleId: 'veh-1',
      imei: '359339080000101',
      records: [
        {
          timestampMs: 1_700_000_000_000,
          priority: 1,
          latitude: 52.5,
          longitude: 13.4,
          speedKph: 40,
          angleDeg: 90,
          ignition: true,
          events: [],
          dtcPresent: false,
          dtc: [],
        },
      ],
    };

    await service.processIngestJob(payload);
    await service.processIngestJob(payload);

    assert.equal(getTelemetryUpsertCalls(), 1);
  });

  it('does not overwrite VehicleTelemetryLatest with older recordedAt', async () => {
    const { service, telemetryLatest } = createHarness();
    const newerMs = 1_700_000_100_000;
    const olderMs = 1_700_000_000_000;

    await service.processIngestJob({
      tenantId: 'default-tenant',
      vehicleId: 'veh-1',
      imei: '359339080000101',
      records: [
        {
          timestampMs: newerMs,
          priority: 1,
          latitude: 52.5,
          longitude: 13.4,
          speedKph: 40,
          angleDeg: 90,
          ignition: true,
          events: [],
          dtcPresent: false,
          dtc: [],
        },
      ],
    });

    await service.processIngestJob({
      tenantId: 'default-tenant',
      vehicleId: 'veh-1',
      imei: '359339080000101',
      records: [
        {
          timestampMs: olderMs,
          priority: 1,
          latitude: 52.5,
          longitude: 13.4,
          speedKph: 10,
          angleDeg: 90,
          ignition: false,
          events: [],
          dtcPresent: false,
          dtc: [],
        },
      ],
    });

    const latest = telemetryLatest.get('veh-1');
    assert.ok(latest);
    assert.equal(latest.recordedAt.getTime(), newerMs);
    assert.equal(latest.ignition, true);
  });
});
