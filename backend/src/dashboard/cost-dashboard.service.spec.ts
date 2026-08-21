import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import {
  FineStatus,
  FleetTripStatus,
  FuelEntryWorkflowStatus,
  InvoiceKind,
  OutgoingInvoiceStatus,
  Prisma,
  ServiceRecordApprovalStatus,
} from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ActualRevenueService } from '../common/finance/actual-revenue.service';
import { FINANCIAL_ROLES } from '../common/utils/permissions';
import { TenantContext } from '../tenant/tenant-context';
import { CostDashboardService } from './cost-dashboard.service';
import { DashboardController } from './dashboard.controller';

/**
 * Maliyet dashboard'u sozlesmesi.
 *
 * Prisma MOCK ama sorgulari SAYIYOR: "arac basina sorgu yok" iddiasi ancak
 * gercekten olculurse bir sey ifade eder.
 */

const d = (value: number | string) => new Prisma.Decimal(value);

interface Seed {
  vehicles?: Array<{ id: string; plateNumber: string }>;
  fuel?: Array<{
    vehicleId: string;
    enteredAt: string;
    totalCost: number;
    currency?: string;
    workflowStatus?: FuelEntryWorkflowStatus;
    /** Faz 9: bu fis ters kayda alindi mi. */
    reversed?: boolean;
  }>;
  service?: Array<{
    vehicleId: string;
    date: string;
    costAmount: number;
    currency?: string;
    /** Faz 18B: muhasebe onayi. Verilmezse ONAYLI sayilir (eski davranis). */
    approvalStatus?: ServiceRecordApprovalStatus;
  }>;
  fines?: Array<{
    vehicleId: string;
    violationAt: string;
    amount: number;
    currency?: string;
    /** Faz 18B: `widerspruch` gercek maliyete girmez. */
    status?: FineStatus;
  }>;
  /** Faz 18B: GERCEK gelir — fatura satirlari. */
  invoiceLines?: Array<{
    vehicleId: string | null;
    companyId?: string;
    serviceDate: string | null;
    invoiceDate?: string;
    netCents: number;
    currency?: string;
    status?: OutgoingInvoiceStatus;
    kind?: InvoiceKind;
  }>;
  trips?: Array<{ vehicleId: string; startedAt: string; distanceKm: number | null; status?: FleetTripStatus }>;
  assignments?: Array<{
    vehicleId: string;
    workDate: string;
    expectedDailyRevenue: number | null;
    currency?: string;
  }>;
  baseCurrency?: string;
}

/** Fatura durumlarinin GERCEK gelire sayilan kumesi (spec kopyasi degil, ayni liste). */
const ACTUAL_STATUSES: OutgoingInvoiceStatus[] = [
  OutgoingInvoiceStatus.finalized,
  OutgoingInvoiceStatus.sent,
  OutgoingInvoiceStatus.partially_paid,
  OutgoingInvoiceStatus.paid,
  OutgoingInvoiceStatus.overdue,
];

/** Servisin gonderdigi `status` filtresini gercekten uygular. */
function matchesFineStatus(
  rowStatus: FineStatus | undefined,
  where: unknown,
): boolean {
  const status = rowStatus ?? FineStatus.neu;
  if (where && typeof where === 'object' && 'not' in (where as Record<string, unknown>)) {
    return status !== (where as { not: FineStatus }).not;
  }
  return status === where;
}

function inRange(at: string, where: { gte?: Date; lt?: Date } | undefined): boolean {
  if (!where) return true;
  const value = new Date(at).getTime();
  if (where.gte && value < where.gte.getTime()) return false;
  if (where.lt && value >= where.lt.getTime()) return false;
  return true;
}

