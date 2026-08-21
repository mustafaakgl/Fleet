import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Prisma, ServiceRecordApprovalStatus } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { FINANCIAL_ROLES } from '../common/utils/permissions';
import { ServiceRecordsController } from './service-records.controller';
import { ServiceRecordsService } from './service-records.service';

/**
 * Servis kaydinin muhasebe onayi (Faz 18B).
 *
 * Prisma MOCK ama "aptal degil": `update` gercekten yaziyor ve `findUnique`
 * yazilani geri veriyor, boylece "ret nedeni onayda silinmiyor" gibi
 * iddialar olculebiliyor.
 */

type Row = Record<string, unknown>;

function record(overrides: Row = {}): Row {
  return {
    id: 'sr-1',
    tenantId: 'tenant-a',
    vehicleId: 'veh-1',
    driverId: null,
    startDate: null,
    date: new Date('2026-06-10T00:00:00.000Z'),
    serviceType: 'Bremsen',
    vendor: null,
    repairCompany: 'Werkstatt Nord',
    costAmount: new Prisma.Decimal('250.00'),
    currency: 'EUR',
    mileageKm: null,
    notes: null,
    approvalStatus: ServiceRecordApprovalStatus.pending,
    reviewedById: null,
    reviewedAt: null,
    accountingNote: null,
    rejectionReason: null,
    createdAt: new Date('2026-06-10T00:00:00.000Z'),
    updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    vehicle: { id: 'veh-1', plateNumber: 'DU-AB 123' },
    driver: null,
    reviewedBy: null,
    ...overrides,
  };
}

function build(seed: Row = {}) {
  let stored = record(seed);
  const audits: Array<Record<string, unknown>> = [];

  const prisma = {
    serviceRecord: {
      findUnique: async () => stored,
      update: async (args: { data: Row }) => {
        stored = { ...stored, ...args.data };
        if (args.data.reviewedById) {
          stored.reviewedBy = { id: args.data.reviewedById, fullName: 'Anna Buch' };
        }
        return stored;
      },
    },
  };

  const audit = {
    logAction: async (entry: Record<string, unknown>) => {
      audits.push(entry);
    },
  };

  const service = new ServiceRecordsService(
    prisma as never,
    audit as never,
    { resolveBaseCurrency: async () => 'EUR' } as never,
  );

  return { service, audits, current: () => stored };
}

describe('servis onayi — uc sozlesmesi', () => {
  it('POST service-records/:id/review yalnizca FINANCIAL_ROLES icin acik', () => {
    const handler = Reflect.get(ServiceRecordsController.prototype as object, 'review') as object;
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), ':id/review');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST);

    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
    // OFFICE ONAYLAYAMAZ: tutari gormeyen rol, o tutari toplama sokamaz.
    assert.equal(roles.includes('office'), false);
    assert.equal(roles.includes('driver'), false);
  });
});

describe('servis onayi — karar', () => {
  it('yeni kayit VARSAYILAN OLARAK onay bekliyor', () => {
    const { current } = build();
    assert.equal(current().approvalStatus, ServiceRecordApprovalStatus.pending);
  });

  it('onay durumu, onaylayani ve anini yazar', async () => {
    const { service, current } = build();
    const result = await service.review('sr-1', { decision: 'approve' }, 'user-1');

    assert.equal(current().approvalStatus, ServiceRecordApprovalStatus.approved);
    assert.equal(current().reviewedById, 'user-1');
    assert.ok(current().reviewedAt instanceof Date);
    assert.equal(result.approval_status, ServiceRecordApprovalStatus.approved);
    // Turetilmis sinif SUNUCUDAN geliyor: istemci durum adindan cikarmiyor.
    assert.equal(result.recognition_class, 'approved_actual');
    assert.equal(result.reviewed_by, 'Anna Buch');
  });

  it('RET NEDENI ZORUNLU — kaydi giren neyi duzeltecegini gormeli', async () => {
    const { service, current } = build();
    await assert.rejects(
      () => service.review('sr-1', { decision: 'reject' }, 'user-1'),
      (error: unknown) => error instanceof BadRequestException,
    );
    await assert.rejects(
      () => service.review('sr-1', { decision: 'reject', reason: 'yok' }, 'user-1'),
      (error: unknown) => error instanceof BadRequestException,
    );
    // Reddedilmedi: durum DEGISMEDI.
    assert.equal(current().approvalStatus, ServiceRecordApprovalStatus.pending);
  });

  it('ret nedeni sonraki ONAYDA SILINMEZ', async () => {
    const { service, current } = build();
    await service.review(
      'sr-1',
      { decision: 'reject', reason: 'Belege fehlen komplett' },
      'user-1',
    );
    assert.equal(current().approvalStatus, ServiceRecordApprovalStatus.rejected);
    assert.equal(current().rejectionReason, 'Belege fehlen komplett');

    const approved = await service.review('sr-1', { decision: 'approve' }, 'user-2');
    assert.equal(approved.approval_status, ServiceRecordApprovalStatus.approved);
    // Gecmis okunabilir kaliyor: daha once NEDEN reddedildigi kayboluyorsa
    // denetim izi degil, temizlenmis bir hikaye kalir.
    assert.equal(approved.rejection_reason, 'Belege fehlen komplett');
  });

  it('kayit SILINMIYOR: reddedilen kayit gecmiste duruyor', async () => {
    const { service, current } = build();
    await service.review('sr-1', { decision: 'reject', reason: 'Doppelte Rechnung' }, 'user-1');
    assert.equal(current().id, 'sr-1');
    assert.equal(current().costAmount instanceof Prisma.Decimal, true);
  });

  it('her karar denetim kaydina gecer', async () => {
    const { service, audits } = build();
    await service.review('sr-1', { decision: 'approve' }, 'user-1');
    assert.equal(audits.length, 1);
    assert.equal(audits[0]!.action, 'service_record.approved');
    assert.deepEqual(audits[0]!.metadata, {
      from_status: ServiceRecordApprovalStatus.pending,
      to_status: ServiceRecordApprovalStatus.approved,
    });
  });

  it('olmayan kayit 404', async () => {
    const service = new ServiceRecordsService(
      { serviceRecord: { findUnique: async () => null } } as never,
      { logAction: async () => undefined } as never,
      { resolveBaseCurrency: async () => 'EUR' } as never,
    );
    await assert.rejects(
      () => service.review('yok', { decision: 'approve' }, 'user-1'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

describe('servis onayi — liste filtresi', () => {
  it('gecersiz onay durumu SESSIZCE YOK SAYILMAZ', async () => {
    const service = new ServiceRecordsService(
      { serviceRecord: { findMany: async () => [] } } as never,
      { logAction: async () => undefined } as never,
      { resolveBaseCurrency: async () => 'EUR' } as never,
    );
    // Yanlis yazilmis bir filtre, filtresiz liste dondurup "hepsi onayli"
    // izlenimi verirdi.
    await assert.rejects(
      () => service.list({ approval_status: 'onayli' }),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('gecerli durum sorguya gecer', async () => {
    let seen: Record<string, unknown> | null = null;
    const service = new ServiceRecordsService(
      {
        serviceRecord: {
          findMany: async (args: { where: Record<string, unknown> }) => {
            seen = args.where;
            return [];
          },
        },
      } as never,
      { logAction: async () => undefined } as never,
      { resolveBaseCurrency: async () => 'EUR' } as never,
    );
    await service.list({ approval_status: ServiceRecordApprovalStatus.pending });
    assert.equal(
      (seen as unknown as Record<string, unknown>).approvalStatus,
      ServiceRecordApprovalStatus.pending,
    );
  });
});
