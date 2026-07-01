import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DtcSeverity, FleetDrivingEventType, LocationSource, Prisma } from '@prisma/client';
import { TrackingService } from './tracking.service';

type IngestTelemetryPayload = {
  vehicleId: string;
  imei?: string;
  latitude: number;
  longitude: number;
  recordedAt?: string;
  speedMps?: number;
  headingDeg?: number;
  ignition?: boolean;
  rpm?: number;
  fuelLevelPct?: number;
  coolantTemp?: number;
  voltage?: number;
  odometerKm?: number;
  events?: Array<{ type: 'speeding' | 'harsh_accel' | 'harsh_brake' | 'harsh_corner' | 'crash'; value: number; threshold?: number }>;
  dtc?: Array<{ code: string; description?: string; severity: 'medium' | 'critical' }>;
};

type Capture = {
  vehicleTelemetryUpsertArgs: Array<{ create: { tenantId: string }; update: { ignition: boolean } }>;
  vehicleDtcCreateManyData: Array<Array<{ tenantId: string; vehicleId: string; code: string; severity: DtcSeverity }>>;
  fleetTripCreateData: Array<{ source: string; status: string }>;
  fleetDrivingEventCreateManyData: Array<Array<{ type: FleetDrivingEventType; tripId: string }>>;
  createdNotifications: Array<{ userId: string; relatedEntityType: string; priority: string }>;
  userFindManyCalls: number;
};

type TransactionMock = {
  vehicle: { findUnique: (args: unknown) => Promise<{ id: string; tenantId: string; plateNumber: string } | null> };
  device: {
    findUnique: (args: unknown) => Promise<{ id: string; tenantId: string; vehicleId: string | null } | null>;
    update: (args: unknown) => Promise<void>;
  };
  assignment: {
    findMany: (args: unknown) => Promise<Array<{ id: string; driverId: string; status: string }>>;
  };
  driverLocationLatest: { upsert: (args: unknown) => Promise<void> };
  driverLocationHistory: { create: (args: unknown) => Promise<void> };
  vehicleTelemetryLatest: {
    upsert: (args: {
      create: { tenantId: string };
      update: { ignition: boolean };
    }) => Promise<void>;
  };
  vehicleDtc: {
    createMany: (args: {
      data: Array<{ tenantId: string; vehicleId: string; code: string; severity: DtcSeverity }>;
    }) => Promise<void>;
    findMany?: (args: unknown) => Promise<unknown[]>;
  };
  fleetTrip: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: { data: { source: string; status: string } }) => Promise<{ id: string }>;
    groupBy?: (args: unknown) => Promise<unknown[]>;
  };
  fleetDrivingEvent: {
    createMany: (args: { data: Array<{ type: FleetDrivingEventType; tripId: string }> }) => Promise<void>;
    groupBy?: (args: unknown) => Promise<unknown[]>;
  };
  driver?: { findMany: (args: unknown) => Promise<Array<{ id: string; firstName: string; lastName: string }>> };
};

function createIngestHarness(options?: { deduped?: boolean }) {
  const capture: Capture = {
    vehicleTelemetryUpsertArgs: [],
    vehicleDtcCreateManyData: [],
    fleetTripCreateData: [],
    fleetDrivingEventCreateManyData: [],
    createdNotifications: [],
    userFindManyCalls: 0,
  };

  const tx: TransactionMock = {
    vehicle: {
      findUnique: async () => ({ id: 'veh-1', tenantId: 'tenant-a', plateNumber: '34ABC34' }),
    },
    device: {
      findUnique: async () => null,
      update: async () => undefined,
    },
    assignment: {
      findMany: async () => [{ id: 'asg-1', driverId: 'drv-1', status: 'in_progress' }],
    },
    driverLocationLatest: {
      upsert: async () => undefined,
    },
    driverLocationHistory: {
      create: async () => undefined,
    },
    vehicleTelemetryLatest: {
      upsert: async (args) => {
        capture.vehicleTelemetryUpsertArgs.push(args);
      },
    },
    vehicleDtc: {
      createMany: async (args) => {
        capture.vehicleDtcCreateManyData.push(args.data);
      },
    },
    fleetTrip: {
      findFirst: async () => null,
      create: async (args) => {
        capture.fleetTripCreateData.push(args.data);
        return { id: 'trip-1' };
      },
    },
    fleetDrivingEvent: {
      createMany: async (args) => {
        capture.fleetDrivingEventCreateManyData.push(args.data);
      },
    },
  };

  const prismaMock = {
    unscoped: {
      $transaction: async <T>(callback: (client: TransactionMock) => Promise<T>): Promise<T> => callback(tx),
      notification: {
        findFirst: async () => (options?.deduped ? { id: 'notif-1' } : null),
      },
      user: {
        findMany: async () => {
          capture.userFindManyCalls += 1;
          return [{ id: 'ops-1' }, { id: 'ops-2' }];
        },
      },
    },
  } as unknown as {
    unscoped: {
      $transaction: <T>(callback: (client: TransactionMock) => Promise<T>) => Promise<T>;
      notification: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
      user: { findMany: (args: unknown) => Promise<Array<{ id: string }>> };
    };
  };

  const notificationsServiceMock = {
    createNotification: async (input: {
      userId: string;
      relatedEntityType: string;
      priority: string;
    }) => {
      capture.createdNotifications.push(input);
      return { id: `n-${capture.createdNotifications.length}` };
    },
  };

  const auditServiceMock = {
    logAction: async () => undefined,
  };

  const service = new TrackingService(
    prismaMock as never,
    auditServiceMock as never,
    notificationsServiceMock as never,
  );

  return { service, capture };
}