function build(seed: Seed = {}) {
  const vehicles = seed.vehicles ?? [{ id: 'v1', plateNumber: 'AA-1' }];
  const queries: string[] = [];

  const count = (label: string) => {
    queries.push(label);
  };

  const prisma = {
    tenant: {
      findFirst: async () => ({ baseCurrency: seed.baseCurrency ?? 'EUR' }),
    },
    vehicle: {
      findMany: async (args: { where?: { id?: string } }) => {
        count('vehicle.findMany');
        const filtered = args?.where?.id
          ? vehicles.filter((v) => v.id === args.where!.id)
          : vehicles;
        return filtered.map((v) => ({
          ...v,
          internalCode: null,
          brand: 'MAN',
          model: 'TGX',
        }));
      },
    },
    fleetFuelEntry: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('fuel.findMany');
        // Taklit, servisin GONDERDIGI `where`i uyguluyor — kendi kuralini
        // uydurmuyor. Aksi halde "maliyet filtresi ters kaydi disliyor"
        // testi, servis filtreyi hic gondermese bile gecerdi.
        const wantsEffective =
          (args.where as { reversal?: { is?: null } }).reversal?.is === null;
        return (seed.fuel ?? [])
          .filter(
            (row) =>
              (row.workflowStatus ?? FuelEntryWorkflowStatus.approved) ===
              (args.where.workflowStatus ?? FuelEntryWorkflowStatus.approved),
          )
          .filter((row) => !(wantsEffective && row.reversed === true))
          .filter((row) => inRange(row.enteredAt, args.where.enteredAt as never))
          .map((row) => ({
            vehicleId: row.vehicleId,
            enteredAt: new Date(row.enteredAt),
            totalCost: d(row.totalCost),
            currency: row.currency ?? 'EUR',
          }));
      },
      count: async () => {
        count('fuel.count');
        return (seed.fuel ?? []).filter(
          (row) =>
            row.workflowStatus === FuelEntryWorkflowStatus.submitted ||
            row.workflowStatus === FuelEntryWorkflowStatus.driver_review,
        ).length;
      },
    },
    serviceRecord: {
      count: async (args: { where: Record<string, unknown> }) => {
        count('service.count');
        return (seed.service ?? []).filter(
          (row) =>
            (row.approvalStatus ?? ServiceRecordApprovalStatus.approved) ===
            args.where.approvalStatus,
        ).length;
      },
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('service.findMany');
        return (seed.service ?? [])
          // Taklit, servisin GONDERDIGI onay filtresini uyguluyor — kendi
          // kuralini uydurmuyor. Aksi halde "onaysiz servis toplama girmez"
          // testi, servis filtreyi hic gondermese bile gecerdi.
          .filter(
            (row) =>
              (row.approvalStatus ?? ServiceRecordApprovalStatus.approved) ===
              args.where.approvalStatus,
          )
          .filter((row) => inRange(row.date, args.where.date as never))
          .map((row) => ({
            vehicleId: row.vehicleId,
            date: new Date(row.date),
            costAmount: d(row.costAmount),
            currency: row.currency ?? 'EUR',
          }));
      },
    },
    fine: {
      count: async (args: { where: Record<string, unknown> }) => {
        count('fine.count');
        return (seed.fines ?? []).filter((row) => matchesFineStatus(row.status, args.where.status))
          .length;
      },
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('fine.findMany');
        return (seed.fines ?? [])
          // `status: { not: 'widerspruch' }` ve `status: 'widerspruch'`
          // filtrelerinin IKISI de gercekten uygulaniyor.
          .filter((row) => matchesFineStatus(row.status, args.where.status))
          .filter((row) => inRange(row.violationAt, args.where.violationAt as never))
          .map((row) => ({
            vehicleId: row.vehicleId,
            violationAt: new Date(row.violationAt),
            amount: d(row.amount),
            currency: row.currency ?? 'EUR',
          }));
      },
    },
    invoiceLine: {
      findMany: async () => {
        count('invoiceLine.findMany');
        // Fatura durumu ve tarih araligi `ActualRevenueService`in
        // `where`inde; taklit yalnizca satirlari veriyor ve filtreleme
        // asagida ELLE uygulaniyor ki servis kuralini atlayamasin.
        return (seed.invoiceLines ?? [])
          .filter((row) =>
            ACTUAL_STATUSES.includes(row.status ?? OutgoingInvoiceStatus.finalized),
          )
          .map((row) => ({
            netCents: row.netCents,
            serviceDate: row.serviceDate === null ? null : new Date(row.serviceDate),
            assignment: row.vehicleId === null ? null : { vehicleId: row.vehicleId },
            invoice: {
              invoiceDate: new Date(row.invoiceDate ?? row.serviceDate ?? '2026-06-15T00:00:00Z'),
              currency: row.currency ?? 'EUR',
              companyId: row.companyId ?? 'c1',
              kind: row.kind ?? InvoiceKind.invoice,
            },
          }));
      },
    },
    fleetTrip: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('trip.findMany');
        return (seed.trips ?? [])
          .filter((row) => (row.status ?? FleetTripStatus.closed) === FleetTripStatus.closed)
          .filter((row) => inRange(row.startedAt, args.where.startedAt as never))
          .map((row) => ({
            vehicleId: row.vehicleId,
            startedAt: new Date(row.startedAt),
            distanceKm: row.distanceKm === null ? null : d(row.distanceKm),
          }));
      },
    },
    assignment: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('assignment.findMany');
        return (seed.assignments ?? [])
          .filter((row) => inRange(row.workDate, args.where.workDate as never))
          .map((row) => ({
            vehicleId: row.vehicleId,
            workDate: new Date(row.workDate),
            expectedDailyRevenue:
              row.expectedDailyRevenue === null ? null : d(row.expectedDailyRevenue),
            // Gercek semadaki NOT NULL alan. Verilmezse tabana ait sayilir.
            currency: row.currency ?? 'EUR',
            company: null,
          }));
      },
    },
  };

  const service = new CostDashboardService(
    prisma as never,
    new ActualRevenueService(prisma as never),
  );

  return {
    // Gercek istekte kiraci baglami HER ZAMAN var (TenantInterceptor kuruyor);
    // testte de kurulmali, aksi halde servis baseCurrency'yi okuyamaz.
    service: {
      getCostDashboard: (query: Parameters<CostDashboardService['getCostDashboard']>[0]) =>
        TenantContext.run('tenant-a', () => service.getCostDashboard(query)),
    },
    queries,
  };
}

