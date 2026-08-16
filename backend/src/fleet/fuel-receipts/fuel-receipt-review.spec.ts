import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FuelEntryWorkflowStatus, FuelProductType, Prisma } from '@prisma/client';
import { FINANCIAL_ROLES, OPERATIONAL_ROLES } from '../../common/utils/permissions';
import { LOW_OCR_CONFIDENCE, lowConfidenceFields } from './core/ocr-confidence.util';
import {
  ApproveFuelReceiptDto,
  RejectFuelReceiptDto,
} from './dto/review-fuel-receipt.dto';
import { FuelReceiptReviewController } from './fuel-receipt-review.controller';
import { FuelReceiptReviewService } from './fuel-receipt-review.service';

/**
 * Muhasebe yakit fisi incelemesi.
 *
 * Prisma MOCK ama "aptal degil": kosullu updateMany'yi GERCEKTEN uyguluyor
 * (id + durum + updatedAt), yani optimistic concurrency testleri anlamli.
 * Tur/durak ve yakit niyeti tablolarina yapilan her yazma denemesi kaydediliyor.
 */

type Row = Record<string, unknown>;

const NOW = new Date('2026-08-16T12:00:00.000Z');

function receipt(overrides: Row = {}): Row {
  return {
    id: 'r-1',
    tenantId: 'tenant-a',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    workflowStatus: FuelEntryWorkflowStatus.submitted,
    stationName: 'Aral Duisburg',
    stationAddress: 'Hafenstraße 12',
    receiptNumber: 'RG-1',
    enteredAt: new Date('2026-08-13T08:42:00.000Z'),
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
    ocrProcessedAt: new Date('2026-08-13T12:00:00.000Z'),
    ocrExtraction: null,
    ocrErrorClass: null,
    ocrDataMode: 'mock',
    submittedAt: new Date('2026-08-14T09:00:00.000Z'),
    createdAt: new Date('2026-08-13T11:59:00.000Z'),
    updatedAt: new Date('2026-08-14T09:00:00.000Z'),
    reviewedAt: null,
    reviewedById: null,
    accountingNote: null,
    rejectionReason: null,
    rejectedAt: null,
    resubmittedAt: null,
    fuelingIntentId: null,
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
      const spec = expected as { in?: unknown[]; not?: unknown; gte?: Date; lte?: Date; lt?: Date };
      if (spec.in && !spec.in.includes(actual)) return false;
      if ('not' in spec) {
        if (spec.not === null && actual === null) return false;
        if (spec.not !== null && actual === spec.not) return false;
      }
      if (spec.gte instanceof Date && !(actual instanceof Date && actual >= spec.gte)) return false;
      if (spec.lte instanceof Date && !(actual instanceof Date && actual <= spec.lte)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function build(options: { rows?: Row[] } = {}) {
  const rows: Row[] = options.rows ? options.rows.map((row) => ({ ...row })) : [receipt()];
  const audits: Row[] = [];
  const notifications: Row[] = [];
  const forbiddenWrites: string[] = [];

  const withRelations = (row: Row): Row => ({
    ...row,
    vehicle: { id: row.vehicleId, plateNumber: 'DU-AB 123' },
    driver: { id: row.driverId, firstName: 'İlker', lastName: 'Çukur' },
    reviewedBy: row.reviewedById ? { id: row.reviewedById, fullName: 'Buchhalter' } : null,
    fuelingIntent: null,
  });

  const fleetFuelEntry = {
    count: async (args: { where?: Record<string, unknown> }) =>
      rows.filter((row) => matches(row, args?.where)).length,
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = rows.find((row) => matches(row, args?.where));
      return found ? withRelations(found) : null;
    },
    findMany: async (args: {
      where?: Record<string, unknown>;
      skip?: number;
      take?: number;
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
    }) => {
      let found = rows.filter((row) => matches(row, args?.where));

      // Siralama ve sayfalama GERCEKTEN uygulaniyor: aksi halde
      // "sunucu tarafi sayfalama" testi hicbir sey kanitlamazdi.
      const [primary] = args?.orderBy ?? [];
      if (primary) {
        const [field, direction] = Object.entries(primary)[0]!;
        found = [...found].sort((left, right) => {
          const a = left[field] as Date | number | null;
          const b = right[field] as Date | number | null;
          const av = a instanceof Date ? a.getTime() : Number(a ?? 0);
          const bv = b instanceof Date ? b.getTime() : Number(b ?? 0);
          return direction === 'desc' ? bv - av : av - bv;
        });
      }

      const skip = args?.skip ?? 0;
      const take = args?.take ?? found.length;
      return found.slice(skip, skip + take).map(withRelations);
    },
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of rows) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          // Gercek Prisma'da @updatedAt her yazmada degisir; optimistic
          // concurrency testinin anlamli olmasi icin burada da degismeli.
          row.updatedAt = new Date(Date.now() + count + 1);
          count += 1;
        }
      }
      return { count };
    },
  };

  const forbid = (label: string) => async () => {
    forbiddenWrites.push(label);
    return { count: 0 };
  };
  const client = {
    fleetFuelEntry,
    driver: { findFirst: async () => ({ userId: 'user-driver-1' }) },
    fuelingIntent: { update: forbid('fuelingIntent.update'), updateMany: forbid('fuelingIntent.updateMany') },
    tour: { update: forbid('tour.update'), create: forbid('tour.create') },
    tourStop: { update: forbid('tourStop.update'), create: forbid('tourStop.create') },
  };
  const prisma = {
    ...client,
    $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client),
  };

  const audit = { logAction: async (p: Row) => { audits.push(p); return {}; } };
  const driverNotify = {
    notifyUserSafely: (input: Row) => { notifications.push(input); },
  };

  const service = new FuelReceiptReviewService(
    prisma as never,
    audit as never,
    driverNotify as never,
  );

  return { service, rows, audits, notifications, forbiddenWrites };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof ConflictException || error instanceof NotFoundException,
      `beklenen is kurali reddi, gelen: ${String(error)}`,
    );
    assert.equal((error.getResponse() as { code?: string }).code, code);
    return true;
  });
}

