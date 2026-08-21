import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  FineStatus,
  FuelEntryWorkflowStatus,
  InvoiceKind,
  OutgoingInvoiceStatus,
  Prisma,
  ServiceRecordApprovalStatus,
} from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ActualRevenueService } from '../common/finance/actual-revenue.service';
import { FINANCIAL_ROLES, INVOICING_ROLES } from '../common/utils/permissions';
import { TenantContext } from '../tenant/tenant-context';
import { FinanceController } from './finance.controller';
import { FinanceSummaryService } from './finance-summary.service';

/**
 * Finance merkezi ozeti (Faz 18C).
 *
 * Prisma MOCK ama servisin GONDERDIGI `where`i uyguluyor: "onaysiz servis
 * toplama girmez" iddiasi ancak filtre gercekten gonderilirse bir sey ifade
 * eder. Taklit kendi kuralini uydursaydi, servis filtreyi hic gondermese bile
 * test gecerdi.
 */

const d = (value: number | string) => new Prisma.Decimal(value);

interface Seed {
  baseCurrency?: string;
  fuel?: Array<{
    enteredAt: string;
    totalCost: number | null;
    currency?: string;
    workflowStatus?: FuelEntryWorkflowStatus;
    reversed?: boolean;
    stationName?: string | null;
  }>;
  service?: Array<{
    id?: string;
    date: string;
    costAmount: number;
    currency?: string;
    approvalStatus?: ServiceRecordApprovalStatus;
  }>;
  fines?: Array<{
    id?: string;
    violationAt: string;
    amount: number | null;
    currency?: string;
    status?: FineStatus;
  }>;
  assignments?: Array<{ workDate: string; expectedDailyRevenue: number | null; currency?: string }>;
  invoiceLines?: Array<{
    netCents: number;
    serviceDate: string;
    currency?: string;
    status?: OutgoingInvoiceStatus;
    kind?: InvoiceKind;
  }>;
}

const ACTUAL_STATUSES: OutgoingInvoiceStatus[] = [
  OutgoingInvoiceStatus.finalized,
  OutgoingInvoiceStatus.sent,
  OutgoingInvoiceStatus.partially_paid,
  OutgoingInvoiceStatus.paid,
  OutgoingInvoiceStatus.overdue,
];

function inRange(at: string, where: { gte?: Date; lt?: Date } | undefined): boolean {
  if (!where) return true;
  const value = new Date(at).getTime();
  if (where.gte && value < where.gte.getTime()) return false;
  if (where.lt && value >= where.lt.getTime()) return false;
  return true;
}

/** Servisin gonderdigi `status` filtresini GERCEKTEN uygular. */
function matchesFineStatus(rowStatus: FineStatus | undefined, where: unknown): boolean {
  const status = rowStatus ?? FineStatus.neu;
  if (where && typeof where === 'object' && 'not' in (where as Record<string, unknown>)) {
    return status !== (where as { not: FineStatus }).not;
  }
  return status === where;
}

const vehicle = { id: 'v-1', plateNumber: 'DU-AB 123' };

