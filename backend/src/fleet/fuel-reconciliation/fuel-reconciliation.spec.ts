import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FINANCIAL_ROLES, OPERATIONAL_ROLES } from '../../common/utils/permissions';
import { TenantContext } from '../../tenant/tenant-context';
import { FuelReconciliationController } from './fuel-reconciliation.controller';
import { FuelReconciliationReviewService } from './fuel-reconciliation-review.service';
import { FuelReconciliationService } from './fuel-reconciliation.service';
import type { ReviewFuelReconciliationDto } from './dto/fuel-reconciliation.dto';

type Row = Record<string, unknown>;

const RECEIPT_AT = new Date('2026-08-14T10:00:00.000Z');

function reconciliationRow(overrides: Row = {}): Row {
  return {
    id: 'rec-1',
    tenantId: 'tenant-a',
    fuelEntryId: 'r-1',
    status: 'pending',
    riskLevel: 'insufficient_data',
    riskScore: 0,
    signals: null,
    dataQuality: null,
    evidence: null,
    algorithmVersion: 1,
    calculatedAt: null,
    recalculatedAt: null,
    failureClass: null,
    attemptCount: 0,
    notifiedAt: null,
    reviewState: 'open',
    reviewOutcome: null,
    reviewedById: null,
    reviewNote: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: new Date('2026-08-14T11:00:00.000Z'),
    updatedAt: new Date('2026-08-14T11:00:00.000Z'),
    ...overrides,
  };
}

function entryRow(overrides: Row = {}): Row {
  return {
    id: 'r-1',
    vehicleId: 'veh-1',
    enteredAt: RECEIPT_AT,
    liters: new Prisma.Decimal(50),
    pricePerLiter: new Prisma.Decimal('1.7500'),
    totalCost: new Prisma.Decimal('87.50'),
    currency: 'EUR',
    fuelProduct: 'DIESEL',
    compatibilityMismatch: false,
    reversal: null,
    vehicle: {
      id: 'veh-1',
      plateNumber: 'DU-AB-123',
      fuelTankCapacityLiters: new Prisma.Decimal(80),
      avgConsumptionLPer100Km: new Prisma.Decimal('7.50'),
    },
    fuelingIntent: null,
    ...overrides,
  };
}

function sample(minutes: number, pct: number): Row {
  return {
    recordedAt: new Date(RECEIPT_AT.getTime() + minutes * 60_000),
    fuelLevelPct: new Prisma.Decimal(pct),
    ignition: false,
    odometerKm: null,
  };
}

/**
 * Prisma MOCK ama kosullu `updateMany`yi gercekten uyguluyor: optimistic
 * concurrency ve bildirim tekillestirme testleri ancak boyle anlamli.
 */
function build(options: { reconciliations?: Row[]; entry?: Row; samples?: Row[] } = {}) {
  const recs: Row[] = (options.reconciliations ?? [reconciliationRow()]).map((row) => ({ ...row }));
  const entry = options.entry ?? entryRow();
  const samples = options.samples ?? [];
  const audits: Row[] = [];
  const notifications: Row[] = [];
  let writeCounter = 0;

  const matchesId = (row: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.notifiedAt === null && row.notifiedAt !== null) return false;
    if (where.updatedAt instanceof Date) {
      const actual = row.updatedAt as Date;
      if (actual.getTime() !== where.updatedAt.getTime()) return false;
    }
    return true;
  };

  const fuelReconciliation = {
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = recs.find(
        (row) =>
          (args.where?.id === undefined || row.id === args.where.id) &&
          (args.where?.fuelEntryId === undefined || row.fuelEntryId === args.where.fuelEntryId),
      );
      return found ? { ...found, fuelEntry: entry } : null;
    },
    findMany: async () => recs.map((row) => ({ ...row, fuelEntry: entry })),
    count: async () => recs.length,
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of recs) {
        if (matchesId(row, args.where)) {
          Object.assign(row, args.data);
          writeCounter += 1;
          row.updatedAt = new Date(Date.now() + writeCounter);
          count += 1;
        }
      }
      return { count };
    },
  };

  const client = {
    fuelReconciliation,
    fleetFuelEntry: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    vehicleFuelLevelSample: {
      findMany: async () => samples,
      deleteMany: async () => ({ count: 3 }),
    },
    driverLocationHistory: { findMany: async () => [] },
    fleetTrip: { aggregate: async () => ({ _sum: { distanceKm: null } }) },
  };

  const prisma = { ...client, unscoped: client };
  const audit = { logAction: async (p: Row) => { audits.push(p); return {}; } };
  const notify = {
    notifyFinancialUsers: async (input: Row) => { notifications.push(input); },
  };

  const service = new FuelReconciliationService(
    prisma as never,
    audit as never,
    notify as never,
  );
  const review = new FuelReconciliationReviewService(prisma as never, audit as never);

  return { service, review, recs, audits, notifications };
}

