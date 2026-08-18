import { BadRequestException, Injectable } from '@nestjs/common';
import { FleetTripStatus, FuelEntryWorkflowStatus, Prisma } from '@prisma/client';
import {
  DEFAULT_BASE_CURRENCY,
  matchesBaseCurrency,
  normalizeCurrency,
} from '../common/utils/currency';
import { effectiveFuelCostWhere } from '../fleet/fuel-receipts/core/effective-fuel-cost';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTimeZone } from '../common/utils/timezone';
import { TenantContext } from '../tenant/tenant-context';
import {
  ZERO,
  bucketKeyFor,
  compare,
  compareDistance,
  costPerKm,
  dataQualityFlags,
  distance,
  costPerKmCoverage,
  fleetCostPerKm,
  money,
  monthBuckets,
  resolvePeriod,
  sortVehicles,
  type MetricComparison,
  type VehicleSortKey,
} from './core/cost-dashboard.util';

/** Tek bir aracin bir donemdeki toplamlari. */
interface VehicleTotals {
  fuel: Prisma.Decimal;
  service: Prisma.Decimal;
  fines: Prisma.Decimal;
  revenue: Prisma.Decimal;
  distanceKm: Prisma.Decimal | null;
  hasRevenue: boolean;
}

function emptyTotals(): VehicleTotals {
  return {
    fuel: ZERO,
    service: ZERO,
    fines: ZERO,
    revenue: ZERO,
    distanceKm: null,
    hasRevenue: false,
  };
}

export interface CostDashboardQuery {
  from?: string;
  to?: string;
  months?: number;
  vehicleId?: string;
  sort?: VehicleSortKey;
  page?: number;
  pageSize?: number;
}

/**
 * Arac maliyeti dashboard'u.
 *
 * CANONICAL KAYNAKLAR DEGISMEDI ve yeni bir maliyet tablosu YOK: yakit
 * `approved FleetFuelEntry`, servis `ServiceRecord`, ceza `Fine`, gelir
 * `Assignment`, mesafe `FleetTrip{closed}`. Materialized snapshot uretmek,
 * onaylanan bir fisten sonra dashboard'un eski rakami gostermesi demek olurdu.
 *
 * SORGU SAYISI ARAC SAYISINDAN BAGIMSIZ: her kaynak icin donem basina TEK
 * sorgu atiliyor ve kovalama uygulama katmaninda yapiliyor. Arac basina sorgu
 * (N+1) 50 araclik bir filoda 200+ sorgu uretirdi.
 *
 * AY KOVALARI SQL'DE DEGIL BURADA: `date_trunc('month', ...)` veritabaninin
 * zaman diliminde gruplar; filonun ay siniri Europe/Berlin'e gore ve yaz saati
 * gecislerinde bu iki sey ayrisir.
 */
@Injectable()
export class CostDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getCostDashboard(query: CostDashboardQuery) {
    const tenantId = TenantContext.getTenantId();
    const tenant = tenantId
      ? await this.prisma.tenant.findFirst({
          where: { id: tenantId },
          select: { baseCurrency: true, timezone: true },
        })
      : null;
    const baseCurrency = normalizeCurrency(tenant?.baseCurrency) ?? DEFAULT_BASE_CURRENCY;
    // Ay sinirlari KIRACININ zaman diliminde: ayni UTC ani Berlin ve
    // Istanbul'da farkli aya dusebilir.
    const timeZone = resolveTimeZone(tenant?.timezone);

    const resolved = resolvePeriod(query, new Date(), timeZone);
    if (!resolved.ok) {
      // Ham hata degil makine-okunur kod: arayuz kullanici metnine cevirir.
      throw new BadRequestException({ code: `cost_dashboard_${resolved.error}` });
    }
    const { from, to, comparisonFrom, comparisonTo } = resolved.period;

    const vehicleFilter = query.vehicleId ? { vehicleId: query.vehicleId } : {};