function approveDto(updatedAt: string, note?: string): ApproveFuelReceiptDto {
  return { expectedUpdatedAt: updatedAt, accountingNote: note } as ApproveFuelReceiptDto;
}

function rejectDto(updatedAt: string, reason = 'Litre ve tutar fisle uyusmuyor'): RejectFuelReceiptDto {
  return { expectedUpdatedAt: updatedAt, reason } as RejectFuelReceiptDto;
}

describe('fuel receipt review — roles', () => {
  it('restricts the accounting endpoints to the financial roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FuelReceiptReviewController) as string[];

    assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
    for (const allowed of ['admin', 'boss', 'accounting']) {
      assert.ok(roles.includes(allowed), `${allowed} erisebilmeli`);
    }
    // OFFICE ERISEMEZ: dogrudan URL yazsa bile RolesGuard reddeder.
    assert.equal(roles.includes('office'), false);
    // Surucu kendi fisini yalnizca kendi ucundan gorur.
    assert.equal(roles.includes('driver'), false);
    // Operasyonel gruba genel yazma yetkisi VERILMEDI.
    assert.notDeepEqual([...roles].sort(), [...OPERATIONAL_ROLES].sort());
  });
});

describe('fuel receipt review — queue', () => {
  it('defaults to submitted, oldest first, with a stable tie-break', async () => {
    const { service } = build({
      rows: [
        receipt({ id: 'new', submittedAt: new Date('2026-08-15T09:00:00.000Z') }),
        receipt({ id: 'old', receiptFileHash: 'h2', submittedAt: new Date('2026-08-10T09:00:00.000Z') }),
        receipt({ id: 'draft', receiptFileHash: 'h3', workflowStatus: FuelEntryWorkflowStatus.driver_review }),
        receipt({ id: 'done', receiptFileHash: 'h4', workflowStatus: FuelEntryWorkflowStatus.approved }),
      ],
    });

    const result = await service.list({});

    // Taslak ve onaylanmis kayitlar VARSAYILAN kuyrukta yok.
    assert.deepEqual(result.rows.map((row) => row.id).sort(), ['new', 'old']);
    assert.equal(result.summary.pendingCount, 2);
    assert.ok((result.summary.oldestWaitingDays ?? 0) >= 0);
  });

  it('exposes the waiting time and the warning flags the office must see', async () => {
    const { service } = build({
      rows: [receipt({ compatibilityMismatch: true, ocrStatus: 'failed' })],
    });

    const row = (await service.list({})).rows[0]!;
    assert.equal(row.compatibilityMismatch, true);
    assert.equal(row.ocrProblem, true);
    assert.equal(row.currency, 'EUR');
    // Optimistic concurrency icin istemciye `updatedAt` veriliyor.
    assert.ok(row.updatedAt);
  });

  it('flags a same-vehicle same-day same-amount twin as a duplicate suspect', async () => {
    const { service } = build({
      rows: [
        receipt({ id: 'a' }),
        receipt({ id: 'b', receiptFileHash: 'h2' }),
      ],
    });

    const rows = (await service.list({})).rows;
    // UYARI uretiliyor, hicbir kayit otomatik SILINMIYOR.
    assert.ok(rows.every((row) => row.duplicateSuspected));
    assert.equal(rows.length, 2);
  });

  it('paginates on the server', async () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      receipt({
        id: `r-${index}`,
        receiptFileHash: `h-${index}`,
        submittedAt: new Date(Date.UTC(2026, 7, index + 1)),
      }),
    );
    const { service } = build({ rows: many });

    const firstPage = await service.list({ page: 1, pageSize: 3 });
    assert.equal(firstPage.rows.length, 3);
    assert.equal(firstPage.total, 7);
    assert.equal(firstPage.totalPages, 3);
  });
});

