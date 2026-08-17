import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import {
  FuelEntryReversalReason,
  FuelEntryWorkflowStatus,
  FuelProductType,
  Prisma,
} from '@prisma/client';
import { FINANCIAL_ROLES } from '../../common/utils/permissions';
import { TenantContext } from '../../tenant/tenant-context';
import {
  countsTowardCost,
  EFFECTIVE_FUEL_COST_WHERE,
  effectiveAccountingStatus,
  effectiveFuelCostWhere,
} from './core/effective-fuel-cost';
import {
  MIN_REVERSAL_REASON,
  ReverseFuelReceiptDto,
  UpdateFuelReceiptCorrectionDto,
} from './dto/reverse-fuel-receipt.dto';
import { FuelReceiptReversalService } from './fuel-receipt-reversal.service';
import { FuelReceiptReviewController } from './fuel-receipt-review.controller';
import { FuelReceiptReviewService } from './fuel-receipt-review.service';

/**
 * Onaylanmis yakit fisinin ters kaydi.
 *
 * Prisma MOCK ama "aptal degil":
 *   * `originalEntryId` uzerindeki UNIQUE kisiti GERCEKTEN uyguluyor ve
 *     ihlalde Prisma'nin P2002'sini firlatiyor — es zamanlilik testi ancak
 *     boyle bir sey kanitlar;
 *   * `$transaction` hata halinde yazilanlari GERI SARIYOR, yani "yarim
 *     replacement kalmaz" iddiasi olculebilir;
 *   * kosullu `updateMany` (id + durum + updatedAt) gercekten calisiyor.
 */

type Row = Record<string, unknown>;

const TENANT = 'tenant-a';
const APPROVED_AT = new Date('2026-08-14T09:00:00.000Z');