function build(seed: Seed = {}) {
  const serviceRows = (where: Record<string, unknown>) =>
    (seed.service ?? [])
      .filter(
        (row) =>
          (row.approvalStatus ?? ServiceRecordApprovalStatus.approved) === where.approvalStatus,
      )
      .filter((row) => inRange(row.date, where.date as never));

  const fineRows = (where: Record<string, unknown>) =>
    (seed.fines ?? [])
      .filter((row) => matchesFineStatus(row.status, where.status))
      .filter((row) => inRange(row.violationAt, where.violationAt as never));

  const fuelPending = (where: Record<string, unknown>) =>
    (seed.fuel ?? [])
      .filter((row) =>
        (
          (where.workflowStatus as { in?: FuelEntryWorkflowStatus[] })?.in ?? []
        ).includes(row.workflowStatus ?? FuelEntryWorkflowStatus.approved),
      )
      .filter((row) => inRange(row.enteredAt, where.enteredAt as never));

  const prisma = {
    tenant: { findFirst: async () => ({ baseCurrency: seed.baseCurrency ?? 'EUR', timezone: 'Europe/Berlin' }) },
    fleetFuelEntry: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        // Maliyet sorgusu mu, bekleyen kuyrugu mu — GONDERILEN where'e gore.
        if (args.where.workflowStatus === FuelEntryWorkflowStatus.approved) {
          const wantsEffective =
            (args.where as { reversal?: { is?: null } }).reversal?.is === null;
          return (seed.fuel ?? [])
            .filter(
              (row) =>
                (row.workflowStatus ?? FuelEntryWorkflowStatus.approved) ===
                FuelEntryWorkflowStatus.approved,
            )
            .filter((row) => !(wantsEffective && row.reversed === true))
            .filter((row) => inRange(row.enteredAt, args.where.enteredAt as never))
            .map((row) => ({
              totalCost: row.totalCost === null ? null : d(row.totalCost),
              currency: row.currency ?? 'EUR',
            }));
        }
        return fuelPending(args.where)
          .slice(0, args.take ?? undefined)
          .map((row, index) => ({
          id: `fr-${index + 1}`,
          enteredAt: new Date(row.enteredAt),
          stationName: row.stationName ?? 'Aral',
          totalCost: row.totalCost === null ? null : d(row.totalCost),
          currency: row.currency ?? 'EUR',
          workflowStatus: row.workflowStatus,
          vehicle,
        }));
      },
    },
    serviceRecord: {
      // `take` GERCEKTEN uygulaniyor: aksi halde "liste kirpiliyor ama
      // toplam kirpilmiyor" iddiasi hic sinanmazdi.
      findMany: async (args: { where: Record<string, unknown>; take?: number }) =>
        serviceRows(args.where)
          .slice(0, args.take ?? undefined)
          .map((row, index) => ({
            id: row.id ?? `sr-${index + 1}`,
            date: new Date(row.date),
            serviceType: 'Bremsen',
            repairCompany: 'Werkstatt Nord',
            costAmount: d(row.costAmount),
            currency: row.currency ?? 'EUR',
            vehicle,
          })),
    },
    fine: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) =>
        fineRows(args.where)
          .slice(0, args.take ?? undefined)
          .map((row, index) => ({
            id: row.id ?? `fn-${index + 1}`,
            violationAt: new Date(row.violationAt),
            violationType: 'Geschwindigkeit',
            amount: row.amount === null ? null : d(row.amount),
            currency: row.currency ?? 'EUR',
            vehicle,
          })),
    },
    assignment: {
      findMany: async (args: { where: Record<string, unknown> }) =>
        (seed.assignments ?? [])
          .filter((row) => inRange(row.workDate, args.where.workDate as never))
          .map((row) => ({
            expectedDailyRevenue:
              row.expectedDailyRevenue === null ? null : d(row.expectedDailyRevenue),
            currency: row.currency ?? 'EUR',
            company: null,
          })),
    },
    invoiceLine: {
      findMany: async () =>
        (seed.invoiceLines ?? [])
          .filter((row) => ACTUAL_STATUSES.includes(row.status ?? OutgoingInvoiceStatus.finalized))
          .map((row) => ({
            netCents: row.netCents,
            serviceDate: new Date(row.serviceDate),
            assignment: { vehicleId: vehicle.id },
            invoice: {
              invoiceDate: new Date(row.serviceDate),
              currency: row.currency ?? 'EUR',
              companyId: 'c1',
              kind: row.kind ?? InvoiceKind.invoice,
            },
          })),
    },
  };

  const service = new FinanceSummaryService(
    prisma as never,
    new ActualRevenueService(prisma as never),
  );

  return {
    getSummary: (query: Parameters<FinanceSummaryService['getSummary']>[0] = {}) =>
      TenantContext.run('tenant-a', () => service.getSummary(query)),
  };
}

const RANGE = { from: '2026-05-01T00:00:00Z', to: '2026-08-01T00:00:00Z' };

describe('finance ozeti — uc sozlesmesi', () => {
  it('GET finance/summary YALNIZCA FINANCIAL_ROLES icin acik', () => {
    const handler = Reflect.get(FinanceController.prototype as object, 'getSummary') as object;
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'summary');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);

    const roles = Reflect.getMetadata(ROLES_KEY, FinanceController) as string[];
    assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
  });

  it('office, driver ve customer ERISEMEZ', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FinanceController) as string[];
    for (const role of ['office', 'driver', 'customer']) {
      assert.equal(roles.includes(role), false, `${role} finance ucuna erisiyor`);
    }
    // INVOICING_ROLES office'i ICERIR ve bu yuzden BILINCLI OLARAK
    // kullanilmadi: bu ekran gider, marj ve ihtilafli ceza gosteriyor.
    assert.equal(INVOICING_ROLES.includes('office'), true);
  });

  it('gecersiz donem HAM hata degil makine-okunur kod uretir', async () => {
    const { getSummary } = build();
    await assert.rejects(
      () => getSummary({ from: '2026-08-01T00:00:00Z', to: '2026-05-01T00:00:00Z' }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        (error.getResponse() as { code: string }).code === 'finance_reversed_range',
    );
  });
});