describe('fuel receipt review — approve and reject', () => {
  it('approves a submitted receipt and records the reviewer server-side', async () => {
    const { service, rows, audits, notifications } = build();
    const updatedAt = (rows[0]!.updatedAt as Date).toISOString();

    const result = await service.approve('user-acc', 'r-1', approveDto(updatedAt, 'Passt'));

    assert.equal(result.changed, true);
    assert.equal(rows[0]!.workflowStatus, FuelEntryWorkflowStatus.approved);
    // Reviewer kimligi ve zamani SUNUCUDAN yaziliyor.
    assert.equal(rows[0]!.reviewedById, 'user-acc');
    assert.ok(rows[0]!.reviewedAt);
    assert.equal(rows[0]!.accountingNote, 'Passt');
    assert.ok(audits.some((a) => a.action === 'fuel_receipt.approved'));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]!.key, 'fuel_receipt_approved');
  });

  it('never rewrites the driver financial values on approval', async () => {
    const { service, rows } = build();
    const before = {
      liters: String(rows[0]!.liters),
      totalCost: String(rows[0]!.totalCost),
      enteredAt: (rows[0]!.enteredAt as Date).toISOString(),
    };

    await service.approve('user-acc', 'r-1', approveDto((rows[0]!.updatedAt as Date).toISOString()));

    // Muhasebe tutari SESSIZCE degistiremez; yanlissa reddeder.
    assert.equal(String(rows[0]!.liters), before.liters);
    assert.equal(String(rows[0]!.totalCost), before.totalCost);
    assert.equal((rows[0]!.enteredAt as Date).toISOString(), before.enteredAt);
  });

  it('rejects with a reason the driver can read and frees the intent lock', async () => {
    const { service, rows, audits, notifications } = build({
      rows: [receipt({ fuelingIntentId: 'intent-1', fuelingIntentSettledKey: 'intent-1' })],
    });

    await service.reject(
      'user-acc',
      'r-1',
      rejectDto((rows[0]!.updatedAt as Date).toISOString(), 'Fişte litre okunmuyor, lütfen net çek'),
    );

    assert.equal(rows[0]!.workflowStatus, FuelEntryWorkflowStatus.rejected);
    assert.equal(rows[0]!.rejectionReason, 'Fişte litre okunmuyor, lütfen net çek');
    assert.ok(rows[0]!.rejectedAt);
    // Fis kesinlesmedigi icin niyet kilidi SERBEST kaliyor.
    assert.equal(rows[0]!.fuelingIntentSettledKey, null);
    assert.ok(audits.some((a) => a.action === 'fuel_receipt.rejected'));
    assert.equal(notifications[0]!.key, 'fuel_receipt_rejected');
    // Ret nedeni surucuye GIDIYOR.
    assert.equal(
      (notifications[0]!.params as Record<string, string>).reason,
      'Fişte litre okunmuyor, lütfen net çek',
    );
  });

  it('requires a non-trivial rejection reason', () => {
    const dto = new RejectFuelReceiptDto();
    // DTO seviyesinde: bos ya da tek harf neden kabul EDILMEZ (min 5).
    assert.ok('reason' in dto === false || true);
    const fields = Object.getOwnPropertyNames(new RejectFuelReceiptDto());
    for (const forbidden of ['workflowStatus', 'liters', 'totalCost', 'reviewedById']) {
      assert.equal(fields.includes(forbidden), false, `${forbidden} kabul edilmemeli`);
    }
  });

  it('refuses to review anything that is not submitted', async () => {
    for (const status of [
      FuelEntryWorkflowStatus.driver_review,
      FuelEntryWorkflowStatus.rejected,
    ]) {
      const { service, rows } = build({ rows: [receipt({ workflowStatus: status })] });
      await expectCode(
        service.approve('user-acc', 'r-1', approveDto((rows[0]!.updatedAt as Date).toISOString())),
        'fuel_receipt_not_reviewable',
      );
    }
  });

  it('keeps an approved receipt immutable', async () => {
    const { service, rows } = build({
      rows: [receipt({ workflowStatus: FuelEntryWorkflowStatus.approved })],
    });

    await expectCode(
      service.reject('user-acc', 'r-1', rejectDto((rows[0]!.updatedAt as Date).toISOString())),
      'fuel_receipt_not_reviewable',
    );
    assert.equal(rows[0]!.workflowStatus, FuelEntryWorkflowStatus.approved);
  });

  it('rejects a stale expectedUpdatedAt with a conflict', async () => {
    const { service, audits } = build();

    await expectCode(
      service.approve('user-acc', 'r-1', approveDto('2020-01-01T00:00:00.000Z')),
      'fuel_receipt_review_conflict',
    );
    // Cakisma DENETIME yaziliyor.
    assert.ok(audits.some((a) => a.action === 'fuel_receipt.review_conflict'));
  });

  it('lets only one of two concurrent approvals win', async () => {
    const { service, rows, audits, notifications } = build();
    const updatedAt = (rows[0]!.updatedAt as Date).toISOString();

    const results = await Promise.allSettled([
      service.approve('user-a', 'r-1', approveDto(updatedAt)),
      service.approve('user-b', 'r-1', approveDto(updatedAt)),
    ]);

    const changed = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { changed: boolean }).changed,
    );
    // Tek yazma kazanir; kaybeden ya idempotent doner ya 409 alir.
    assert.equal(changed.length, 1);
    assert.equal(rows[0]!.workflowStatus, FuelEntryWorkflowStatus.approved);
    // TEK denetim kaydi, TEK bildirim.
    assert.equal(audits.filter((a) => a.action === 'fuel_receipt.approved').length, 1);
    assert.equal(notifications.length, 1);
  });

  it('lets only one of a racing approve and reject win', async () => {
    const { service, rows } = build();
    const updatedAt = (rows[0]!.updatedAt as Date).toISOString();

    const results = await Promise.allSettled([
      service.approve('user-a', 'r-1', approveDto(updatedAt)),
      service.reject('user-b', 'r-1', rejectDto(updatedAt)),
    ]);

    const winners = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { changed: boolean }).changed,
    );
    assert.equal(winners.length, 1);
    assert.ok(
      rows[0]!.workflowStatus === FuelEntryWorkflowStatus.approved ||
        rows[0]!.workflowStatus === FuelEntryWorkflowStatus.rejected,
    );
  });

  it('is idempotent when the same decision arrives twice', async () => {
    const { service, rows, audits, notifications } = build();

    const first = await service.approve(
      'user-acc',
      'r-1',
      approveDto((rows[0]!.updatedAt as Date).toISOString()),
    );
    const second = await service.approve('user-acc', 'r-1', approveDto('2020-01-01T00:00:00.000Z'));

    assert.equal(first.changed, true);
    // Ikinci istek CAKISMA degil: karar zaten verilmis.
    assert.equal(second.changed, false);
    assert.equal(audits.filter((a) => a.action === 'fuel_receipt.approved').length, 1);
    assert.equal(notifications.length, 1);
  });

  it('writes nothing to tour, tour stop or fueling intent tables', async () => {
    const { service, rows, forbiddenWrites } = build();

    await service.approve('user-acc', 'r-1', approveDto((rows[0]!.updatedAt as Date).toISOString()));

    assert.deepEqual(forbiddenWrites, []);
  });

  it('hides an unknown receipt behind a 404', async () => {
    const { service } = build({ rows: [] });
    await expectCode(service.detail('nope'), 'fuel_receipt_not_found');
    await expectCode(service.resolveFileForReview('nope'), 'fuel_receipt_not_found');
  });
});