const RANGE = { from: '2026-05-01T00:00:00Z', to: '2026-08-01T00:00:00Z' };

describe('cost dashboard — endpoint contract', () => {
  it('is exposed as GET dashboard/cost-dashboard for financial roles only', () => {
    const handler = Reflect.get(DashboardController.prototype as object, 'getCostDashboard') as object;
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'cost-dashboard');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);

    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
    // office ve driver ERISEMEZ.
    assert.equal(roles.includes('office'), false);
    assert.equal(roles.includes('driver'), false);
  });
});

describe('cost dashboard — cost rules', () => {
  it('books only approved fuel', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        {
          vehicleId: 'v1',
          enteredAt: '2026-06-11T10:00:00Z',
          totalCost: 500,
          workflowStatus: FuelEntryWorkflowStatus.submitted,
        },
        {
          vehicleId: 'v1',
          enteredAt: '2026-06-12T10:00:00Z',
          totalCost: 900,
          workflowStatus: FuelEntryWorkflowStatus.rejected,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fuel, '100.00');
    // Bekleyen fis toplama girmiyor ama SAYILIYOR.
    assert.equal(result.summary.pendingReceiptCount, 1);
  });

  it('keeps a foreign-currency receipt out of the total and groups it separately', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v1', enteredAt: '2026-06-11T10:00:00Z', totalCost: 5000, currency: 'TRY' },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fuel, '100.00');
    assert.deepEqual(result.unconvertedByCurrency, [
      { currency: 'TRY', amount: '5000.00', entryCount: 1 },
    ]);
    assert.equal(result.dataQuality.excludedUnconvertedEntries, 1);
  });

  it('makes the category totals add up to the grand total', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
      service: [{ vehicleId: 'v1', date: '2026-06-15T10:00:00Z', costAmount: 250 }],
      fines: [{ vehicleId: 'v1', violationAt: '2026-07-01T10:00:00Z', amount: 60 }],
    });

    const result = await service.getCostDashboard(RANGE);
    const sum =
      Number(result.composition.fuel) +
      Number(result.composition.service) +
      Number(result.composition.fines);
    assert.equal(Number(result.composition.total), sum);
    assert.equal(result.summary.totalCost.current, '410.00');
  });

  it('makes the vehicle totals add up to the fleet total', async () => {
    const { service } = build({
      vehicles: [
        { id: 'v1', plateNumber: 'AA-1' },
        { id: 'v2', plateNumber: 'BB-2' },
      ],
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v2', enteredAt: '2026-06-10T10:00:00Z', totalCost: 300 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    const vehicleSum = result.vehicleRanking.reduce((acc, row) => acc + Number(row.total), 0);
    assert.equal(vehicleSum, Number(result.composition.total));
  });
});

