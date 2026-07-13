import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrivacyService } from './privacy.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import type { MetricsService } from '../metrics/metrics.service';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildBatchModel<T extends { id: string }>(rows: T[]) {
  const state = [...rows];
  return {
    findMany: async ({ where, take }: { where: Record<string, { lt: Date }>; take: number }) => {
      const [field, condition] = Object.entries(where)[0] as [keyof T, { lt: Date }];
      return state
        .filter((row) => {
          const value = row[field];
          return value instanceof Date && value < condition.lt;
        })
        .sort((left, right) => {
          const leftValue = (left[field] as Date).getTime();
          const rightValue = (right[field] as Date).getTime();
          return leftValue - rightValue;
        })
        .slice(0, take)
        .map((row) => ({ id: row.id }));
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      const before = state.length;
      const keep = state.filter((row) => !where.id.in.includes(row.id));
      state.splice(0, state.length, ...keep);
      return { count: before - state.length };
    },
    remainingIds: () => state.map((row) => row.id),
  };
}

function buildService(overrides?: {
  prisma?: Partial<PrismaService>;
  audit?: Partial<AuditService>;
  objectStorage?: Partial<ObjectStorageService>;
  metrics?: Partial<MetricsService>;
}) {
  const auditCalls: Array<Record<string, unknown>> = [];
  const metricsCalls: Array<{ entity: string; count: number }> = [];

  const service = new PrivacyService(
    ({ ...overrides?.prisma } as PrismaService),
    ({
      logAction: async (payload: Record<string, unknown>) => {
        auditCalls.push(payload);
      },
      ...overrides?.audit,
    } as AuditService),
    ({ deleteStoredFile: async () => undefined, ...overrides?.objectStorage } as ObjectStorageService),
    ({
      retentionDeletedRowsTotal: {
        inc: ({ entity }: { entity: string }, count: number) => {
          metricsCalls.push({ entity, count });
        },
      },
      ...overrides?.metrics,
    } as MetricsService),
  );

  return { service, auditCalls, metricsCalls };
}

describe('PrivacyService retention', () => {
  it('keeps 89-day location rows and deletes 91-day rows', async () => {
    process.env.DRIVER_LOCATION_HISTORY_RETENTION_DAYS = '90';
    process.env.RETENTION_BATCH_SIZE = '10000';

    const locationHistory = buildBatchModel([
      { id: 'loc-keep', recordedAt: daysAgo(89) },
      { id: 'loc-delete', recordedAt: daysAgo(91) },
    ]);

    const { service, metricsCalls } = buildService({
      prisma: {
        driverLocationHistory: locationHistory,
      } as unknown as PrismaService,
    });

    const result = await service.purgeOldLocationHistory();

    assert.equal(result.deleted, 1);
    assert.deepEqual(locationHistory.remainingIds(), ['loc-keep']);
    assert.deepEqual(metricsCalls, [{ entity: 'driver_location_history', count: 1 }]);
  });

  it('purges telemetry retention targets in batches and leaves fleet trips untouched', async () => {
    process.env.DRIVER_LOCATION_HISTORY_RETENTION_DAYS = '90';
    process.env.TELEMETRY_PROCESSED_RECORD_RETENTION_DAYS = '30';
    process.env.FLEET_DRIVING_EVENT_RETENTION_DAYS = '180';
    process.env.TELEMETRY_QUARANTINE_RETENTION_DAYS = '30';
    process.env.RETENTION_BATCH_SIZE = '1';

    const locationHistory = buildBatchModel([{ id: 'loc-1', recordedAt: daysAgo(91) }]);
    const processedRecords = buildBatchModel([{ id: 'tp-1', createdAt: daysAgo(31) }]);
    const drivingEvents = buildBatchModel([{ id: 'fde-1', occurredAt: daysAgo(181) }]);
    const quarantine = buildBatchModel([{ id: 'tq-1', createdAt: daysAgo(31) }]);
    let fleetTripTouched = false;

    const { service, auditCalls, metricsCalls } = buildService({
      prisma: {
        driverLocationHistory: locationHistory,
        telemetryProcessedRecord: processedRecords,
        fleetDrivingEvent: drivingEvents,
        telemetryQuarantine: quarantine,
        fleetTrip: {
          deleteMany: async () => {
            fleetTripTouched = true;
            return { count: 0 };
          },
          findMany: async () => {
            fleetTripTouched = true;
            return [];
          },
        },
      } as unknown as PrismaService,
    });

    const summary = await service.purgeTelemetryRetentionData('actor-1');

    assert.equal(summary.totalDeleted, 4);
    assert.equal(summary.driverLocationHistory.batches, 1);
    assert.equal(summary.telemetryProcessedRecord.batches, 1);
    assert.equal(summary.fleetDrivingEvent.batches, 1);
    assert.equal(summary.telemetryQuarantine.batches, 1);
    assert.equal(fleetTripTouched, false);
    assert.deepEqual(metricsCalls, [
      { entity: 'driver_location_history', count: 1 },
      { entity: 'telemetry_processed_records', count: 1 },
      { entity: 'fleet_driving_events', count: 1 },
      { entity: 'telemetry_quarantine', count: 1 },
    ]);
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0]?.action, 'privacy.retention_daily_summary');
    assert.match(String(auditCalls[0]?.summary), /retention: 1 location, 1 telemetry, 1 driving events, 1 quarantine silindi/);
  });
});