function reviewDto(updatedAt: string, outcome = 'valid'): ReviewFuelReconciliationDto {
  return { expectedUpdatedAt: updatedAt, outcome, note: 'Beleg geprüft, Tankung bestätigt.' } as ReviewFuelReconciliationDto;
}

const run = <T>(fn: () => Promise<T>) => TenantContext.run('tenant-a', fn);

describe('FuelReconciliationService — hesaplama', () => {
  it('telematik verisi yoksa insufficient_data yazar, "normal" demez', async () => {
    const { service, recs, audits } = build();
    await run(() => service.calculate('rec-1', 'initial'));

    assert.equal(recs[0]!.status, 'calculated');
    assert.equal(recs[0]!.riskLevel, 'insufficient_data');
    assert.ok(audits.some((entry) => entry.action === 'fuel_reconciliation.calculated'));
  });

  it('gozlenen artis fisle uyuyorsa normal yazar', async () => {
    const { service, recs } = build({
      samples: [sample(-20, 20), sample(5, 82.5), sample(30, 82.5)],
    });
    await run(() => service.calculate('rec-1', 'initial'));

    assert.equal(recs[0]!.riskLevel, 'normal');
    assert.equal(recs[0]!.riskScore, 0);
  });

  it('kapasiteyi asan litre yuksek dikkat uretir ve BIR KEZ bildirim gonderir', async () => {
    const { service, recs, notifications } = build({
      entry: entryRow({ liters: new Prisma.Decimal(140) }),
    });

    await run(() => service.calculate('rec-1', 'initial'));
    assert.equal(recs[0]!.riskLevel, 'high_attention');
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]!.key, 'fuel_reconciliation_high_attention');

    // Yeniden hesaplama ayni sonucu verdiginde IKINCI bildirim yok.
    await run(() => service.calculate('rec-1', 'recalculation'));
    assert.equal(notifications.length, 1);
  });

  it('bildirim metni surucu adi tasimaz', async () => {
    const { service, notifications } = build({
      entry: entryRow({ liters: new Prisma.Decimal(140) }),
    });
    await run(() => service.calculate('rec-1', 'initial'));

    const params = notifications[0]!.params as Record<string, string>;
    assert.deepEqual(Object.keys(params).sort(), ['date', 'plateNumber']);
  });

  it('ters kayda alinmis fis icin bildirim GITMEZ', async () => {
    const { service, recs, notifications } = build({
      entry: entryRow({ liters: new Prisma.Decimal(140), reversal: { id: 'rev-1' } }),
    });
    await run(() => service.calculate('rec-1', 'initial'));

    assert.equal(recs[0]!.riskLevel, 'high_attention');
    assert.deepEqual(notifications, []);
  });

  it('yeniden hesaplama risk seviyesini degistirdiginde ayri bir denetim kaydi birakir', async () => {
    const { service, audits } = build({
      reconciliations: [reconciliationRow({ status: 'calculated', riskLevel: 'normal' })],
      entry: entryRow({ liters: new Prisma.Decimal(140) }),
    });
    await run(() => service.calculate('rec-1', 'recalculation'));

    const changed = audits.find(
      (entry) => entry.action === 'fuel_reconciliation.risk_level_changed',
    );
    assert.ok(changed);
    assert.equal((changed!.metadata as Row).newRiskLevel, 'high_attention');
  });

  it('denetim kaydina ham konum ya da fis icerigi kopyalanmaz', async () => {
    const { service, audits } = build({
      samples: [sample(-20, 20), sample(5, 82.5), sample(30, 82.5)],
    });
    await run(() => service.calculate('rec-1', 'initial'));

    const logged = audits.find((entry) => entry.action === 'fuel_reconciliation.calculated')!;
    assert.deepEqual(
      Object.keys(logged.metadata as Row).sort(),
      ['algorithmVersion', 'fuelEntryId', 'riskLevel', 'riskScore', 'signalCodes', 'vehicleId'],
    );
  });

  it('bilinmeyen kayit sessizce gecer, patlamaz', async () => {
    const { service } = build();
    const result = await run(() => service.calculate('rec-yok', 'initial'));
    assert.equal(result.outcome, null);
  });

  it('saklama suresi temizligi kiraci kapsami disinda calisir', async () => {
    const { service } = build();
    assert.equal(await service.purgeExpiredFuelLevelSamples(120), 3);
  });
});

