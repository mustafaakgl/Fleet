import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DddFileSource, PrismaClient } from '@prisma/client';
import { Annex1cDddParser } from './ddd/annex1c/annex1c-parser';
import { TestTrustStore } from './ddd/annex1c/signature/test-trust-store';
import {
  buildSignedGen1CardFile,
  corruptSignedBuffer,
  FIXTURE_EXPECTATIONS,
} from './ddd/annex1c/__fixtures__/fixture-builder';
import { TachographService } from './tachograph.service';

const TEST_TENANT_ID = 'default-tenant';

class TestPrismaService extends PrismaClient {
  constructor() {
    super();
  }
}

describe('TachographService Annex 1C signature ingest', () => {
  const prisma = new TestPrismaService();
  const parser = new Annex1cDddParser(new TestTrustStore());
  const service = new TachographService(
    prisma as unknown as import('../prisma/prisma.service').PrismaService,
    undefined,
    parser,
  );

  let vehicleId = '';
  let driverId = '';

  before(async () => {
    const driver = await prisma.driver.upsert({
      where: {
        tenantId_employeeNumber: {
          tenantId: TEST_TENANT_ID,
          employeeNumber: 'TACHO-ANNEX-SIGN-001',
        },
      },
      update: {
        licenseNumber: FIXTURE_EXPECTATIONS.signedCardNo,
      },
      create: {
        tenantId: TEST_TENANT_ID,
        employeeNumber: 'TACHO-ANNEX-SIGN-001',
        firstName: 'Annex',
        lastName: 'Signer',
        licenseNumber: FIXTURE_EXPECTATIONS.signedCardNo,
      },
      select: { id: true },
    });
    driverId = driver.id;

    const vehicle = await prisma.vehicle.upsert({
      where: {
        tenantId_plateNumber: {
          tenantId: TEST_TENANT_ID,
          plateNumber: 'TACHO-ANNEX-SIGN-1',
        },
      },
      update: {},
      create: {
        tenantId: TEST_TENANT_ID,
        plateNumber: 'TACHO-ANNEX-SIGN-1',
        internalCode: 'TACHO-ANNEX-SIGN-1',
        brand: 'Test',
        model: 'Truck',
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
  });

  after(async () => {
    await prisma.tachoInfringement.deleteMany({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });
    await prisma.tachoActivity.deleteMany({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    await prisma.dddFile.deleteMany({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    await prisma.$disconnect();
  });

  it('ingests valid signed Annex 1C card and evaluates rules', async () => {
    const buffer = buildSignedGen1CardFile();
    const beforeCount = await prisma.tachoInfringement.count({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });

    const result = await service.ingestDddFile(buffer, {
      tenantId: TEST_TENANT_ID,
      vehicleId,
      fileName: 'signed-card.ddd',
      source: DddFileSource.manual,
    });

    assert.equal(result.deduplicated, false);
    assert.equal(result.file.signatureValid, true);
    assert.equal(result.file.generation, 1);

    const activityCount = await prisma.tachoActivity.count({
      where: { tenantId: TEST_TENANT_ID, vehicleId },
    });
    assert.ok(activityCount > 0);

    const afterCount = await prisma.tachoInfringement.count({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });
    assert.ok(afterCount >= beforeCount);
  });

  it('archives corrupted signed copy without new infringements', async () => {
    const beforeCount = await prisma.tachoInfringement.count({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });

    const corrupted = corruptSignedBuffer(buildSignedGen1CardFile());
    const result = await service.ingestDddFile(corrupted, {
      tenantId: TEST_TENANT_ID,
      vehicleId,
      fileName: 'signed-card-corrupt.ddd',
      source: DddFileSource.manual,
    });

    assert.equal(result.file.signatureValid, false);

    const afterCount = await prisma.tachoInfringement.count({
      where: { tenantId: TEST_TENANT_ID, driverId },
    });
    assert.equal(afterCount, beforeCount);
  });
});