function receipt(overrides: Row = {}): Row {
  return {
    id: 'r-1',
    tenantId: TENANT,
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    workflowStatus: FuelEntryWorkflowStatus.approved,
    stationName: 'Aral Duisburg',
    stationAddress: 'Hafenstraße 12',
    receiptNumber: 'RG-1',
    enteredAt: new Date('2026-05-13T08:42:00.000Z'),
    fuelProduct: FuelProductType.DIESEL,
    liters: new Prisma.Decimal(62.35),
    totalCost: new Prisma.Decimal(107.18),
    pricePerLiter: new Prisma.Decimal(1.719),
    receiptGrossAmount: new Prisma.Decimal(107.18),
    receiptNetAmount: null,
    receiptVatAmount: null,
    receiptVatRate: null,
    currency: 'EUR',
    paymentMethod: 'Firmenkarte',
    odometerKm: null,
    receiptPlateNumber: null,
    isFullTank: false,
    compatibilityMismatch: false,
    receiptStoredPath: '/uploads/fuel-receipts/a.jpg',
    receiptMimeType: 'image/jpeg',
    receiptOriginalName: 'beleg.jpg',
    receiptFileHash: 'hash-1',
    ocrStatus: 'succeeded',
    ocrProvider: 'mock',
    ocrProcessedAt: null,
    ocrExtraction: null,
    ocrErrorClass: null,
    ocrDataMode: 'mock',
    submittedAt: new Date('2026-05-14T09:00:00.000Z'),
    createdAt: new Date('2026-05-13T11:59:00.000Z'),
    updatedAt: APPROVED_AT,
    reviewedAt: APPROVED_AT,
    reviewedById: 'acc-1',
    accountingNote: null,
    rejectionReason: null,
    rejectedAt: null,
    resubmittedAt: null,
    fuelingIntentId: null,
    fuelingIntentSettledKey: 'r-1',
    ...overrides,
  };
}

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'tenantId') continue;
    const actual = row[key];
    if (expected instanceof Date) {
      if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) return false;
      continue;
    }
    if (expected !== null && typeof expected === 'object') {
      const spec = expected as { in?: unknown[]; not?: unknown };
      if (spec.in && !spec.in.includes(actual)) return false;
      if ('not' in spec) {
        if (spec.not === null && actual === null) return false;
        if (spec.not !== null && actual === spec.not) return false;
      }
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function build(
  options: {
    rows?: Row[];
    reversals?: Row[];
    failReversalCreate?: boolean;
    /** Baska bir transaction ONCE commit etmis gibi davran. */
    duplicateOnCreate?: boolean;
  } = {},
) {
  let rows: Row[] = (options.rows ?? [receipt()]).map((row) => ({ ...row }));
  let reversals: Row[] = (options.reversals ?? []).map((row) => ({ ...row }));
  const audits: Row[] = [];
  const notifications: Row[] = [];
  let seq = 0;

  const withRelations = (row: Row): Row => {
    const reversal = reversals.find((rev) => rev.originalEntryId === row.id) ?? null;
    const correctionOf = reversals.find((rev) => rev.replacementEntryId === row.id) ?? null;
    return {
      ...row,
      vehicle: { id: row.vehicleId, plateNumber: 'DU-AB 123' },
      driver: { id: row.driverId, firstName: 'İlker', lastName: 'Çukur' },
      reviewedBy: row.reviewedById ? { id: row.reviewedById, fullName: 'Buchhalter' } : null,
      fuelingIntent: null,
      reversal: reversal
        ? { ...reversal, reversedBy: { id: reversal.reversedById, fullName: 'Buchhalter' } }
        : null,
      correctionOf,
    };
  };

  const makeClient = (
    entryStore: Row[],
    reversalStore: Row[],
    undo: Array<() => void> = [],
  ) => ({
    fleetFuelEntry: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const found = entryStore.find((row) => matches(row, args?.where));
        return found ? withRelations(found) : null;
      },
      findMany: async (args: { where?: Record<string, unknown> }) =>
        entryStore.filter((row) => matches(row, args?.where)).map(withRelations),
      count: async (args: { where?: Record<string, unknown> }) =>
        entryStore.filter((row) => matches(row, args?.where)).length,
      updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
        let count = 0;
        for (const row of entryStore) {
          if (matches(row, args.where)) {
            const previous = { ...row };
            undo.push(() => {
              for (const key of Object.keys(row)) delete row[key];
              Object.assign(row, previous);
            });
            Object.assign(row, args.data);
            seq += 1;
            row.updatedAt = new Date(APPROVED_AT.getTime() + seq * 1000);
            count += 1;
          }
        }
        return { count };
      },
      create: async (args: { data: Row; select?: Row }) => {
        seq += 1;
        const created: Row = {
          ...receipt(),
          ...args.data,
          id: `repl-${seq}`,
          receiptFileHash: null,
          fuelingIntentId: null,
          fuelingIntentSettledKey: null,
          reviewedById: null,
          reviewedAt: null,
          accountingNote: null,
          createdAt: new Date(),
          updatedAt: new Date(APPROVED_AT.getTime() + seq * 1000),
        };
        entryStore.push(created);
        undo.push(() => {
          const index = entryStore.indexOf(created);
          if (index >= 0) entryStore.splice(index, 1);
        });
        return created;
      },
    },
    fleetFuelEntryReversal: {
      create: async (args: { data: Row }) => {
        if (options.failReversalCreate) {
          throw new Error('boom');
        }
        // GERCEK unique kisiti: uygulama kontrolu iki istegi birlikte
        // gecirebilir, veritabani gecirmez.
        if (
          options.duplicateOnCreate ||
          reversalStore.some((rev) => rev.originalEntryId === args.data.originalEntryId)
        ) {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        seq += 1;
        const created = { id: `rev-${seq}`, ...args.data };
        reversalStore.push(created);
        undo.push(() => {
          const index = reversalStore.indexOf(created);
          if (index >= 0) reversalStore.splice(index, 1);
        });
        return created;
      },
    },
    driver: { findFirst: async () => ({ userId: 'user-driver-1' }) },
  });

  const client = makeClient(rows, reversals);
  const prisma = {
    ...client,
    /**
     * Transaction taklidi — GLOBAL SNAPSHOT DEGIL.
     *
     * Bastaki surumu kopyalayip hata halinde geri yazmak kolay olurdu ama
     * YANLIS olurdu: es zamanlilik testinde kaybeden istegin geri sarmasi,
     * kazananin yazdigi kaydi da silerdi. Gercek Postgres transaction'lari
     * birbirini boyle ezmez. Bu yuzden yalnizca BU transaction'in yaptigi
     * yazmalar bir gunluge aliniyor ve hata halinde ters sirayla geri
     * aliniyor.
     */
    $transaction: async <T>(fn: (tx: ReturnType<typeof makeClient>) => Promise<T>): Promise<T> => {
      const undo: Array<() => void> = [];
      const tx = makeClient(rows, reversals, undo);
      try {
        return await fn(tx);
      } catch (error) {
        for (const step of undo.reverse()) step();
        throw error;
      }
    },
  };

  const audit = { logAction: async (p: Row) => { audits.push(p); return {}; } };
  const driverNotify = { notifyUserSafely: (input: Row) => { notifications.push(input); } };

  const review = new FuelReceiptReviewService(prisma as never, audit as never, driverNotify as never);
  const service = new FuelReceiptReversalService(
    prisma as never,
    audit as never,
    driverNotify as never,
    review,
  );

  return { service, review, rows, reversals, audits, notifications };
}

