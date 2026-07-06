import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DddFileProcessingStatus, DddFileSource, PrismaClient } from '@prisma/client';
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

function createHarness(parsed: ParsedDdd | Error) {
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
      findFirst: async () => null,
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
});