describe('cost dashboard — periods', () => {
  it('emits an empty bucket for a month without records', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
    });

    const result = await service.getCostDashboard(RANGE);
    const keys = result.monthlySeries.map((point) => point.bucket);
    assert.deepEqual(keys, ['2026-05', '2026-06', '2026-07', '2026-08']);

    const may = result.monthlySeries.find((p) => p.bucket === '2026-05')!;
    // Bos ay SIFIRLA gorunuyor, atlanmiyor.
    assert.equal(may.total, '0.00');
    assert.equal(result.monthlySeries.find((p) => p.bucket === '2026-06')!.fuel, '100.00');
  });

  it('compares against the immediately preceding, equal-length period', async () => {
    const { service } = build({
      fuel: [
        // Onceki donem (subat-mayis)
        { vehicleId: 'v1', enteredAt: '2026-03-10T10:00:00Z', totalCost: 200 },
        // Bu donem
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 300 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.fuelCost.current, '300.00');
    assert.equal(result.summary.fuelCost.previous, '200.00');
    assert.equal(result.summary.fuelCost.percentChange, '50.0');
    // Sinirlar CAKISMIYOR.
    assert.equal(result.comparisonPeriod.to, new Date(RANGE.from).toISOString());
  });

  it('returns null percent when the previous period was empty', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 300 }],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.fuelCost.previous, '0.00');
    // Sahte yuzde URETILMIYOR.
    assert.equal(result.summary.fuelCost.percentChange, null);
  });

  it('rejects a reversed range', async () => {
    const { service } = build();
    await assert.rejects(
      service.getCostDashboard({ from: '2026-08-01', to: '2026-05-01' }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal(
          (error.getResponse() as { code?: string }).code,
          'cost_dashboard_reversed_range',
        );
        return true;
      },
    );
  });

  it('rejects an unbounded history query', async () => {
    const { service } = build();
    await assert.rejects(service.getCostDashboard({ from: '2000-01-01', to: '2026-08-01' }));
  });
});