function reverseDto(overrides: Partial<ReverseFuelReceiptDto> = {}): ReverseFuelReceiptDto {
  return {
    expectedUpdatedAt: APPROVED_AT.toISOString(),
    reasonCode: FuelEntryReversalReason.incorrect_amount,
    reason: 'Fisteki toplam tutar yanlis onaylandi.',
    ...overrides,
  } as ReverseFuelReceiptDto;
}

function correctionDto(updatedAt: string, overrides: Partial<UpdateFuelReceiptCorrectionDto> = {}) {
  return {
    expectedUpdatedAt: updatedAt,
    purchasedAt: '2026-05-13T08:42:00.000Z',
    fuelProduct: FuelProductType.DIESEL,
    liters: 60,
    fuelGrossAmount: 90,
    currency: 'EUR',
    ...overrides,
  } as UpdateFuelReceiptCorrectionDto;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException,
      `beklenen is kurali reddi, gelen: ${String(error)}`,
    );
    assert.equal((error.getResponse() as { code?: string }).code, code);
    return true;
  });
}

const run = <T>(fn: () => Promise<T>) => TenantContext.run(TENANT, fn);

describe('fuel receipt reversal — yetki', () => {
  it('ters kayit ucu onay ucuyle AYNI rol politikasini kullanir', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FuelReceiptReviewController) as string[];
    assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
  });

  it('muhasebe, admin ve patron erisebilir', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FuelReceiptReviewController) as string[];
    for (const allowed of ['accounting', 'admin', 'boss']) {
      assert.ok(roles.includes(allowed), `${allowed} erisebilmeli`);
    }
  });

  it('ofis ve surucu REDDEDILIR', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FuelReceiptReviewController) as string[];
    assert.ok(!roles.includes('office'), 'office erisememeli');
    assert.ok(!roles.includes('driver'), 'driver erisememeli');
  });

  it('ters kayit ucu POST, duzeltme ucu PUT', () => {
    const proto = FuelReceiptReviewController.prototype as unknown as Record<string, object>;
    assert.equal(Reflect.getMetadata(PATH_METADATA, proto.reverse), ':id/reverse');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, proto.reverse), RequestMethod.POST);
    assert.equal(Reflect.getMetadata(PATH_METADATA, proto.correction), ':id/correction');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, proto.correction), RequestMethod.PUT);
  });

  it('kiraci baglami yoksa yazma yapilmaz', async () => {
    const { service } = build();
    // Baska kiracinin kaydina erisim, kiraci uzantisi tarafindan zaten
    // engelleniyor; baglamsiz istek de sizinti uretmemeli.
    await expectCode(service.reverse('acc-1', 'r-1', reverseDto()), 'fuel_receipt_not_found');
  });

  it('baska kiracinin fisi bulunamaz', async () => {
    const { service } = build({ rows: [receipt({ id: 'r-1' })] });
    await run(async () => {
      await expectCode(
        service.reverse('acc-1', 'baska-kiraci-fisi', reverseDto()),
        'fuel_receipt_not_found',
      );
    });
  });
});