describe('FuelReconciliationReviewService — inceleme', () => {
  it('karari kapatir ve denetime yazar', async () => {
    const { review, recs, audits } = build({
      reconciliations: [reconciliationRow({ status: 'calculated', riskLevel: 'review_required' })],
    });
    const updatedAt = (recs[0]!.updatedAt as Date).toISOString();

    const result = await run(() => review.review('user-acc', 'rec-1', reviewDto(updatedAt)));

    assert.equal(result.changed, true);
    assert.equal(recs[0]!.reviewState, 'closed');
    assert.equal(recs[0]!.reviewOutcome, 'valid');
    assert.ok(
      audits.some((entry) => entry.action === 'fuel_reconciliation.review_completed'),
    );
  });

  it('inceleme notunun METNI denetim kaydina kopyalanmaz', async () => {
    const { review, recs, audits } = build({
      reconciliations: [reconciliationRow({ status: 'calculated' })],
    });
    const updatedAt = (recs[0]!.updatedAt as Date).toISOString();
    await run(() => review.review('user-acc', 'rec-1', reviewDto(updatedAt)));

    const logged = audits.find(
      (entry) => entry.action === 'fuel_reconciliation.review_completed',
    )!;
    assert.equal((logged.metadata as Row).note, undefined);
    assert.equal((logged.metadata as Row).outcome, 'valid');
  });

  it('eskimis updatedAt ile gelen ikinci karar 409 alir', async () => {
    const { review, recs } = build({
      reconciliations: [reconciliationRow({ status: 'calculated' })],
    });
    const stale = (recs[0]!.updatedAt as Date).toISOString();
    await run(() => review.review('user-acc', 'rec-1', reviewDto(stale)));

    await assert.rejects(
      run(() => review.review('user-2', 'rec-1', reviewDto(stale, 'duplicate'))),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(
          (error.getResponse() as { code?: string }).code,
          'fuel_reconciliation_review_conflict',
        );
        return true;
      },
    );
  });

  it('ayni karari tekrar gonderen istek cakisma degil, ikinci denetim kaydi da uretmez', async () => {
    const { review, recs, audits } = build({
      reconciliations: [
        reconciliationRow({ status: 'calculated', reviewState: 'closed', reviewOutcome: 'valid' }),
      ],
    });

    const result = await run(() =>
      review.review('user-acc', 'rec-1', reviewDto(new Date().toISOString())),
    );

    assert.equal(result.changed, false);
    assert.equal(
      audits.filter((entry) => entry.action === 'fuel_reconciliation.review_completed').length,
      0,
    );
  });

  it('bulunmayan kayit 404 doner — varligi sizdirilmaz', async () => {
    const { review } = build();
    await assert.rejects(
      run(() => review.detail('rec-yok')),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal(
          (error.getResponse() as { code?: string }).code,
          'fuel_reconciliation_not_found',
        );
        return true;
      },
    );
  });

  it('fis cekmecesi paneli analiz yoksa null doner', async () => {
    const { review } = build({ reconciliations: [] });
    assert.equal(await run(() => review.panelForFuelEntry('r-1')), null);
  });
});

describe('FuelReconciliationController — rol siniri', () => {
  it('yalnizca finansal rollere acik; office ve driver disarida', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FuelReconciliationController) as string[];

    assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
    assert.ok(!roles.includes('office'));
    assert.ok(!roles.includes('driver'));
    // OPERATIONAL_ROLES ofisi iceriyor: bu uc icin O grup KULLANILMAMALI.
    assert.notDeepEqual([...roles].sort(), [...OPERATIONAL_ROLES].sort());
  });
});