describe('finance ozeti — tanima kurallari 18B ile AYNI', () => {
  it('yalnizca ONAYLI servis maliyete girer; bekleyen AYRI listede', async () => {
    const { getSummary } = build({
      service: [
        { date: '2026-06-10T00:00:00Z', costAmount: 250 },
        {
          id: 'sr-pending',
          date: '2026-06-11T00:00:00Z',
          costAmount: 900,
          approvalStatus: ServiceRecordApprovalStatus.pending,
        },
      ],
    });

    const result = await getSummary(RANGE);
    assert.equal(result.cost.service.amount, '250.00');
    assert.equal(result.pendingServiceRecords.totalAmount, '900.00');
    assert.equal(result.pendingServiceRecords.totalCount, 1);
    assert.equal(result.pendingServiceRecords.items[0]!.id, 'sr-pending');
    // Bekleyen tutar TOPLAMA girmiyor.
    assert.equal(result.cost.total.amount, '250.00');
  });

  it('ITIRAZ EDILMIS ceza gercek maliyete girmez, ayri bolumde durur', async () => {
    const { getSummary } = build({
      fines: [
        { violationAt: '2026-06-10T00:00:00Z', amount: 60 },
        {
          id: 'fn-disputed',
          violationAt: '2026-06-11T00:00:00Z',
          amount: 320,
          status: FineStatus.widerspruch,
        },
      ],
    });

    const result = await getSummary(RANGE);
    assert.equal(result.cost.fines.amount, '60.00');
    assert.equal(result.disputedFines.totalAmount, '320.00');
    assert.equal(result.disputedFines.totalCount, 1);
    assert.equal(result.disputedFines.items[0]!.id, 'fn-disputed');
  });

  it('yalnizca ONAYLI ve ters kayda alinmamis yakit maliyete girer', async () => {
    const { getSummary } = build({
      fuel: [
        { enteredAt: '2026-06-10T00:00:00Z', totalCost: 100 },
        { enteredAt: '2026-06-11T00:00:00Z', totalCost: 400, reversed: true },
        {
          enteredAt: '2026-06-12T00:00:00Z',
          totalCost: 95.4,
          workflowStatus: FuelEntryWorkflowStatus.submitted,
        },
      ],
    });

    const result = await getSummary(RANGE);
    assert.equal(result.cost.fuel.amount, '100.00');
    // Bekleyen fis kuyrukta gorunuyor ama toplamda YOK.
    assert.equal(result.fuelReceipts.totalCount, 1);
    assert.equal(result.fuelReceipts.totalAmount, '95.40');
    assert.equal(result.cost.total.amount, '100.00');
  });

  it('TAHMIN ile GERCEK gelir AYRI alanlarda ve TOPLANMAZ', async () => {
    const { getSummary } = build({
      assignments: [{ workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 }],
      invoiceLines: [{ netCents: 30_000, serviceDate: '2026-06-10T00:00:00Z' }],
    });

    const result = await getSummary(RANGE);
    assert.equal(result.revenue.estimated.amount, '500.00');
    assert.equal(result.revenue.actual!.amount, '300.00');
    // 800 hicbir alanda YOK.
    assert.notEqual(result.revenue.estimated.amount, '800.00');
  });

  it('marj GERCEK gelirden; fatura yoksa null', async () => {
    const withInvoice = build({
      fuel: [{ enteredAt: '2026-06-10T00:00:00Z', totalCost: 100 }],
      assignments: [{ workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 }],
      invoiceLines: [{ netCents: 30_000, serviceDate: '2026-06-10T00:00:00Z' }],
    });
    assert.equal((await withInvoice.getSummary(RANGE)).margin, '200.00');

    const withoutInvoice = build({
      fuel: [{ enteredAt: '2026-06-10T00:00:00Z', totalCost: 100 }],
      assignments: [{ workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 }],
    });
    const result = await withoutInvoice.getSummary(RANGE);
    // Tahminden marj URETILMIYOR.
    assert.equal(result.revenue.actual, null);
    assert.equal(result.margin, null);
  });
});