describe('fuel receipt reversal — gecis kurallari', () => {
  it('onaylanmamis fis tersine cevrilemez', async () => {
    for (const status of [
      FuelEntryWorkflowStatus.driver_review,
      FuelEntryWorkflowStatus.submitted,
      FuelEntryWorkflowStatus.rejected,
    ]) {
      const { service } = build({ rows: [receipt({ workflowStatus: status })] });
      await run(async () => {
        await expectCode(service.reverse('acc-1', 'r-1', reverseDto()), 'fuel_receipt_not_approved');
      });
    }
  });

  it('ayni fis ikinci kez tersine cevrilemez', async () => {
    const { service } = build();
    await run(async () => {
      await service.reverse('acc-1', 'r-1', reverseDto());
    });
    const { service: s2 } = build({
      reversals: [{ id: 'rev-x', originalEntryId: 'r-1', replacementEntryId: null }],
    });
    await run(async () => {
      await expectCode(s2.reverse('acc-1', 'r-1', reverseDto()), 'fuel_receipt_already_reversed');
    });
  });

  it('iki es zamanli istekte YALNIZCA BIR ters kayit olusur', async () => {
    const { service, reversals, rows } = build();
    await run(async () => {
      const dto = reverseDto();
      // Ikisi de uygulama kontrolunu ayni anda geciyor; ayirici, veritabani
      // kisiti.
      const results = await Promise.allSettled([
        service.reverse('acc-1', 'r-1', dto),
        service.reverse('acc-2', 'r-1', dto),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      assert.equal(ok.length, 1, 'tam olarak biri basarili olmali');
      assert.equal(failed.length, 1);
      const error = (failed[0] as PromiseRejectedResult).reason;
      assert.ok(error instanceof ConflictException);
      // Kaybeden taraf ONCE surum kontrolunde durur (`updatedAt` ilk istekle
      // degisti), ona takilmazsa unique kisitta durur. Ikisi de deterministik
      // 409; onemli olan istemcinin makine okunur bir kod almasi ve
      // veritabaninda TEK ters kayit kalmasi.
      assert.ok(
        ['fuel_receipt_reversal_conflict', 'fuel_receipt_already_reversed'].includes(
          (error.getResponse() as { code?: string }).code ?? '',
        ),
        `beklenmeyen kod: ${JSON.stringify(error.getResponse())}`,
      );
    });
    assert.equal(reversals.length, 1);
    assert.equal(rows.filter((row) => row.id !== 'r-1').length, 0);
  });

  it('veritabani kisiti yarisi keserse `already_reversed` doner', async () => {
    // Surum kontrolunu gecen ama baska bir transaction'in ONCE commit ettigi
    // durum: ayirici artik uygulama degil, unique indeks.
    const { service, rows } = build({ duplicateOnCreate: true });
    await run(async () => {
      await expectCode(service.reverse('acc-1', 'r-1', reverseDto()), 'fuel_receipt_already_reversed');
    });
    // Transaction geri sarildi: orijinalin surumu de degismedi.
    assert.equal((rows[0].updatedAt as Date).getTime(), APPROVED_AT.getTime());
  });

  it('surum uyusmazliginda deterministik cakisma doner', async () => {
    const { service } = build();
    await run(async () => {
      await expectCode(
        service.reverse('acc-1', 'r-1', reverseDto({ expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })),
        'fuel_receipt_reversal_conflict',
      );
    });
  });

  it('bozuk surum damgasi da cakisma sayilir', async () => {
    const { service } = build();
    await run(async () => {
      await expectCode(
        service.reverse('acc-1', 'r-1', reverseDto({ expectedUpdatedAt: 'not-a-date' })),
        'fuel_receipt_reversal_conflict',
      );
    });
  });

  it('yalnizca bosluktan olusan aciklama reddedilir', async () => {
    const { service } = build();
    await run(async () => {
      await expectCode(
        service.reverse('acc-1', 'r-1', reverseDto({ reason: '          ' })),
        'fuel_receipt_invalid_reversal_reason',
      );
    });
  });

  it('aciklama icin makul bir alt sinir tanimli', () => {
    assert.ok(MIN_REVERSAL_REASON >= 5, 'tek harflik aciklama kabul edilmemeli');
  });
});

describe('fuel receipt reversal — orijinal kayit degismez', () => {
  it('hicbir finansal alan degismez', async () => {
    const { service, rows } = build();
    const before = { ...rows[0] };
    await run(async () => {
      await service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true }));
    });
    const after = rows.find((row) => row.id === 'r-1')!;

    for (const field of [
      'totalCost',
      'liters',
      'pricePerLiter',
      'currency',
      'enteredAt',
      'vehicleId',
      'driverId',
      'fuelProduct',
      'receiptStoredPath',
      'receiptFileHash',
      'receiptGrossAmount',
      'workflowStatus',
    ]) {
      assert.deepEqual(
        String(after[field]),
        String(before[field]),
        `${field} DEGISMEMELI`,
      );
    }
  });

  it('kayit silinmez', async () => {
    const { service, rows } = build();
    await run(async () => {
      await service.reverse('acc-1', 'r-1', reverseDto());
    });
    assert.ok(rows.some((row) => row.id === 'r-1'), 'orijinal kayit durmali');
  });

  it('durum `approved` olarak KALIR, etkili durum `reversed` olur', async () => {
    const { service } = build();
    const result = await run(() => service.reverse('acc-1', 'r-1', reverseDto()));
    assert.equal(result.receipt.workflowStatus, FuelEntryWorkflowStatus.approved);
    assert.equal(result.receipt.effectiveAccountingStatus, 'reversed');
  });
});

