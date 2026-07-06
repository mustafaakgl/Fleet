import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  DddFileProcessingStatus,
  DddFileSource,
  PrismaClient,
  TachoDownloadSubject,
} from '@prisma/client';
import { TachographService } from './tachograph.service';

type ParsedDdd = {
  fileType: 'card' | 'vu' | 'unknown';
  generation: number | 'unknown';
  signature: { valid: boolean | null };
  warnings: string[];
  skippedBlocks: unknown[];
  driverCardNo?: string;
  activities: Array<{ startedAt: string; durationS: number; state: 'driving' | 'rest' | 'work' | 'available' }>;
  events: unknown[];
};

class TestPrismaService extends PrismaClient {}

function createHarness(
  parsed: ParsedDdd | Error,
  options?: {
    resolvedDriverId?: string;
    existingSchedule?: {
      id: string;
      tenantId: string;
      subject: TachoDownloadSubject;
      driverId: string | null;
      vehicleId: string | null;
      intervalDays: number;
      enabled: boolean;
      nextDueAt: Date;
      lastFulfilledAt: Date | null;
      lastFulfilledDddFileId: string | null;
    };
  },
) {
  const tempDir = mkdtempSync(join(tmpdir(), 'ddd-consumer-'));
  const storedPath = join(tempDir, 'sample.ddd');
  writeFileSync(storedPath, Buffer.from('ddd-fake'));

  const file = {
    id: 'ddd-1',
    tenantId: 'default-tenant',
    vehicleId: 'veh-1',
    uploadedByUserId: 'user-1',
    storedPath,
    status: DddFileProcessingStatus.pending,
    processingErrorSummary: null as string | null,
    fileType: 'unknown',
    source: DddFileSource.manual,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    sizeBytes: 8,
    sha256: 'abc123',
    generation: null as number | null,
    signatureValid: null as boolean | null,
    skippedBlocks: null as unknown,
    driverId: null as string | null,
  };

  let parseCalls = 0;
  let activityCreates = 0;
  let schedule = options?.existingSchedule
    ? {
        ...options.existingSchedule,
      }
    : null;

  const prisma = {
    dddFile: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === file.id && where.tenantId === file.tenantId ? file : null,
      findUnique: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(file, data);
        return file;
      },
      create: async () => file,
    },
    driver: {
      findFirst: async () =>
        options?.resolvedDriverId
          ? {
              id: options.resolvedDriverId,
              licenseNumber: 'CARD-TR-0001',
            }
          : null,
    },
    tachoActivity: {
      createMany: async ({ data }: { data: unknown[] }) => {
        activityCreates += 1;
        return { count: data.length };
      },
      findMany: async () => [],
    },
    tachoInfringement: {
      findUnique: async () => null,
      create: async () => ({ id: 'infr-1' }),
    },
    tachoDownloadSchedule: {
      findFirst: async ({ where }: { where: { tenantId: string; subject: TachoDownloadSubject; driverId: string | null; vehicleId: string | null } }) =>
        schedule &&
        schedule.tenantId === where.tenantId &&
        schedule.subject === where.subject &&
        schedule.driverId === where.driverId &&
        schedule.vehicleId === where.vehicleId
          ? {
              id: schedule.id,
              intervalDays: schedule.intervalDays,
            }
          : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (!schedule || schedule.id !== where.id) {
          throw new Error('schedule not found');
        }
        schedule = {
          ...schedule,
          ...data,
        } as typeof schedule;
        return schedule;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        schedule = {
          id: 'schedule-created',
          tenantId: String(data.tenantId),
          subject: data.subject as TachoDownloadSubject,
          driverId: (data.driverId as string | null) ?? null,
          vehicleId: (data.vehicleId as string | null) ?? null,
          intervalDays: Number(data.intervalDays),
          enabled: Boolean(data.enabled),
          nextDueAt: data.nextDueAt as Date,
          lastFulfilledAt: (data.lastFulfilledAt as Date | null) ?? null,
          lastFulfilledDddFileId: (data.lastFulfilledDddFileId as string | null) ?? null,
        };
        return schedule;
      },
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>) => fn(prisma),
  } as unknown as PrismaClient;

  const parser = {
    parse: () => {
      parseCalls += 1;
      if (parsed instanceof Error) {
        throw parsed;
      }
      return parsed;
    },
  };

  return {
    service: new TachographService(prisma as never, undefined, parser as never),
    file,
    getSchedule: () => schedule,
    getParseCalls: () => parseCalls,
    getActivityCreates: () => activityCreates,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

afterEach(() => {
  // Per-test cleanup happens in the test body.
});

describe('TachographService consumer', () => {
  it('processes a DDD file successfully and marks it processed', async () => {
    const harness = createHarness({
      fileType: 'card',
      generation: 1,
      signature: { valid: true },
      warnings: [],
      skippedBlocks: [],
      activities: [{ startedAt: '2026-07-06T10:00:00.000Z', durationS: 600, state: 'driving' }],
      events: [],
    });

    await harness.service.processDddFile('default-tenant', 'ddd-1');

    assert.equal(harness.file.status, DddFileProcessingStatus.processed);
    assert.equal(harness.file.processingErrorSummary, null);
    assert.equal(harness.getParseCalls(), 1);
    assert.equal(harness.getActivityCreates(), 1);

    harness.cleanup();
  });

  it('marks failed and stores a short error summary when parsing fails', async () => {
    const harness = createHarness(new Error('parser exploded with a very long reason string'));

    await assert.rejects(
      harness.service.processDddFile('default-tenant', 'ddd-1'),
      /parser exploded/,
    );

    assert.equal(harness.file.status, DddFileProcessingStatus.failed);
    assert.ok(harness.file.processingErrorSummary);
    assert.match(harness.file.processingErrorSummary!, /parser exploded/);

    harness.cleanup();
  });

  it('does not reprocess an already processed file', async () => {
    const harness = createHarness({
      fileType: 'card',
      generation: 1,
      signature: { valid: true },
      warnings: [],
      skippedBlocks: [],
      activities: [{ startedAt: '2026-07-06T10:00:00.000Z', durationS: 600, state: 'driving' }],
      events: [],
    });

    await harness.service.processDddFile('default-tenant', 'ddd-1');
    await harness.service.processDddFile('default-tenant', 'ddd-1');

    assert.equal(harness.file.status, DddFileProcessingStatus.processed);
    assert.equal(harness.getParseCalls(), 1);
    assert.equal(harness.getActivityCreates(), 1);

    harness.cleanup();
  });

  it('fulfills an existing driver-card schedule and pushes nextDueAt by intervalDays', async () => {
    const existingDue = new Date('2026-07-01T00:00:00.000Z');
    const harness = createHarness(
      {
        fileType: 'card',
        generation: 1,
        signature: { valid: true },
        warnings: [],
        skippedBlocks: [],
        driverCardNo: 'CARD-TR-0001',
        activities: [{ startedAt: '2026-07-06T10:00:00.000Z', durationS: 600, state: 'driving' }],
        events: [],
      },
      {
        resolvedDriverId: 'driver-1',
        existingSchedule: {
          id: 'schedule-1',
          tenantId: 'default-tenant',
          subject: TachoDownloadSubject.driver_card,
          driverId: 'driver-1',
          vehicleId: null,
          intervalDays: 28,
          enabled: true,
          nextDueAt: existingDue,
          lastFulfilledAt: null,
          lastFulfilledDddFileId: null,
        },
      },
    );

    await harness.service.processDddFile('default-tenant', 'ddd-1');

    const schedule = harness.getSchedule();
    assert.ok(schedule);
    assert.equal(schedule?.lastFulfilledDddFileId, 'ddd-1');
    assert.ok(schedule?.lastFulfilledAt instanceof Date);
    assert.ok(schedule?.nextDueAt instanceof Date);

    const diffDays = Math.round(
      ((schedule?.nextDueAt.getTime() ?? 0) - (schedule?.lastFulfilledAt?.getTime() ?? 0)) /
        (24 * 3600 * 1000),
    );
    assert.equal(diffDays, 28);

    harness.cleanup();
  });

  it('does not fulfill schedules when DDD signature is invalid', async () => {
    const harness = createHarness(
      {
        fileType: 'vu',
        generation: 1,
        signature: { valid: false },
        warnings: [],
        skippedBlocks: [],
        activities: [{ startedAt: '2026-07-06T10:00:00.000Z', durationS: 600, state: 'driving' }],
        events: [],
      },
      {
        existingSchedule: {
          id: 'schedule-2',
          tenantId: 'default-tenant',
          subject: TachoDownloadSubject.vehicle_unit,
          driverId: null,
          vehicleId: 'veh-1',
          intervalDays: 90,
          enabled: true,
          nextDueAt: new Date('2026-07-15T00:00:00.000Z'),
          lastFulfilledAt: null,
          lastFulfilledDddFileId: null,
        },
      },
    );

    await harness.service.processDddFile('default-tenant', 'ddd-1');

    const schedule = harness.getSchedule();
    assert.ok(schedule);
    assert.equal(schedule?.lastFulfilledAt, null);
    assert.equal(schedule?.lastFulfilledDddFileId, null);

    harness.cleanup();
  });
});
