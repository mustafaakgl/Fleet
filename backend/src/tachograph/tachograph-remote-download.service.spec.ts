import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DddFileSource, PrismaClient, TachoDownloadSubject } from '@prisma/client';
import { TachographQueueBootstrapService } from './tachograph-queue-bootstrap.service';
import { TachographQueueService } from './tachograph-queue.service';
import { TachographRemoteDownloadService } from './tachograph-remote-download.service';
import { TachographService } from './tachograph.service';
import { MockRemoteAdapter } from './remote-download/mock-remote-download.adapter';
import { NotificationsService } from '../notifications/notifications.service';

class TestPrismaService extends PrismaClient {
  constructor() {
    super();
  }
}

class StubMetrics {
  tachographAckLatencyMs = { observe() {} };
  tachographQueueDepth = { set() {} };
}

describe('TachographRemoteDownloadService', () => {
  const previousRedisUrl = process.env.REDIS_URL;
  const prisma = new TestPrismaService();
  const queue = new TachographQueueService(new StubMetrics() as never);
  const tachograph = new TachographService(prisma as unknown as import('../prisma/prisma.service').PrismaService);
  const bootstrap = new TachographQueueBootstrapService(
    queue,
    tachograph,
    prisma as unknown as import('../prisma/prisma.service').PrismaService,
  );
  const adapter = new MockRemoteAdapter();
  const notifications = {
    notifyAdminsAndOffice: async () => undefined,
  } as unknown as NotificationsService;
  const service = new TachographRemoteDownloadService(
    prisma as unknown as import('../prisma/prisma.service').PrismaService,
    adapter,
    tachograph,
    queue,
    notifications,
  );

  let vehicleId = '';
  let tenantId = '';

  before(async () => {
    delete process.env.REDIS_URL;
    queue.onModuleInit();
    bootstrap.onModuleInit();

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Remote DDD Test Tenant',
        slug: `remote-ddd-test-${Date.now()}`,
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const vehicle = await prisma.vehicle.upsert({
      where: {
        tenantId_plateNumber: {
          tenantId,
          plateNumber: 'REMOTE-DDD-1',
        },
      },
      update: {},
      create: {
        tenantId,
        plateNumber: 'REMOTE-DDD-1',
        internalCode: 'REMOTE-DDD-1',
        brand: 'Test',
        model: 'Truck',
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;

    await prisma.tachoDownloadSchedule.create({
      data: {
        tenantId,
        subject: TachoDownloadSubject.vehicle_unit,
        vehicleId,
        intervalDays: 14,
        nextDueAt: new Date('2026-07-05T12:00:00Z'),
        enabled: true,
      },
    });
  });

  after(async () => {
    await prisma.tachoInfringement.deleteMany({ where: { tenantId } });
    await prisma.tachoActivity.deleteMany({ where: { tenantId } });
    await prisma.dddFile.deleteMany({ where: { tenantId, vehicleId } });
    await prisma.tachoDownloadSchedule.deleteMany({ where: { tenantId, vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
  });

  it('downloads due schedules, enqueues DDD processing, and deduplicates a second run', async () => {
    const now = new Date('2026-07-06T12:00:00Z');
    const listCallsBeforeFirstRun = adapter.listCalls;
    const downloadCallsBeforeFirstRun = adapter.downloadCalls;

    await service.processDueSchedules(now);

    const firstRunFiles = await prisma.dddFile.findMany({ where: { tenantId, vehicleId } });
    assert.equal(firstRunFiles.length, 1);
    assert.equal(firstRunFiles[0]?.source, DddFileSource.remote);
    assert.equal(firstRunFiles[0]?.status, 'processed');
    assert.ok(adapter.listCalls > listCallsBeforeFirstRun);
    assert.ok(adapter.downloadCalls > downloadCallsBeforeFirstRun);

    await prisma.tachoDownloadSchedule.updateMany({
      where: { tenantId, vehicleId },
      data: { nextDueAt: new Date('2026-07-05T12:00:00Z') },
    });

    await service.processDueSchedules(now);

    const secondRunFiles = await prisma.dddFile.findMany({ where: { tenantId, vehicleId } });
    assert.equal(secondRunFiles.length, 1);
    assert.ok(adapter.listCalls > listCallsBeforeFirstRun);
    assert.ok(adapter.downloadCalls > downloadCallsBeforeFirstRun);
  });
});