describe('TrackingService.ingestTelemetry', () => {
  it('writes telemetry latest, dtc, device trip and driving events', async () => {
    const { service, capture } = createIngestHarness();

    const payload: IngestTelemetryPayload = {
      vehicleId: 'veh-1',
      latitude: 41.0082,
      longitude: 28.9784,
      recordedAt: new Date().toISOString(),
      ignition: true,
      rpm: 1800,
      fuelLevelPct: 42,
      coolantTemp: 88,
      voltage: 11.5,
      odometerKm: 125001,
      dtc: [
        { code: 'P2002', severity: 'critical' },
        { code: 'P1000', severity: 'medium' },
      ],
      events: [
        { type: 'speeding', value: 128, threshold: 120 },
        { type: 'harsh_brake', value: 7.2, threshold: 6.5 },
      ],
    };

    const result = await service.ingestTelemetry(payload as never);

    assert.equal(result.accepted, true);
    assert.equal(result.source, LocationSource.telematics);
    assert.equal(result.tripId, 'trip-1');

    assert.equal(capture.vehicleTelemetryUpsertArgs.length, 1);
    assert.equal(capture.vehicleTelemetryUpsertArgs[0]?.create.tenantId, 'tenant-a');
    assert.equal(capture.vehicleTelemetryUpsertArgs[0]?.update.ignition, true);

    assert.equal(capture.vehicleDtcCreateManyData.length, 1);
    assert.equal(capture.vehicleDtcCreateManyData[0]?.length, 2);
    assert.equal(capture.vehicleDtcCreateManyData[0]?.[0]?.vehicleId, 'veh-1');
    assert.equal(capture.vehicleDtcCreateManyData[0]?.[0]?.severity, DtcSeverity.critical);

    assert.equal(capture.fleetTripCreateData.length, 1);
    assert.equal(capture.fleetTripCreateData[0]?.source, 'device');

    assert.equal(capture.fleetDrivingEventCreateManyData.length, 1);
    const eventTypes = (capture.fleetDrivingEventCreateManyData[0] ?? []).map((event) => event.type);
    assert.deepEqual(eventTypes.sort(), [FleetDrivingEventType.harsh_brake, FleetDrivingEventType.speeding].sort());

    // 3 trigger x 2 operational users = 6 notification rows.
    assert.equal(capture.createdNotifications.length, 6);
    assert.equal(capture.createdNotifications.some((item) => item.relatedEntityType === 'telematics_critical_dtc'), true);
    assert.equal(capture.createdNotifications.some((item) => item.relatedEntityType === 'telematics_low_voltage'), true);
    assert.equal(capture.createdNotifications.some((item) => item.relatedEntityType === 'telematics_overspeed'), true);
  });

  it('deduplicates notification creation when a recent alert exists', async () => {
    const { service, capture } = createIngestHarness({ deduped: true });

    const payload: IngestTelemetryPayload = {
      vehicleId: 'veh-1',
      latitude: 41.0082,
      longitude: 28.9784,
      recordedAt: new Date().toISOString(),
      dtc: [{ code: 'P2002', severity: 'critical' }],
    };

    await service.ingestTelemetry(payload as never);

    assert.equal(capture.createdNotifications.length, 0);
    assert.equal(capture.userFindManyCalls, 0);
  });
});