    const [vehicles, current, previous, pendingReceiptCount] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: query.vehicleId ? { id: query.vehicleId } : {},
        select: { id: true, plateNumber: true, internalCode: true, brand: true, model: true },
        orderBy: { plateNumber: 'asc' },
      }),
      this.collect(from, to, baseCurrency, vehicleFilter, timeZone),
      this.collect(comparisonFrom, comparisonTo, baseCurrency, vehicleFilter, timeZone),
      this.prisma.fleetFuelEntry.count({
        where: {
          ...vehicleFilter,
          enteredAt: { gte: from, lt: to },
          workflowStatus: {
            in: [FuelEntryWorkflowStatus.driver_review, FuelEntryWorkflowStatus.submitted],
          },
        },
      }),
    ]);

    const buckets = monthBuckets(from, to, timeZone);

    // --- Aylik seri: BOS AYLAR DA VAR ---
    const monthlySeries = buckets.map((bucket) => {
      const month = current.byMonth.get(bucket.key) ?? emptyTotals();
      const total = month.fuel.plus(month.service).plus(month.fines);
      const km = month.distanceKm;
      const perKm = costPerKm(total, km);
      return {
        bucket: bucket.key,
        label: bucket.key,
        fuel: money(month.fuel),
        service: money(month.service),
        fines: money(month.fines),
        total: money(total),
        revenue: month.hasRevenue ? money(month.revenue) : null,
        distanceKm: distance(km),
        costPerKm: perKm === null ? null : perKm.toFixed(4),
      };
    });

    // --- Arac siralamasi ---
    const ranked = vehicles.map((vehicle) => {
      const now = current.byVehicle.get(vehicle.id) ?? emptyTotals();
      const before = previous.byVehicle.get(vehicle.id) ?? emptyTotals();
      const total = now.fuel.plus(now.service).plus(now.fines);
      const previousTotal = before.fuel.plus(before.service).plus(before.fines);
      const perKm = costPerKm(total, now.distanceKm);
      const margin = now.hasRevenue ? now.revenue.minus(total) : null;

      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        displayName:
          [vehicle.brand, vehicle.model].filter(Boolean).join(' ').trim() || vehicle.internalCode,
        fuel: now.fuel,
        service: now.service,
        fines: now.fines,
        total,
        revenue: now.hasRevenue ? now.revenue : null,
        margin,
        distanceKm: now.distanceKm,
        costPerKm: perKm,
        previousTotal,
        // Onceki donem SIFIRSA yuzde uretilmiyor.
        changePercent: previousTotal.isZero()
          ? null
          : total.minus(previousTotal).dividedBy(previousTotal).times(100),
        dataQuality: dataQualityFlags({
          distanceKm: now.distanceKm,
          total,
          hasRevenue: now.hasRevenue,
        }),
      };
    });

    const sorted = sortVehicles(ranked, query.sort ?? 'total');
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 100);
    const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

    // --- Filo toplamlari ---
    const totals = {
      fuel: current.total.fuel,
      service: current.total.service,
      fines: current.total.fines,
      revenue: current.total.revenue,
    };
    const grandTotal = totals.fuel.plus(totals.service).plus(totals.fines);
    const previousTotals = {
      fuel: previous.total.fuel,
      service: previous.total.service,
      fines: previous.total.fines,
      revenue: previous.total.revenue,
    };
    const previousGrandTotal = previousTotals.fuel
      .plus(previousTotals.service)
      .plus(previousTotals.fines);

    // Filo cost/km AGIRLIKLI: arac oranlarinin basit ortalamasi degil.
    const fleetPerKm = fleetCostPerKm(ranked);
    const previousFleetPerKm = fleetCostPerKm(
      vehicles.map((vehicle) => {
        const before = previous.byVehicle.get(vehicle.id) ?? emptyTotals();
        return {
          total: before.fuel.plus(before.service).plus(before.fines),
          distanceKm: before.distanceKm,
        };
      }),
    );

    const hasRevenue = current.total.hasRevenue || previous.total.hasRevenue;

    return {
      baseCurrency,
      period: { from: from.toISOString(), to: to.toISOString(), timezone: timeZone },
      comparisonPeriod: {
        from: comparisonFrom.toISOString(),
        to: comparisonTo.toISOString(),
      },
      summary: {
        totalCost: compare(grandTotal, previousGrandTotal),
        fuelCost: compare(totals.fuel, previousTotals.fuel),
        serviceCost: compare(totals.service, previousTotals.service),
        fineCost: compare(totals.fines, previousTotals.fines),
        revenue: hasRevenue ? compare(totals.revenue, previousTotals.revenue) : null,
        margin: hasRevenue
          ? compare(totals.revenue.minus(grandTotal), previousTotals.revenue.minus(previousGrandTotal))
          : null,
        costPerKm: this.perKmComparison(fleetPerKm, previousFleetPerKm),
        distanceKm: compareDistance(current.total.distanceKm, previous.total.distanceKm),
        /** Toplam maliyete DAHIL DEGIL — yalnizca adet. */
        pendingReceiptCount,
      },
      monthlySeries,
      composition: {
        fuel: money(totals.fuel),
        service: money(totals.service),
        fines: money(totals.fines),
        total: money(grandTotal),
      },
      vehicleRanking: pageRows.map((row) => ({
        vehicleId: row.vehicleId,
        plateNumber: row.plateNumber,
        displayName: row.displayName,
        fuel: money(row.fuel),
        service: money(row.service),
        fines: money(row.fines),
        total: money(row.total),
        revenue: row.revenue === null ? null : money(row.revenue),
        margin: row.margin === null ? null : money(row.margin),
        distanceKm: distance(row.distanceKm),
        costPerKm: row.costPerKm === null ? null : row.costPerKm.toFixed(4),
        previousTotal: money(row.previousTotal),
        changePercent: row.changePercent === null ? null : row.changePercent.toFixed(1),
        dataQuality: row.dataQuality,
      })),
      pagination: {
        page,
        pageSize,
        total: sorted.length,
        totalPages: Math.max(1, Math.ceil(sorted.length / pageSize)),
      },
      /** Temel para birimi disindaki onaylanmis fisler — toplama KATILMADI. */
      unconvertedByCurrency: [...current.unconverted.entries()]
        .map(([currency, bucket]) => ({
          currency,
          fuelAmount: money(bucket.amount),
          entryCount: bucket.count,
        }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
      /**
       * Maliyet/km HANGI kume uzerinden hesaplandi.
       *
       * Oran, mesafesi olmayan araclarin maliyetini de disarida birakiyor —
       * yani filonun tamamini temsil ETMIYOR. Bunu soylemeden "0,06 EUR/km"
       * yazmak yonetimi yanlis bir kesinlige ikna eder.
       */
      costPerKmCoverage: costPerKmCoverage(ranked),
      dataQuality: {
        vehiclesWithoutDistance: ranked.filter((row) => row.dataQuality.includes('no_distance'))
          .length,
        vehiclesWithoutCosts: ranked.filter((row) => row.dataQuality.includes('no_costs')).length,
        excludedUnconvertedEntries: [...current.unconverted.values()].reduce(
          (sum, bucket) => sum + bucket.count,
          0,
        ),
        notes: this.buildNotes(pendingReceiptCount, ranked, current.unconverted),
      },
    };
  }

  /** Maliyet/km karsilastirmasi — para degil oran, dort haneli. */
  private perKmComparison(
    current: Prisma.Decimal | null,
    previous: Prisma.Decimal | null,
  ): MetricComparison | null {
    if (current === null && previous === null) {
      return null;
    }
    const cur = current ?? ZERO;
    const prev = previous ?? ZERO;
    const absolute = cur.minus(prev);
    return {
      current: cur.toFixed(4),
      previous: prev.toFixed(4),
      absoluteChange: absolute.toFixed(4),
      percentChange: prev.isZero() ? null : absolute.dividedBy(prev).times(100).toFixed(1),
    };
  }

  /**
   * Deterministik notlar — AI DEGIL.
   *
   * Her not tek bir sayilabilir gercege dayaniyor; korelasyon neden-sonuc gibi
   * sunulmuyor ve eksik veri "sorun yok" diye gizlenmiyor.
   */
  private buildNotes(
    pendingReceiptCount: number,
    ranked: Array<{ dataQuality: string[] }>,
    unconverted: Map<string, { count: number }>,
  ): string[] {
    const notes: string[] = [];
    if (pendingReceiptCount > 0) notes.push('pending_receipts');
    if (ranked.some((row) => row.dataQuality.includes('no_distance'))) notes.push('missing_distance');
    if (unconverted.size > 0) notes.push('unconverted_entries');
    return notes;
  }

  /**
   * Bir donemin butun kaynaklarini TEK GECISTE toplar.
   *
   * Kaynak basina bir sorgu; arac basina sorgu YOK. Satirlar cekilip hem araca
   * hem aya gore kovalaniyor — iki ayri sorgu seti acmak ayni veriyi iki kez
   * okumak olurdu.
   */
  private async collect(
    from: Date,
    to: Date,
    baseCurrency: string,
    vehicleFilter: { vehicleId?: string },
    timeZone: string,
  ) {
    const [fuelRows, serviceRows, fineRows, tripRows, assignmentRows] = await Promise.all([
      this.prisma.fleetFuelEntry.findMany({
        where: effectiveFuelCostWhere({
          ...vehicleFilter,
          enteredAt: { gte: from, lt: to },
        }),
        select: { vehicleId: true, enteredAt: true, totalCost: true, currency: true },
      }),
      this.prisma.serviceRecord.findMany({
        where: { ...vehicleFilter, date: { gte: from, lt: to } },
        select: { vehicleId: true, date: true, costAmount: true, currency: true },
      }),
      this.prisma.fine.findMany({
        where: { ...vehicleFilter, violationAt: { gte: from, lt: to } },
        select: { vehicleId: true, violationAt: true, amount: true, currency: true },
      }),
      // GERCEKLESEN mesafe: kapanmis seferler. `Tour.plannedDistanceKm`
      // PLANLANAN mesafedir ve buraya GIRMEZ (bkz. route-deviation.service).
      this.prisma.fleetTrip.findMany({
        where: {
          ...vehicleFilter,
          status: FleetTripStatus.closed,
          startedAt: { gte: from, lt: to },
        },
        select: { vehicleId: true, startedAt: true, distanceKm: true },
      }),
      this.prisma.assignment.findMany({
        where: {
          ...vehicleFilter,
          workDate: { gte: from, lt: to },
          status: { in: ['completed', 'in_progress'] },
        },
        select: {
          vehicleId: true,
          workDate: true,
          expectedDailyRevenue: true,
          currency: true,
          company: { select: { defaultDailyRevenue: true } },
        },
      }),
    ]);

    const byVehicle = new Map<string, VehicleTotals>();
    const byMonth = new Map<string, VehicleTotals>();
    const unconverted = new Map<string, { amount: Prisma.Decimal; count: number }>();
    const total = emptyTotals();

    const bucketFor = (map: Map<string, VehicleTotals>, key: string): VehicleTotals => {
      let entry = map.get(key);
      if (!entry) {
        entry = emptyTotals();
        map.set(key, entry);
      }
      return entry;
    };

    const addMoney = (
      field: 'fuel' | 'service' | 'fines' | 'revenue',
      vehicleId: string,
      at: Date,
      amount: Prisma.Decimal,
    ) => {
      const vehicle = bucketFor(byVehicle, vehicleId);
      const month = bucketFor(byMonth, bucketKeyFor(at, timeZone));
      vehicle[field] = vehicle[field].plus(amount);
      month[field] = month[field].plus(amount);
      total[field] = total[field].plus(amount);
      if (field === 'revenue') {
        vehicle.hasRevenue = true;
        month.hasRevenue = true;
        total.hasRevenue = true;
      }
    };

    for (const row of fuelRows) {
      const amount = row.totalCost ?? ZERO;
      if (!matchesBaseCurrency(row.currency, baseCurrency)) {
        // Farkli para birimi: toplama KATILMIYOR, silinmiyor, ayri duruyor.
        const currency = normalizeCurrency(row.currency) ?? baseCurrency;
        const bucket = unconverted.get(currency) ?? { amount: ZERO, count: 0 };
        bucket.amount = bucket.amount.plus(amount);
        bucket.count += 1;
        unconverted.set(currency, bucket);
        continue;
      }
      addMoney('fuel', row.vehicleId, row.enteredAt, amount);
    }

    for (const row of serviceRows) {
      if (!matchesBaseCurrency(row.currency, baseCurrency)) continue;
      addMoney('service', row.vehicleId, row.date, row.costAmount);
    }

    for (const row of fineRows) {
      if (!matchesBaseCurrency(row.currency, baseCurrency)) continue;
      addMoney('fines', row.vehicleId, row.violationAt, row.amount ?? ZERO);
    }

    for (const row of assignmentRows) {
      const revenue = row.expectedDailyRevenue ?? row.company?.defaultDailyRevenue ?? null;
      if (revenue === null) continue;
      // GELIR DE KORUNUYOR: yakit/servis/ceza icin var olan kural buraya da
      // uygulaniyor. Onceden gelir KOSULSUZ ekleniyordu ve TRY tabanli bir
      // gorev EUR toplamina sessizce giriyordu.
      if (!matchesBaseCurrency(row.currency, baseCurrency)) {
        const currency = normalizeCurrency(row.currency) ?? baseCurrency;
        const bucket = unconverted.get(currency) ?? { amount: ZERO, count: 0 };
        bucket.amount = bucket.amount.plus(revenue);
        bucket.count += 1;
        unconverted.set(currency, bucket);
        continue;
      }
      addMoney('revenue', row.vehicleId, row.workDate, revenue);
    }

    // Mesafe AYRI: null ile 0 farkli seyler, `plus` ile toplanamaz.
    for (const row of tripRows) {
      if (row.distanceKm === null) continue;
      const vehicle = bucketFor(byVehicle, row.vehicleId);
      const month = bucketFor(byMonth, bucketKeyFor(row.startedAt, timeZone));
      vehicle.distanceKm = (vehicle.distanceKm ?? ZERO).plus(row.distanceKm);
      month.distanceKm = (month.distanceKm ?? ZERO).plus(row.distanceKm);
      total.distanceKm = (total.distanceKm ?? ZERO).plus(row.distanceKm);
    }

    return { byVehicle, byMonth, unconverted, total };
  }
}