describe('cost dashboard — distance and cost per km', () => {
  it('uses closed trips as the actual distance', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 1000 }],
      trips: [
        { vehicleId: 'v1', startedAt: '2026-06-05T08:00:00Z', distanceKm: 1500 },
        // Acik sefer GERCEKLESMIS sayilmaz.
        { vehicleId: 'v1', startedAt: '2026-06-06T08:00:00Z', distanceKm: 999, status: FleetTripStatus.active },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.vehicleRanking[0]!.distanceKm, '1500.000');
    assert.equal(result.vehicleRanking[0]!.costPerKm, '0.6667');
  });

  it('reports null cost per km when there is no usable distance', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 1000 }],
    });

    const result = await service.getCostDashboard(RANGE);
    const row = result.vehicleRanking[0]!;
    // `0 €/km` GOSTERILMIYOR.
    assert.equal(row.costPerKm, null);
    assert.equal(row.distanceKm, null);
    assert.ok(row.dataQuality.includes('no_distance'));
    assert.equal(result.dataQuality.vehiclesWithoutDistance, 1);
  });

  it('computes the fleet ratio weighted, not as an average of vehicle ratios', async () => {
    const { service } = build({
      vehicles: [
        { id: 'v1', plateNumber: 'AA-1' },
        { id: 'v2', plateNumber: 'BB-2' },
      ],
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v2', enteredAt: '2026-06-10T10:00:00Z', totalCost: 500 },
      ],
      trips: [
        { vehicleId: 'v1', startedAt: '2026-06-05T08:00:00Z', distanceKm: 10 },
        { vehicleId: 'v2', startedAt: '2026-06-05T08:00:00Z', distanceKm: 10000 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    // 600 / 10010 = 0,0599 — arac oranlarinin ortalamasi 5,02 olurdu.
    assert.equal(result.summary.costPerKm!.current, '0.0599');
  });
});

describe('cost dashboard — ranking and performance', () => {
  it('sorts by total cost with a deterministic tie-break', async () => {
    const { service } = build({
      vehicles: [
        { id: 'z', plateNumber: 'ZZ-9' },
        { id: 'a', plateNumber: 'AA-1' },
      ],
      fuel: [
        { vehicleId: 'z', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'a', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.deepEqual(result.vehicleRanking.map((r) => r.vehicleId), ['a', 'z']);
  });

  it('pages the ranking on the server', async () => {
    const vehicles = Array.from({ length: 15 }, (_, i) => ({
      id: `v${i}`,
      plateNumber: `PL-${String(i).padStart(2, '0')}`,
    }));
    const { service } = build({
      vehicles,
      fuel: vehicles.map((v, i) => ({
        vehicleId: v.id,
        enteredAt: '2026-06-10T10:00:00Z',
        totalCost: (i + 1) * 10,
      })),
    });

    const result = await service.getCostDashboard({ ...RANGE, pageSize: 10 });
    assert.equal(result.vehicleRanking.length, 10);
    assert.equal(result.pagination.total, 15);
    assert.equal(result.pagination.totalPages, 2);
    // En pahali arac basta.
    assert.equal(result.vehicleRanking[0]!.total, '150.00');
  });

  it('issues a constant number of queries regardless of fleet size', async () => {
    const small = build({ vehicles: [{ id: 'v1', plateNumber: 'AA-1' }] });
    await small.service.getCostDashboard(RANGE);

    const large = build({
      vehicles: Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, plateNumber: `PL-${i}` })),
    });
    await large.service.getCostDashboard(RANGE);

    // ARAC BASINA SORGU YOK: 50 araclik filo tek araclikla AYNI sayida sorgu
    // atmali. N+1 olsaydi buyuk filo 100+ sorgu uretirdi.
    assert.equal(large.queries.length, small.queries.length);
    /**
     * Ust sinir Faz 18B'de 15'ten 24'e cikti ve nedeni bilincli: toplama
     * GIRMEYEN siniflar (onay bekleyen servis, ihtilafli ceza) ile gercek
     * gelir AYRI sorgularla okunuyor. Tek sorguda okuyup bellekte ayirmak
     * dort sorgu tasarruf ederdi ama filtreyi canonical `where`
     * yardimcilarindan cikarirdi — ve bu fazin butun meselesi, kuralin TEK
     * yerde ve atlanamaz olmasi.
     *
     * Sinir hala SABIT: filo buyudukce sorgu sayisi artmiyor.
     */
    assert.ok(large.queries.length <= 24, `beklenenden fazla sorgu: ${large.queries.length}`);
  });

  it('filters to a single vehicle when asked', async () => {
    const { service } = build({
      vehicles: [
        { id: 'v1', plateNumber: 'AA-1' },
        { id: 'v2', plateNumber: 'BB-2' },
      ],
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
    });

    const result = await service.getCostDashboard({ ...RANGE, vehicleId: 'v1' });
    assert.equal(result.vehicleRanking.length, 1);
    assert.equal(result.vehicleRanking[0]!.vehicleId, 'v1');
  });
});

describe('cost dashboard — currency and revenue', () => {
  it('reports the tenant base currency', async () => {
    const { service } = build({ baseCurrency: 'TRY' });
    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.baseCurrency, 'TRY');
  });

  it('books TRY records for a TRY tenant and excludes EUR ones', async () => {
    const { service } = build({
      baseCurrency: 'TRY',
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 5000, currency: 'TRY' },
        { vehicleId: 'v1', enteredAt: '2026-06-11T10:00:00Z', totalCost: 100, currency: 'EUR' },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fuel, '5000.00');
    assert.deepEqual(result.unconvertedByCurrency, [
      { currency: 'EUR', amount: '100.00', entryCount: 1 },
    ]);
  });

  it('gorev tahmini TAHMINI GELIR alaninda kalir; marjda YER ALMAZ', async () => {
    /**
     * FAZ 18B'NIN ILK DUZELTMESI.
     *
     * `expectedDailyRevenue` bir plan rakami. Onceden `revenue` diye
     * toplaniyor ve marj ondan hesaplaniyordu: faturasi olmayan bir arac
     * "400 EUR kar etti" gorunuyordu.
     */
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
      assignments: [
        { vehicleId: 'v1', workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.estimatedRevenue!.current, '500.00');
    // Fatura YOK: gercek gelir ve marj OLCULEMEDI — sifir degil, null.
    assert.equal(result.summary.actualRevenue, null);
    assert.equal(result.summary.margin, null);
    assert.equal(result.vehicleRanking[0]!.margin, null);
    assert.equal(result.vehicleRanking[0]!.estimatedRevenue, '500.00');
    assert.equal(result.vehicleRanking[0]!.actualRevenue, null);
    assert.ok(result.vehicleRanking[0]!.dataQuality.includes('no_actual_revenue'));
  });

  it('GERCEK gelir faturadan gelir ve marj ONDAN hesaplanir', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
      assignments: [
        { vehicleId: 'v1', workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 },
      ],
      invoiceLines: [
        { vehicleId: 'v1', serviceDate: '2026-06-10T00:00:00Z', netCents: 30_000 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.estimatedRevenue!.current, '500.00');
    assert.equal(result.summary.actualRevenue!.current, '300.00');
    // Marj 300 - 100; TAHMINDEKI 500 hicbir yere karismiyor.
    assert.equal(result.summary.margin!.current, '200.00');
    assert.equal(result.vehicleRanking[0]!.margin, '200.00');
  });

  it('TASLAK ve IPTAL fatura gercek gelire GIRMEZ; alacak dekontu DUSER', async () => {
    const { service } = build({
      invoiceLines: [
        { vehicleId: 'v1', serviceDate: '2026-06-10T00:00:00Z', netCents: 100_000 },
        {
          vehicleId: 'v1',
          serviceDate: '2026-06-11T00:00:00Z',
          netCents: 900_000,
          status: OutgoingInvoiceStatus.draft,
        },
        {
          vehicleId: 'v1',
          serviceDate: '2026-06-12T00:00:00Z',
          netCents: 700_000,
          status: OutgoingInvoiceStatus.cancelled,
        },
        {
          vehicleId: 'v1',
          serviceDate: '2026-06-13T00:00:00Z',
          netCents: 20_000,
          kind: InvoiceKind.credit_note,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    // 1.000 - 200 = 800. Taslak ve iptal hic sayilmadi.
    assert.equal(result.summary.actualRevenue!.current, '800.00');
  });

  it('goreve baglanmayan fatura satiri FILO toplamina girer, ARACA yazilmaz', async () => {
    const { service } = build({
      invoiceLines: [
        { vehicleId: null, serviceDate: '2026-06-10T00:00:00Z', netCents: 50_000 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.actualRevenue!.current, '500.00');
    // Rastgele bir araca yazilsaydi o aracin marji bozulurdu.
    assert.equal(result.vehicleRanking[0]!.actualRevenue, null);
  });

  it('TEMEL PARA BIRIMI DISINDAKI gelir toplama GIRMEZ', async () => {
    /**
     * Denetimin acigi: yakit, servis ve ceza icin `matchesBaseCurrency`
     * korumasi vardi; GELIR korumasizdi ve TRY tutarlar EUR toplamina
     * sessizce giriyordu.
     */
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
      assignments: [
        { vehicleId: 'v1', workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 },
        {
          vehicleId: 'v1',
          workDate: '2026-06-11T00:00:00Z',
          expectedDailyRevenue: 45000,
          currency: 'TRY',
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    // 500 EUR; 45.000 TRY GIRMEDI.
    assert.equal(result.summary.estimatedRevenue!.current, '500.00');
    assert.notEqual(result.summary.estimatedRevenue!.current, '45500.00');

    // SILINMEDI: ayri kirilimda duruyor.
    const bucket = result.unconvertedByCurrency.find((row) => row.currency === 'TRY');
    assert.ok(bucket, 'TRY kaydi kirilimda yok');
    assert.equal(bucket!.entryCount, 1);
    assert.ok(result.dataQuality.excludedUnconvertedEntries >= 1);
  });

  it('returns null revenue when no assignment carries one', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
    });

    const result = await service.getCostDashboard(RANGE);
    // Uydurma sifir gelir GOSTERILMIYOR.
    assert.equal(result.summary.estimatedRevenue, null);
    assert.equal(result.summary.actualRevenue, null);
    assert.equal(result.summary.margin, null);
  });
});

describe('cost dashboard — ters kayit (Faz 9)', () => {
  it('ters kayda alinmis fis toplama GIRMEZ', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v1', enteredAt: '2026-06-11T10:00:00Z', totalCost: 400, reversed: true },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fuel, '100.00');
    assert.equal(result.summary.totalCost.current, '100.00');
  });

  it('ters kayit ORIJINAL DONEMIN maliyetini dusurur', async () => {
    const withReversal = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 250, reversed: true }],
    });
    const withoutReversal = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 250 }],
    });

    const reversed = await withReversal.service.getCostDashboard(RANGE);
    const intact = await withoutReversal.service.getCostDashboard(RANGE);

    const june = (result: typeof intact) =>
      result.monthlySeries.find((point) => point.bucket === '2026-06')!;

    // Gecmis rapor DUZELTILMIS gosteriyor: tutar kendi ayindan dusuyor.
    assert.equal(june(intact).fuel, '250.00');
    assert.equal(june(reversed).fuel, '0.00');
  });

  it('ters kaydin girildigi ayda SAHTE NEGATIF gider olusmaz', async () => {
    // Fis mayista alindi, ters kayit agustosta girildi.
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-05-10T10:00:00Z', totalCost: 300, reversed: true }],
    });

    const result = await service.getCostDashboard(RANGE);
    for (const point of result.monthlySeries) {
      assert.ok(
        Number(point.fuel) >= 0,
        `${point.bucket} ayinda negatif gider olusmamali: ${point.fuel}`,
      );
      assert.ok(Number(point.total) >= 0, `${point.bucket} toplami negatif olmamali`);
    }
  });

  it('maliyet/km hesabi ters kaydi DISARIDA birakir', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v1', enteredAt: '2026-06-11T10:00:00Z', totalCost: 900, reversed: true },
      ],
      trips: [{ vehicleId: 'v1', startedAt: '2026-06-10T10:00:00Z', distanceKm: 1000 }],
    });

    const result = await service.getCostDashboard(RANGE);
    // 100 / 1000 km = 0,100 — geri alinan 900 hesaba KATILMIYOR.
    assert.equal(result.vehicleRanking[0].costPerKm, '0.1000');
  });

  it('ters kayit, farkli para birimi davranisini BOZMAZ', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v1', enteredAt: '2026-06-11T10:00:00Z', totalCost: 5000, currency: 'TRY' },
        {
          vehicleId: 'v1',
          enteredAt: '2026-06-12T10:00:00Z',
          totalCost: 7000,
          currency: 'TRY',
          reversed: true,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fuel, '100.00');
    // Geri alinan TRY fisi donusturulmemisler listesine de GIRMEZ.
    assert.deepEqual(result.unconvertedByCurrency, [
      { currency: 'TRY', amount: '5000.00', entryCount: 1 },
    ]);
  });

  it('tutarlar ters kayittan sonra da STRING kalir', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        { vehicleId: 'v1', enteredAt: '2026-06-11T10:00:00Z', totalCost: 400, reversed: true },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(typeof result.summary.totalCost.current, 'string');
    assert.equal(typeof result.composition.fuel, 'string');
    assert.equal(typeof result.vehicleRanking[0].total, 'string');
  });

  it('ters kayit filtresi arac basina EK SORGU URETMEZ', async () => {
    const { service, queries } = build({
      vehicles: Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, plateNumber: `AA-${i}` })),
      fuel: Array.from({ length: 12 }, (_, i) => ({
        vehicleId: `v${i}`,
        enteredAt: '2026-06-10T10:00:00Z',
        totalCost: 100,
        reversed: i % 2 === 0,
      })),
    });

    await service.getCostDashboard(RANGE);
    // Ters kayit iliskisi ayni `where` icinde cozuluyor; satir basina ikinci
    // bir sorgu atilsaydi bu sayi arac sayisiyla buyurdu.
    assert.equal(queries.filter((q) => q === 'fuel.findMany').length, 2);
  });
});

