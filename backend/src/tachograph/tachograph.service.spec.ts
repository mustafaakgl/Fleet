import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DddFileSource, PrismaClient } from '@prisma/client';
import { TachographService } from './tachograph.service';

const FIXTURE_PATH = join(__dirname, 'ddd', '__fixtures__', 'sample-driver-card.ddd');
const TEST_TENANT_ID = 'default-tenant';

class TestPrismaService extends PrismaClient {
  constructor() {
    super();
  }
}

describe('TachographService.ingestDddFile', () => {
  const prisma = new TestPrismaService();
  const service = new TachographService(prisma as unknown as import('../prisma/prisma.service').PrismaService);

  let vehicleId = '';
  let driverId = '';

  async function ingestAndProcess(
    buffer: Buffer,
    meta: Parameters<TachographService['enqueueDddFile']>[1],
  ) {
    const result = await service.enqueueDddFile(buffer, meta);
    if (!result.deduplicated) {
      await service.processDddFile(meta.tenantId, result.file.id);
    }
    const file = await prisma.dddFile.findUniqueOrThrow({
      where: { id: result.file.id },
    });
    return { deduplicated: result.deduplicated, file };
  }

  before(async () => {
    const driver = await prisma.driver.upsert({
      where: {
        tenantId_employeeNumber: {
          tenantId: TEST_TENANT_ID,
          employeeNumber: 'TACHO-TEST-001',
        },
      },
      update: {
        licenseNumber: 'CARD-TR-0001',
      },
      create: {
        tenantId: TEST_TENANT_ID,
        employeeNumber: 'TACHO-TEST-001',
        firstName: 'Tacho',
        lastName: 'Tester',
        licenseNumber: 'CARD-TR-0001',
      },
      select: { id: true },
    });
    driverId = driver.id;

    const vehicle = await prisma.vehicle.upsert({
      where: {
        tenantId_plateNumber: {
          tenantId: TEST_TENANT_ID,
          plateNumber: 'TACHO-TEST-1',
        },
      },
      update: {},
      create: {
        tenantId: TEST_TENANT_ID,
        plateNumber: 'TACHO-TEST-1',
        internalCode: 'TACHO-TEST-1',
        brand: 'Test',
        model: 'Truck',
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
  });

  after(async () => {
    await prisma.tachoInfringement.deleteMany({
      where: {
        tenantId: TEST_TENANT_ID,
        driverId,
      },
    });
    await prisma.tachoActivity.deleteMany({
      where: {
        tenantId: TEST_TENANT_ID,
        vehicleId,
      },
    });
    await prisma.dddFile.deleteMany({
      where: {
        tenantId: TEST_TENANT_ID,
        vehicleId,
      },
    });
    await prisma.$disconnect();
  });

  it('ingests fixture DDD and deduplicates identical uploads', async () => {
    const buffer = readFileSync(FIXTURE_PATH);

    const first = await ingestAndProcess(buffer, {
      tenantId: TEST_TENANT_ID,
      vehicleId,
      fileName: 'sample-driver-card.ddd',
      source: DddFileSource.manual,
    });

    assert.equal(first.deduplicated, false);
    assert.ok(first.file.id);

    const fileCountAfterFirst = await prisma.dddFile.count({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    const activityCountAfterFirst = await prisma.tachoActivity.count({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    const infringementCountAfterFirst = await prisma.tachoInfringement.count({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });

    assert.equal(fileCountAfterFirst, 1);
    assert.equal(activityCountAfterFirst, 4);
    assert.ok(infringementCountAfterFirst >= 1);

    const second = await ingestAndProcess(buffer, {
      tenantId: TEST_TENANT_ID,
      vehicleId,
      fileName: 'sample-driver-card.ddd',
      source: DddFileSource.manual,
    });

    assert.equal(second.deduplicated, true);
    assert.equal(second.file.id, first.file.id);

    const fileCountAfterSecond = await prisma.dddFile.count({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    const activityCountAfterSecond = await prisma.tachoActivity.count({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    const infringementCountAfterSecond = await prisma.tachoInfringement.count({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });

    assert.equal(fileCountAfterSecond, fileCountAfterFirst);
    assert.equal(activityCountAfterSecond, activityCountAfterFirst);
    assert.equal(infringementCountAfterSecond, infringementCountAfterFirst);
  });
});