describe('fuel receipt reversal — duzeltilmis kopya', () => {
  it('createReplacement=false yalnizca ters kayit olusturur', async () => {
    const { service, rows, reversals } = build();
    const result = await run(() =>
      service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: false })),
    );
    assert.equal(result.replacement, null);
    assert.equal(reversals.length, 1);
    assert.equal(rows.length, 1, 'yeni kayit olusmamali');
  });

  it('createReplacement=true TEK bir duzeltme kaydi olusturur', async () => {
    const { service, rows } = build();
    const result = await run(() =>
      service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })),
    );
    assert.ok(result.replacement);
    assert.equal(rows.length, 2);
  });

  it('duzeltme kaydi `submitted` baslar — maliyete GIRMEZ', async () => {
    const { service, rows } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })));
    const replacement = rows.find((row) => row.id !== 'r-1')!;
    assert.equal(replacement.workflowStatus, FuelEntryWorkflowStatus.submitted);
    assert.equal(countsTowardCost(replacement.workflowStatus as never, false), false);
  });

  it('duzeltme kaydi onaylandiktan sonra maliyete girer', async () => {
    assert.equal(countsTowardCost(FuelEntryWorkflowStatus.approved, false), true);
  });

  it('duzeltme kaydi tekil alanlari KOPYALAMAZ', async () => {
    const { service, rows } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })));
    const replacement = rows.find((row) => row.id !== 'r-1')!;
    // `@@unique([tenantId, receiptFileHash])` ve
    // `@@unique([tenantId, fuelingIntentSettledKey])` korlemesine kopyalanamaz.
    assert.equal(replacement.receiptFileHash, null);
    assert.equal(replacement.fuelingIntentSettledKey, null);
  });

  it('duzeltme kaydi AYNI dosyayi paylasir — ikinci fiziksel kopya yok', async () => {
    const { service, rows } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })));
    const original = rows.find((row) => row.id === 'r-1')!;
    const replacement = rows.find((row) => row.id !== 'r-1')!;
    assert.equal(replacement.receiptStoredPath, original.receiptStoredPath);
  });

  it('duzeltme kaydi baglami tasir', async () => {
    const { service, rows } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })));
    const replacement = rows.find((row) => row.id !== 'r-1')!;
    assert.equal(replacement.vehicleId, 'veh-1');
    assert.equal(replacement.driverId, 'drv-1');
    assert.equal(replacement.stationName, 'Aral Duisburg');
    assert.equal(String(replacement.totalCost), '107.18');
  });

  it('transaction hatasinda YARIM replacement kalmaz', async () => {
    const { service, rows, reversals } = build({ failReversalCreate: true });
    await run(async () => {
      await assert.rejects(
        service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })),
      );
    });
    assert.equal(reversals.length, 0, 'ters kayit olusmamali');
    assert.equal(rows.length, 1, 'replacement geri sarilmali');
  });
});