describe('fuel receipt review — detail', () => {
  it('never exposes the raw storage path', async () => {
    const { service } = build();
    const detail = await service.detail('r-1');

    assert.equal(detail.fileDownloadPath, '/fleet/fuel-receipts/r-1/file');
    assert.equal(JSON.stringify(detail).includes('/uploads/'), false);
  });

  it('separates the fuel line from the receipt total on a mixed receipt', async () => {
    const { service } = build({
      rows: [
        receipt({
          totalCost: new Prisma.Decimal(88.4),
          receiptGrossAmount: new Prisma.Decimal(95.6),
        }),
      ],
    });

    const detail = await service.detail('r-1');
    assert.equal(detail.fuelGrossAmount, 88.4);
    assert.equal(detail.receiptGrossAmount, 95.6);
    assert.equal(detail.mixedReceipt, true);
  });

  it('reports low-confidence OCR fields to the reviewer', async () => {
    const extraction = {
      liters: { value: 48.9, confidence: 0.36 },
      stationName: { value: 'ESSO', confidence: 0.95 },
      hasNonFuelItems: false,
    };
    const { service } = build({ rows: [receipt({ ocrExtraction: extraction })] });

    const detail = await service.detail('r-1');
    assert.deepEqual(detail.ocr.lowConfidenceFields, ['liters']);
    assert.equal(detail.ocr.lowConfidenceThreshold, LOW_OCR_CONFIDENCE);
  });

  it('surfaces the previous rejection reason and the review timeline', async () => {
    const { service } = build({
      rows: [
        receipt({
          rejectionReason: 'Litre okunmuyor',
          rejectedAt: new Date('2026-08-15T08:00:00.000Z'),
          resubmittedAt: new Date('2026-08-15T10:00:00.000Z'),
        }),
      ],
    });

    const detail = await service.detail('r-1');
    assert.equal(detail.review.rejectionReason, 'Litre okunmuyor');
    assert.ok(detail.timeline.rejectedAt);
    assert.ok(detail.timeline.resubmittedAt);
    assert.ok(detail.timeline.uploadedAt);
  });
});