describe('Tracking telematics read models', () => {
  it('returns expected shape for vehicle-health and driver-scores using scoped prisma only', async () => {
    const unscopedGuard = new Proxy(
      {},
      {
        get: () => {
          throw new Error('unscoped prisma access is not allowed in telematics read endpoints');
        },
      },
    );

    const prismaMock = {
      unscoped: unscopedGuard,
      vehicle: {
        findMany: async () => [
          {
            id: 'veh-1',
            plateNumber: '34ABC34',
            telemetryLatest: {
              ignition: true,
              rpm: 1700,
              fuelLevelPct: new Prisma.Decimal(52.4),
              coolantTemp: new Prisma.Decimal(90.1),
              voltage: new Prisma.Decimal(12.4),
              odometerKm: new Prisma.Decimal(10500.5),
              recordedAt: new Date('2026-06-12T10:00:00.000Z'),
            },
          },
        ],
      },
      vehicleDtc: {
        findMany: async () => [
          {
            vehicleId: 'veh-1',
            code: 'P2002',
            description: 'DPF efficiency below threshold',
            severity: DtcSeverity.critical,
            occurredAt: new Date('2026-06-12T10:00:00.000Z'),
            vehicle: { plateNumber: '34ABC34' },
          },
        ],
      },
      fleetTrip: {
        groupBy: async () => [{ driverId: 'drv-1', _avg: { score: new Prisma.Decimal(88.4) } }],
      },
      fleetDrivingEvent: {
        groupBy: async () => [
          { driverId: 'drv-1', type: FleetDrivingEventType.speeding, _count: { _all: 2 } },
          { driverId: 'drv-1', type: FleetDrivingEventType.harsh_brake, _count: { _all: 1 } },
        ],
      },
      driver: {
        findMany: async () => [{ id: 'drv-1', firstName: 'Ali', lastName: 'Yilmaz' }],
      },
    };

    const service = new TrackingService(
      prismaMock as never,
      { logAction: async () => undefined } as never,
      { createNotification: async () => ({ id: 'n1' }) } as never,
    );

    const vehicleHealth = await service.getTelematicsVehicleHealth();
    assert.deepEqual(Object.keys(vehicleHealth).sort(), ['openDtcs', 'summary', 'vehicles']);
    assert.equal(vehicleHealth.vehicles.length, 1);
    assert.equal(vehicleHealth.vehicles[0]?.health, 'critical');
    assert.equal(vehicleHealth.openDtcs[0]?.code, 'P2002');

    const driverScores = await service.getTelematicsDriverScores();
    assert.deepEqual(Object.keys(driverScores).sort(), ['drivers', 'fleetAverage']);
    assert.equal(driverScores.drivers.length, 1);
    assert.equal(driverScores.drivers[0]?.name, 'Ali Yilmaz');
    assert.equal(typeof driverScores.fleetAverage, 'number');
  });

  it('smoke: processes sim-like payload and exposes baseline telematics fields', async () => {
    const { service } = createIngestHarness();

    await service.ingestTelemetry({
      vehicleId: 'veh-1',
      latitude: 39.9334,
      longitude: 32.8597,
      recordedAt: new Date().toISOString(),
      ignition: true,
      speedMps: 21,
      rpm: 1900,
      events: [{ type: 'speeding', value: 126, threshold: 120 }],
    } as never);

    const readPrisma = {
      unscoped: {},
      vehicle: {
        findMany: async () => [
          {
            id: 'veh-1',
            plateNumber: '06SIM06',
            telemetryLatest: {
              ignition: true,
              rpm: 1900,
              fuelLevelPct: null,
              coolantTemp: null,
              voltage: new Prisma.Decimal(12.2),
              odometerKm: new Prisma.Decimal(49001),
              recordedAt: new Date(),
            },
          },
        ],
      },
      vehicleDtc: { findMany: async () => [] },
      fleetTrip: { groupBy: async () => [{ driverId: 'drv-1', _avg: { score: new Prisma.Decimal(92) } }] },
      fleetDrivingEvent: {
        groupBy: async () => [{ driverId: 'drv-1', type: FleetDrivingEventType.speeding, _count: { _all: 1 } }],
      },
      driver: { findMany: async () => [{ id: 'drv-1', firstName: 'Sim', lastName: 'Driver' }] },
    };

    const readService = new TrackingService(
      readPrisma as never,
      { logAction: async () => undefined } as never,
      { createNotification: async () => ({ id: 'n2' }) } as never,
    );

    const health = await readService.getTelematicsVehicleHealth();
    const scores = await readService.getTelematicsDriverScores();

    assert.equal(typeof health.summary.ok, 'number');
    assert.equal(typeof health.vehicles[0]?.latest.rpm, 'number');
    assert.equal(typeof health.vehicles[0]?.latest.recordedAt, 'string');
    assert.equal(typeof scores.fleetAverage, 'number');
    assert.equal(typeof scores.drivers[0]?.score, 'number');
  });
});