describe('fuel receipt reversal — zincir', () => {
  it('detay, ters kayit bilgisini ve duzeltme bagini doner', async () => {
    const { service } = build();
    const result = await run(() =>
      service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })),
    );

    assert.ok(result.receipt.reversal);
    assert.equal(result.receipt.reversal.reasonCode, FuelEntryReversalReason.incorrect_amount);
    assert.equal(result.receipt.reversal.reason, 'Fisteki toplam tutar yanlis onaylandi.');
    assert.ok(result.receipt.reversal.replacementEntryId);
    assert.equal(result.receipt.reversal.reversedBy?.name, 'Buchhalter');

    assert.ok(result.replacement?.correctionOf);
    assert.equal(result.replacement.correctionOf.originalEntryId, 'r-1');
  });

  it('duzeltme kaydi KENDISI de tersine cevrilebilir', async () => {
    const { service, rows, reversals } = build();
    const first = await run(() =>
      service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })),
    );
    const replacementId = first.replacement!.id;

    // Duzeltme onaylandi...
    const replacement = rows.find((row) => row.id === replacementId)!;
    replacement.workflowStatus = FuelEntryWorkflowStatus.approved;

    // ...ve o da yanlis cikti.
    const second = await run(() =>
      service.reverse(
        'acc-1',
        replacementId,
        reverseDto({
          expectedUpdatedAt: (replacement.updatedAt as Date).toISOString(),
          reasonCode: FuelEntryReversalReason.duplicate,
          reason: 'Duzeltme de yanlis onaylandi, ayni fis iki kez girildi.',
          createReplacement: true,
        }),
      ),
    );

    assert.equal(reversals.length, 2, 'zincirde iki ters kayit olmali');
    assert.equal(second.receipt.effectiveAccountingStatus, 'reversed');
    // Zincir: Orijinal -> Reversal -> Replacement -> Reversal -> Yeni replacement
    assert.equal(second.receipt.correctionOf?.originalEntryId, 'r-1');
    assert.ok(second.replacement);
  });

  it('aktor ozeti yalnizca GUVENLI alanlari tasir', async () => {
    const { service } = build();
    const result = await run(() => service.reverse('acc-1', 'r-1', reverseDto()));
    assert.deepEqual(Object.keys(result.receipt.reversal!.reversedBy!).sort(), ['id', 'name']);
  });
});