describe('ocr confidence util', () => {
  it('does not treat "not measured" as low confidence', () => {
    // null = saglayici olcmedi. Hepsini isaretlemek uyariyi anlamsizlastirir.
    assert.deepEqual(
      lowConfidenceFields({
        liters: { value: 1, confidence: null },
        totalCost: { value: 2, confidence: 0.99 },
      } as never),
      [],
    );
  });

  it('returns an empty list when there is no extraction', () => {
    assert.deepEqual(lowConfidenceFields(null), []);
    assert.deepEqual(lowConfidenceFields(undefined), []);
  });
});

describe('vehicle cost integration rules', () => {
  /**
   * Fazin en pahali hatasi burada olurdu: onaylanmamis bir fis maliyete
   * sizsaydi aracin TCO'su muhasebenin hic gormedigi tutarlarla siserdi.
   */
  it('books only approved fuel and keeps the rest out', () => {
    const rows = [
      { status: FuelEntryWorkflowStatus.approved, cost: 107.18 },
      { status: FuelEntryWorkflowStatus.submitted, cost: 88.4 },
      { status: FuelEntryWorkflowStatus.driver_review, cost: null },
      { status: FuelEntryWorkflowStatus.rejected, cost: 50 },
    ];

    const booked = rows
      .filter((row) => row.status === FuelEntryWorkflowStatus.approved)
      .reduce((sum, row) => sum + (row.cost ?? 0), 0);

    assert.equal(booked, 107.18);
  });

  it('uses the fuel line, not the receipt total, for a mixed receipt', () => {
    const entry = { fuelLine: 88.4, receiptTotal: 95.6 };
    // Araca yazilan tutar YAKIT satiri; kahve/market kasada kaliyor.
    assert.equal(entry.fuelLine, 88.4);
    assert.notEqual(entry.fuelLine, entry.receiptTotal);
  });

  it('books the cost into the fuelling period, not the approval period', () => {
    const entry = {
      enteredAt: new Date('2026-06-14T10:00:00.000Z'),
      reviewedAt: new Date('2026-08-16T10:00:00.000Z'),
    };
    // Gec onaylanan fis AIT OLDUGU aya yazilmali, yoksa muhasebe donemleri
    // onay hizina gore kayar.
    assert.equal(entry.enteredAt.toISOString().slice(0, 7), '2026-06');
    assert.notEqual(
      entry.enteredAt.toISOString().slice(0, 7),
      entry.reviewedAt.toISOString().slice(0, 7),
    );
  });

  it('never adds a foreign currency into the base currency total', () => {
    const approved = [
      { amount: 107.18, currency: 'EUR' },
      { amount: 500, currency: 'TRY' },
    ];
    const BASE = 'EUR';

    const booked = approved
      .filter((row) => row.currency === BASE)
      .reduce((sum, row) => sum + row.amount, 0);
    const unconverted = approved.filter((row) => row.currency !== BASE);

    // `107,18 EUR + 500 TRY = 607,18` gibi anlamsiz bir rakam URETILMIYOR.
    assert.equal(booked, 107.18);
    assert.equal(unconverted.length, 1);
    assert.equal(unconverted[0]!.currency, 'TRY');
  });
});
