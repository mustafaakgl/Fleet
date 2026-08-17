import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { FleetTripStatus, FuelEntryWorkflowStatus, Prisma } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
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
  }>;
  service?: Array<{ vehicleId: string; date: string; costAmount: number; currency?: string }>;
  fines?: Array<{ vehicleId: string; violationAt: string; amount: number; currency?: string }>;
  trips?: Array<{ vehicleId: string; startedAt: string; distanceKm: number | null; status?: FleetTripStatus }>;
  assignments?: Array<{ vehicleId: string; workDate: string; expectedDailyRevenue: number | null }>;
  baseCurrency?: string;
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
        return (seed.fuel ?? [])
          .filter((row) => (row.workflowStatus ?? FuelEntryWorkflowStatus.approved) === FuelEntryWorkflowStatus.approved)
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
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('service.findMany');
        return (seed.service ?? [])
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
      findMany: async (args: { where: Record<string, unknown> }) => {
        count('fine.findMany');
        return (seed.fines ?? [])
          .filter((row) => inRange(row.violationAt, args.where.violationAt as never))
          .map((row) => ({
            vehicleId: row.vehicleId,
            violationAt: new Date(row.violationAt),
            amount: d(row.amount),
            currency: row.currency ?? 'EUR',
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
            company: null,
          }));
      },
    },
  };

  const service = new CostDashboardService(prisma as never);

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
      { currency: 'TRY', fuelAmount: '5000.00', entryCount: 1 },
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
    assert.ok(large.queries.length < 15, `beklenenden fazla sorgu: ${large.queries.length}`);
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
      { currency: 'EUR', fuelAmount: '100.00', entryCount: 1 },
    ]);
  });

  it('keeps the existing revenue and margin behaviour', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
      assignments: [
        { vehicleId: 'v1', workDate: '2026-06-10T00:00:00Z', expectedDailyRevenue: 500 },
      ],
    });

    const result = await service.getCostDashboard(RANGE);
    assert.equal(result.summary.revenue!.current, '500.00');
    assert.equal(result.summary.margin!.current, '400.00');
    assert.equal(result.vehicleRanking[0]!.margin, '400.00');
  });

  it('returns null revenue when no assignment carries one', async () => {
    const { service } = build({
      fuel: [{ vehicleId: 'v1', enteredAt: '2026-06-10T10:00:00Z', totalCost: 100 }],
    });

    const result = await service.getCostDashboard(RANGE);
    // Uydurma sifir gelir GOSTERILMIYOR.
    assert.equal(result.summary.revenue, null);
    assert.equal(result.summary.margin, null);
  });
});