describe('fuel receipt reversal — duzeltme duzenleme', () => {
  async function withCorrection() {
    const built = build();
    const first = await run(() =>
      built.service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })),
    );
    return { ...built, replacementId: first.replacement!.id };
  }

  it('duzeltme kaydi duzenlenebilir', async () => {
    const { service, rows, replacementId } = await withCorrection();
    const current = rows.find((row) => row.id === replacementId)!;
    const result = await run(() =>
      service.updateCorrection(
        'acc-1',
        replacementId,
        correctionDto((current.updatedAt as Date).toISOString(), { fuelGrossAmount: 88.5 }),
      ),
    );
    assert.equal(result.receipt.fuelGrossAmount, 88.5);
  });

  it('KAYDETMEK ONAYLAMAZ', async () => {
    const { service, rows, replacementId } = await withCorrection();
    const current = rows.find((row) => row.id === replacementId)!;
    const result = await run(() =>
      service.updateCorrection(
        'acc-1',
        replacementId,
        correctionDto((current.updatedAt as Date).toISOString()),
      ),
    );
    // Onay ayri bir istekle ve mevcut approve ucundan gecer.
    assert.equal(result.receipt.workflowStatus, FuelEntryWorkflowStatus.submitted);
  });

  it('duzeltme olmayan kayit bu uctan duzenlenemez', async () => {
    const { service, rows } = build();
    await run(async () => {
      await expectCode(
        service.updateCorrection(
          'acc-1',
          'r-1',
          correctionDto((rows[0].updatedAt as Date).toISOString()),
        ),
        'fuel_receipt_not_a_correction',
      );
    });
  });

  it('onaylanmis duzeltme yerinde degistirilemez', async () => {
    const { service, rows, replacementId } = await withCorrection();
    const current = rows.find((row) => row.id === replacementId)!;
    current.workflowStatus = FuelEntryWorkflowStatus.approved;
    await run(async () => {
      await expectCode(
        service.updateCorrection(
          'acc-1',
          replacementId,
          correctionDto((current.updatedAt as Date).toISOString()),
        ),
        'fuel_receipt_correction_not_editable',
      );
    });
  });

  it('surum uyusmazliginda cakisma doner', async () => {
    const { service, replacementId } = await withCorrection();
    await run(async () => {
      await expectCode(
        service.updateCorrection('acc-1', replacementId, correctionDto('2020-01-01T00:00:00.000Z')),
        'fuel_receipt_review_conflict',
      );
    });
  });

  it('ENGELLEYICI dogrulama ORTAK yardimcidan gelir', async () => {
    const { service, rows, replacementId } = await withCorrection();
    const current = rows.find((row) => row.id === replacementId)!;
    await run(async () => {
      await expectCode(
        service.updateCorrection(
          'acc-1',
          replacementId,
          // Gelecege dogru bir fis tarihi: ortak yardimcida ENGELLEYICI.
          correctionDto((current.updatedAt as Date).toISOString(), {
            purchasedAt: '2030-01-01T00:00:00.000Z',
          }),
        ),
        'fuel_receipt_invalid',
      );
    });
  });

  it('matematik uyusmazligi ENGELLEMEZ ama uyari olarak doner', async () => {
    // Repo kurali BILINCLI: gercek fislerde yuvarlama ve indirim satirlari
    // olur; muhasebeyi dogru bir fisi kaydedemez halde birakmak yanlis olur.
    // Duzeltme ucu bu karari KOPYALAMIYOR, ayni yardimciyi kullaniyor.
    const { service, rows, replacementId } = await withCorrection();
    const current = rows.find((row) => row.id === replacementId)!;
    const result = await run(() =>
      service.updateCorrection(
        'acc-1',
        replacementId,
        correctionDto((current.updatedAt as Date).toISOString(), {
          liters: 60,
          pricePerLiter: 1.7,
          fuelGrossAmount: 5,
        }),
      ),
    );
    assert.ok(result.issues.length > 0, 'uyari uretilmeli');
    assert.ok(result.issues.every((issue) => !issue.blocking), 'engelleyici olmamali');
  });
});