describe('finance ozeti — 0 ile "veri yok" ayrimi', () => {
  it('kayit yoksa SAYI sifir doner; tutar tek basina karar vermez', async () => {
    const { getSummary } = build();
    const result = await getSummary(RANGE);
    assert.equal(result.cost.service.count, 0);
    assert.equal(result.cost.service.amount, '0.00');
    // Fatura hic yoksa `actual` NULL — "0,00 ciro" degil.
    assert.equal(result.revenue.actual, null);
  });

  it('OLCULMUS sifir bir degerdir: sayac sifirdan buyuk', async () => {
    const { getSummary } = build({
      fines: [{ violationAt: '2026-06-10T00:00:00Z', amount: 0 }],
    });
    const result = await getSummary(RANGE);
    assert.equal(result.cost.fines.amount, '0.00');
    assert.equal(result.cost.fines.count, 1);
  });

  it('fatura satiri varsa toplam sifir olsa bile null DEGIL', async () => {
    const { getSummary } = build({
      invoiceLines: [
        { netCents: 10_000, serviceDate: '2026-06-10T00:00:00Z' },
        { netCents: 10_000, serviceDate: '2026-06-11T00:00:00Z', kind: InvoiceKind.credit_note },
      ],
    });
    const result = await getSummary(RANGE);
    assert.equal(result.revenue.actual!.amount, '0.00');
    assert.equal(result.revenue.actual!.count, 2);
  });
});

describe('finance ozeti — para birimi', () => {
  it('temel para birimi disindaki kayit toplanmaz ve SESSIZCE dusmez', async () => {
    const { getSummary } = build({
      service: [
        { date: '2026-06-10T00:00:00Z', costAmount: 250 },
        { date: '2026-06-11T00:00:00Z', costAmount: 9000, currency: 'TRY' },
      ],
      fines: [{ violationAt: '2026-07-01T00:00:00Z', amount: 1200, currency: 'TRY' }],
    });

    const result = await getSummary(RANGE);
    assert.equal(result.cost.service.amount, '250.00');
    const bucket = result.unconvertedByCurrency.find((row) => row.currency === 'TRY');
    assert.ok(bucket, 'TRY kirilimda yok');
    assert.equal(bucket!.entryCount, 2);
    assert.equal(bucket!.amount, '10200.00');
  });

  it('liste satiri kendi para biriminde toplanip toplanmadigini TASIR', async () => {
    const { getSummary } = build({
      service: [
        {
          id: 'sr-try',
          date: '2026-06-11T00:00:00Z',
          costAmount: 9000,
          currency: 'TRY',
          approvalStatus: ServiceRecordApprovalStatus.pending,
        },
      ],
    });
    const result = await getSummary(RANGE);
    // Onaylansa bile toplama girmeyecek — ekran bunu karar oncesi soyluyor.
    assert.equal(result.pendingServiceRecords.items[0]!.inBaseCurrency, false);
  });
});

describe('finance ozeti — kirpma', () => {
  it('liste kirpilsa bile TOPLAM SAYI dogru kalir', async () => {
    const { getSummary } = build({
      service: Array.from({ length: 60 }, (_, index) => ({
        id: `sr-${index}`,
        date: '2026-06-10T00:00:00Z',
        costAmount: 10,
        approvalStatus: ServiceRecordApprovalStatus.pending,
      })),
    });

    const result = await getSummary(RANGE);
    // Kirpma SESSIZ DEGIL: 60 kaydin varligi sayida duruyor.
    assert.equal(result.pendingServiceRecords.totalCount, 60);
    assert.equal(result.pendingServiceRecords.items.length, 50);
    /**
     * TOPLAM KIRPILMIYOR: 60 x 10 = 600.
     *
     * Liste satirlarindan toplansaydi 500 cikardi — sayisi dogru, tutari
     * yanlis bir baslik. Bu ikisinin birbirini tutmamasi, tam da muhasebenin
     * fark edemeyecegi turden bir hatadir.
     */
    assert.equal(result.pendingServiceRecords.totalAmount, '600.00');
  });
});