describe('cost dashboard — tanima kurallari (Faz 18B)', () => {
  it('YALNIZCA ONAYLI servis kaydi maliyete girer', async () => {
    const { service } = build({
      service: [
        { vehicleId: 'v1', date: '2026-06-10T10:00:00Z', costAmount: 250 },
        {
          vehicleId: 'v1',
          date: '2026-06-11T10:00:00Z',
          costAmount: 900,
          approvalStatus: ServiceRecordApprovalStatus.pending,
        },
        {
          vehicleId: 'v1',
          date: '2026-06-12T10:00:00Z',
          costAmount: 700,
          approvalStatus: ServiceRecordApprovalStatus.rejected,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.service, '250.00');
    assert.equal(result.summary.totalCost.current, '250.00');
  });

  it('onay bekleyen servis SILINMIYOR: tutariyla ayri raporlaniyor', async () => {
    const { service } = build({
      service: [
        {
          vehicleId: 'v1',
          date: '2026-06-11T10:00:00Z',
          costAmount: 900,
          approvalStatus: ServiceRecordApprovalStatus.pending,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.pendingServiceCost, '900.00');
    assert.equal(result.summary.pendingServiceCount, 1);
    assert.equal(result.excludedFromTotals.pendingService, '900.00');
    // Toplamda YOK.
    assert.equal(result.composition.total, '0.00');
    assert.equal(result.vehicleRanking[0]!.pendingService, '900.00');
  });

  it('reddedilen servis HICBIR kovaya girmez', async () => {
    const { service } = build({
      service: [
        {
          vehicleId: 'v1',
          date: '2026-06-11T10:00:00Z',
          costAmount: 700,
          approvalStatus: ServiceRecordApprovalStatus.rejected,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.service, '0.00');
    assert.equal(result.summary.pendingServiceCost, '0.00');
    assert.equal(result.summary.pendingServiceCount, 0);
  });

  it('ITIRAZ EDILMIS ceza gercek maliyete girmez, ihtilafli olarak ayri durur', async () => {
    const { service } = build({
      fines: [
        { vehicleId: 'v1', violationAt: '2026-06-10T10:00:00Z', amount: 60 },
        {
          vehicleId: 'v1',
          violationAt: '2026-06-11T10:00:00Z',
          amount: 320,
          status: FineStatus.widerspruch,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fines, '60.00');
    assert.equal(result.summary.totalCost.current, '60.00');
    // Sifirlanmadi: itiraz kaybedilirse odenecek tutar GORUNUR kaliyor.
    assert.equal(result.summary.disputedFineCost, '320.00');
    assert.equal(result.summary.disputedFineCount, 1);
    assert.equal(result.vehicleRanking[0]!.disputedFines, '320.00');
  });

  it('odenmis ve kapatilmis ceza maliyette KALIR', async () => {
    const { service } = build({
      fines: [
        { vehicleId: 'v1', violationAt: '2026-06-10T10:00:00Z', amount: 60, status: FineStatus.bezahlt },
        {
          vehicleId: 'v1',
          violationAt: '2026-06-11T10:00:00Z',
          amount: 40,
          status: FineStatus.abgeschlossen,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.fines, '100.00');
    assert.equal(result.summary.disputedFineCount, 0);
  });

  it('toplam yalnizca ONAYLI gerceklerden olusur — kategoriler toplami tutar', async () => {
    const { service } = build({
      fuel: [
        { vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 },
        {
          vehicleId: 'v1',
          enteredAt: '2026-06-11T10:00:00Z',
          totalCost: 800,
          workflowStatus: FuelEntryWorkflowStatus.submitted,
        },
      ],
      service: [
        { vehicleId: 'v1', date: '2026-06-15T10:00:00Z', costAmount: 250 },
        {
          vehicleId: 'v1',
          date: '2026-06-16T10:00:00Z',
          costAmount: 900,
          approvalStatus: ServiceRecordApprovalStatus.pending,
        },
      ],
      fines: [
        { vehicleId: 'v1', violationAt: '2026-07-01T10:00:00Z', amount: 60 },
        {
          vehicleId: 'v1',
          violationAt: '2026-07-02T10:00:00Z',
          amount: 320,
          status: FineStatus.widerspruch,
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.totalCost.current, '410.00');
    assert.equal(
      Number(result.composition.total),
      Number(result.composition.fuel) +
        Number(result.composition.service) +
        Number(result.composition.fines),
    );
    // Disarida kalanlar toplama EKLENMIYOR ama gorunuyorlar.
    assert.equal(result.excludedFromTotals.pendingService, '900.00');
    assert.equal(result.excludedFromTotals.disputedFines, '320.00');
    assert.equal(result.excludedFromTotals.pendingReceiptCount, 1);
  });

  it('TEMEL PARA BIRIMI DISINDAKI servis ve ceza SESSIZCE dusmez', async () => {
    /**
     * Onceden `continue` ile atlaniyorlardi: toplam eksiliyor ama ekranda
     * hicbir iz kalmiyordu.
     */
    const { service } = build({
      service: [
        { vehicleId: 'v1', date: '2026-06-10T10:00:00Z', costAmount: 250 },
        { vehicleId: 'v1', date: '2026-06-11T10:00:00Z', costAmount: 9000, currency: 'TRY' },
      ],
      fines: [
        { vehicleId: 'v1', violationAt: '2026-07-01T10:00:00Z', amount: 1200, currency: 'TRY' },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.composition.service, '250.00');
    const bucket = result.unconvertedByCurrency.find((row) => row.currency === 'TRY');
    assert.ok(bucket, 'TRY kaydi kirilimda yok');
    assert.equal(bucket!.entryCount, 2);
    assert.equal(bucket!.amount, '10200.00');
  });

  it('temel para birimi disindaki FATURA geliri de toplama girmez', async () => {
    const { service } = build({
      invoiceLines: [
        { vehicleId: 'v1', serviceDate: '2026-06-10T00:00:00Z', netCents: 100_000 },
        {
          vehicleId: 'v1',
          serviceDate: '2026-06-11T00:00:00Z',
          netCents: 4_500_000,
          currency: 'TRY',
        },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.actualRevenue!.current, '1000.00');
    const bucket = result.unconvertedByCurrency.find((row) => row.currency === 'TRY');
    assert.ok(bucket, 'TRY fatura kirilimda yok');
    assert.equal(bucket!.entryCount, 1);
  });
});