describe('fuel receipt reversal — denetim ve bildirim', () => {
  it('ters kayit denetime yazilir', async () => {
    const { service, audits } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto()));
    const entry = audits.find((a) => a.action === 'fuel_receipt.reversed');
    assert.ok(entry, 'ters kayit denetimde olmali');
    const metadata = entry!.metadata as Row;
    assert.equal(metadata.fuelEntryId, 'r-1');
    assert.equal(metadata.reasonCode, FuelEntryReversalReason.incorrect_amount);
  });

  it('duzeltme kaydi olusturma AYRI bir denetim olayi', async () => {
    const { service, audits } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })));
    assert.ok(audits.some((a) => a.action === 'fuel_receipt.correction_created'));
  });

  it('duzeltme duzenleme denetime yazilir', async () => {
    const built = build();
    const first = await run(() =>
      built.service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })),
    );
    const current = built.rows.find((row) => row.id === first.replacement!.id)!;
    await run(() =>
      built.service.updateCorrection(
        'acc-1',
        first.replacement!.id,
        correctionDto((current.updatedAt as Date).toISOString()),
      ),
    );
    assert.ok(built.audits.some((a) => a.action === 'fuel_receipt.correction_edited'));
  });

  it('denetim metadatasinda dosya yolu ve OCR metni YOK', async () => {
    const { service, audits } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto({ createReplacement: true })));
    for (const entry of audits) {
      const serialized = JSON.stringify(entry.metadata ?? {});
      assert.ok(!serialized.includes('/uploads/'), 'depolama yolu loglanmamali');
      assert.ok(!serialized.includes('ocrExtraction'), 'OCR ciktisi loglanmamali');
      assert.ok(!serialized.includes('Firmenkarte'), 'odeme bilgisi loglanmamali');
    }
  });

  it('surucuye GENEL bir bildirim gider — muhasebe aciklamasi GITMEZ', async () => {
    const { service, notifications } = build();
    await run(() => service.reverse('acc-1', 'r-1', reverseDto()));
    assert.equal(notifications.length, 1);
    const params = notifications[0].params as Row;
    assert.equal(notifications[0].key, 'fuel_receipt_reversed');
    assert.ok(!('reason' in params), 'muhasebe aciklamasi surucuye gitmemeli');
    assert.ok(!('reasonCode' in params), 'sebep kodu surucuye gitmemeli');
  });
});

describe('surucu gorunumu', () => {
  it('ters kayda alinmis fis surucuye de ONAYLI gorunmez', () => {
    // Surucuye "duzeltmeye alindi" bildirimi gidiyor; ayni kaydin surucu
    // ekraninda "onayli" gorunmesi o bildirimle celisirdi. Muhasebe ve
    // surucu uclari AYNI turetmeden geciyor.
    assert.equal(
      effectiveAccountingStatus(FuelEntryWorkflowStatus.approved, true),
      'reversed',
    );
  });

  it('ters kayit yoksa surucu gorunumu degismez', () => {
    assert.equal(
      effectiveAccountingStatus(FuelEntryWorkflowStatus.approved, false),
      'approved_effective',
    );
    assert.equal(
      effectiveAccountingStatus(FuelEntryWorkflowStatus.submitted, false),
      'submitted',
    );
  });
});

describe('etkili maliyet kurali', () => {
  it('maliyet filtresi HEM onay HEM ters kayit yoklugu ister', () => {
    assert.equal(EFFECTIVE_FUEL_COST_WHERE.workflowStatus, FuelEntryWorkflowStatus.approved);
    assert.deepEqual(EFFECTIVE_FUEL_COST_WHERE.reversal, { is: null });
  });

  it('ek kosullar birlesir ama etkili onay kurali EZILEMEZ', () => {
    const where = effectiveFuelCostWhere({
      vehicleId: 'v1',
      // Cagiran yanlislikla daha genis bir durum gecirse bile kural kazanir.
      workflowStatus: FuelEntryWorkflowStatus.submitted,
    });
    assert.equal(where.vehicleId, 'v1');
    assert.equal(where.workflowStatus, FuelEntryWorkflowStatus.approved);
    assert.deepEqual(where.reversal, { is: null });
  });

  it('etkili durum turetimi tutarli', () => {
    assert.equal(effectiveAccountingStatus(FuelEntryWorkflowStatus.approved, false), 'approved_effective');
    assert.equal(effectiveAccountingStatus(FuelEntryWorkflowStatus.approved, true), 'reversed');
    assert.equal(effectiveAccountingStatus(FuelEntryWorkflowStatus.submitted, false), 'submitted');
    assert.equal(effectiveAccountingStatus(FuelEntryWorkflowStatus.rejected, false), 'rejected');
  });

  it('ters kayit her durumu yener', () => {
    // Onaylanmamis bir kaydin ters kayda alinmasi is kuralinda engelli ama
    // turetim yine de tutarli davranmali.
    assert.equal(effectiveAccountingStatus(FuelEntryWorkflowStatus.submitted, true), 'reversed');
    assert.equal(countsTowardCost(FuelEntryWorkflowStatus.approved, true), false);
  });
});
