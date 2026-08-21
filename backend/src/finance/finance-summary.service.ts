import { BadRequestException, Injectable } from '@nestjs/common';
import { FuelEntryWorkflowStatus, Prisma } from '@prisma/client';
import { ActualRevenueService } from '../common/finance/actual-revenue.service';
import {
  disputedFineWhere,
  effectiveFineCostWhere,
  effectiveServiceCostWhere,
  pendingServiceCostWhere,
} from '../common/finance/recognition';
import {
  DEFAULT_BASE_CURRENCY,
  matchesBaseCurrency,
  normalizeCurrency,
} from '../common/utils/currency';
import { resolveTimeZone } from '../common/utils/timezone';
import { ZERO, money, resolvePeriod } from '../dashboard/core/cost-dashboard.util';
import { effectiveFuelCostWhere } from '../fleet/fuel-receipts/core/effective-fuel-cost';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import type { FinanceSummaryQueryDto } from './dto/finance-summary.query';

/**
 * Listelerde gosterilen EN FAZLA satir sayisi.
 *
 * Kirpma SESSIZ DEGIL: her blok kendi `totalCount`unu de donuyor, yani ekran
 * "12 kayittan 12'si" ya da "180 kayittan 50'si" diyebiliyor. Sinirsiz liste
 * tek istekte butun gecmisi tarayan bir uc demek olurdu.
 */
const MAX_LIST_ITEMS = 50;

/** Tutar + kayit SAYISI birlikte: `0,00` ile "veri yok" ayirt edilebilsin. */
export interface FinanceAmount {
  amount: string;
  /** 0 ise ekran "veri yok" yazar; `0,00` YAZMAZ. */
  count: number;
}

export interface FinanceSummary {
  baseCurrency: string;
  period: { from: string; to: string; timezone: string };
  revenue: {
    /**
     * GERCEK gelir — kesilmis faturalardan. Fatura hic yoksa `null`:
     * "0,00 ciro" ile "ciro olculemedi" ayni sey degil.
     */
    actual: FinanceAmount | null;
    /** TAHMIN — gorev planindan. `actual` ile ASLA toplanmaz. */
    estimated: FinanceAmount;
  };
  cost: {
    fuel: FinanceAmount;
    service: FinanceAmount;
    fines: FinanceAmount;
    /** YALNIZCA onayli gercek gider. */
    total: FinanceAmount;
  };
  /** Gercek gelir - onayli gider. Fatura yoksa `null`. */
  margin: string | null;
  pendingServiceRecords: FinanceListBlock<FinanceServiceItem>;
  fuelReceipts: FinanceListBlock<FinanceFuelItem>;
  disputedFines: FinanceListBlock<FinanceFineItem>;
  /** Toplanamayan para birimleri — silinmediler, ayri duruyorlar. */
  unconvertedByCurrency: Array<{ currency: string; amount: string; entryCount: number }>;
}

export interface FinanceListBlock<T> {
  totalAmount: string;
  totalCount: number;
  /** Listelenen satirlar. `totalCount`tan az olabilir — kirpma GORUNUR. */
  items: T[];
}

export interface FinanceServiceItem {
  id: string;
  date: string;
  vehicleId: string;
  vehiclePlate: string;
  serviceType: string;
  repairCompany: string;
  amount: string;
  currency: string;
  /** Temel para birimi disindaysa toplama girmedi — ekran bunu isaretler. */
  inBaseCurrency: boolean;
}

export interface FinanceFuelItem {
  id: string;
  enteredAt: string;
  vehicleId: string;
  vehiclePlate: string;
  stationName: string | null;
  amount: string | null;
  currency: string;
  workflowStatus: FuelEntryWorkflowStatus;
}

export interface FinanceFineItem {
  id: string;
  violationAt: string;
  vehicleId: string;
  vehiclePlate: string;
  violationType: string;
  amount: string | null;
  currency: string;
  inBaseCurrency: boolean;
}

/**
 * FINANCE MERKEZI OZETI (Faz 18C).
 *
 * NEDEN TEK UC: ekran yedi bloktan olusuyor ve hepsi AYNI donemi, AYNI temel
 * para birimini ve AYNI tanima kurallarini kullanmak zorunda. Yedi ayri uctan
 * okusaydik iki istek arasinda donem kayabilir, biri `widerspruch` filtresini
 * unutabilir ve ekranin ust yarisi ile alt yarisi birbirini tutmazdi.
 *
 * YENI HESAP YOK: filtreler Faz 18B'nin canonical `where` yardimcilarindan
 * geliyor (`effectiveServiceCostWhere`, `effectiveFineCostWhere`,
 * `disputedFineWhere`, `effectiveFuelCostWhere`) ve gercek gelir
 * `ActualRevenueService`ten. Bu uc, var olan kurallarin OKUYUCUSU — ikinci bir
 * dogruluk kaynagi degil.
 */
@Injectable()
export class FinanceSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actualRevenue: ActualRevenueService,
  ) {}

  async getSummary(query: FinanceSummaryQueryDto): Promise<FinanceSummary> {
    const tenantId = TenantContext.getTenantId();
    const tenant = tenantId
      ? await this.prisma.tenant.findFirst({
          where: { id: tenantId },
          select: { baseCurrency: true, timezone: true },
        })
      : null;
    const baseCurrency = normalizeCurrency(tenant?.baseCurrency) ?? DEFAULT_BASE_CURRENCY;
    const timeZone = resolveTimeZone(tenant?.timezone);

    const resolved = resolvePeriod(query, new Date(), timeZone);
    if (!resolved.ok) {
      // Ham hata degil makine-okunur kod: arayuz kullanici metnine cevirir.
      throw new BadRequestException({ code: `finance_${resolved.error}` });
    }
    const { from, to } = resolved.period;

    const vehicleSelect = { select: { id: true, plateNumber: true } };

    const [
      fuelRows,
      serviceRows,
      fineRows,
      assignmentRows,
      pendingServiceRows,
      pendingServiceAllRows,
      pendingFuelRows,
      pendingFuelAllRows,
      disputedFineRows,
      disputedFineAllRows,
      actualRevenue,
    ] = await Promise.all([
      this.prisma.fleetFuelEntry.findMany({
        where: effectiveFuelCostWhere({ enteredAt: { gte: from, lt: to } }),
        select: { totalCost: true, currency: true },
      }),
      this.prisma.serviceRecord.findMany({
        where: effectiveServiceCostWhere({ date: { gte: from, lt: to } }),
        select: { costAmount: true, currency: true },
      }),
      this.prisma.fine.findMany({
        where: effectiveFineCostWhere({ violationAt: { gte: from, lt: to } }),
        select: { amount: true, currency: true },
      }),
      this.prisma.assignment.findMany({
        where: {
          workDate: { gte: from, lt: to },
          status: { in: ['completed', 'in_progress'] },
        },
        select: {
          expectedDailyRevenue: true,
          currency: true,
          company: { select: { defaultDailyRevenue: true } },
        },
      }),
      // --- Karar bekleyen isler ---
      this.prisma.serviceRecord.findMany({
        where: pendingServiceCostWhere({ date: { gte: from, lt: to } }),
        orderBy: { date: 'asc' },
        take: MAX_LIST_ITEMS,
        select: {
          id: true,
          date: true,
          serviceType: true,
          repairCompany: true,
          costAmount: true,
          currency: true,
          vehicle: vehicleSelect,
        },
      }),
      /**
       * TOPLAM, LISTEDEN AYRI OKUNUYOR.
       *
       * Liste `take` ile kirpiliyor; toplami kirpilmis satirlardan
       * hesaplasaydik baslik "60 kayit · 500 EUR" derdi ve o 500 yalnizca
       * ilk 50 kaydin toplami olurdu — sayisi dogru, tutari yanlis bir
       * satir. Bu sorgu yalnizca tutar ve para birimi cekiyor.
       */
      this.prisma.serviceRecord.findMany({
        where: pendingServiceCostWhere({ date: { gte: from, lt: to } }),
        select: { costAmount: true, currency: true },
      }),
      this.prisma.fleetFuelEntry.findMany({
        where: {
          enteredAt: { gte: from, lt: to },
          workflowStatus: {
            in: [FuelEntryWorkflowStatus.driver_review, FuelEntryWorkflowStatus.submitted],
          },
        },
        // EN UZUN BEKLEYEN ONCE: kuyrugu tarih sirasiyla eritmek, en eski
        // fisin listenin dibinde unutulmasindan iyidir.
        orderBy: { enteredAt: 'asc' },
        take: MAX_LIST_ITEMS,
        select: {
          id: true,
          enteredAt: true,
          stationName: true,
          totalCost: true,
          currency: true,
          workflowStatus: true,
          vehicle: vehicleSelect,
        },
      }),
      // Toplam LISTEDEN AYRI — bkz. bekleyen servis kaydi.
      this.prisma.fleetFuelEntry.findMany({
        where: {
          enteredAt: { gte: from, lt: to },
          workflowStatus: {
            in: [FuelEntryWorkflowStatus.driver_review, FuelEntryWorkflowStatus.submitted],
          },
        },
        select: { totalCost: true, currency: true },
      }),
      this.prisma.fine.findMany({
        where: disputedFineWhere({ violationAt: { gte: from, lt: to } }),
        orderBy: { violationAt: 'asc' },
        take: MAX_LIST_ITEMS,
        select: {
          id: true,
          violationAt: true,
          violationType: true,
          amount: true,
          currency: true,
          vehicle: vehicleSelect,
        },
      }),
      // Toplam LISTEDEN AYRI — bkz. bekleyen servis kaydi.
      this.prisma.fine.findMany({
        where: disputedFineWhere({ violationAt: { gte: from, lt: to } }),
        select: { amount: true, currency: true },
      }),
      this.actualRevenue.collect(from, to, baseCurrency),
    ]);

    /**
     * Temel para birimi disindaki kayit toplama GIRMIYOR ve SESSIZCE de
     * dusmuyor: hangi para biriminde kac kayit disarida kaldigi sayiliyor.
     * Kur uydurmak, raporu yanlis yapmakla kalmaz — yanlis oldugunu da gizler.
     */
    const unconverted = new Map<string, { amount: Prisma.Decimal; count: number }>();
    const inBase = (currency: string | null, amount: Prisma.Decimal): boolean => {
      if (matchesBaseCurrency(currency, baseCurrency)) return true;
      const code = normalizeCurrency(currency) ?? baseCurrency;
      const bucket = unconverted.get(code) ?? { amount: ZERO, count: 0 };
      bucket.amount = bucket.amount.plus(amount);
      bucket.count += 1;
      unconverted.set(code, bucket);
      return false;
    };

    const sum = (
      rows: Array<{ currency: string | null; value: Prisma.Decimal | null }>,
    ): FinanceAmount => {
      let total = ZERO;
      let count = 0;
      for (const row of rows) {
        const value = row.value ?? ZERO;
        if (!inBase(row.currency, value)) continue;
        total = total.plus(value);
        count += 1;
      }
      return { amount: money(total), count };
    };

    const fuel = sum(fuelRows.map((row) => ({ currency: row.currency, value: row.totalCost })));
    const service = sum(
      serviceRows.map((row) => ({ currency: row.currency, value: row.costAmount })),
    );
    const fines = sum(fineRows.map((row) => ({ currency: row.currency, value: row.amount })));

    const totalCost = new Prisma.Decimal(fuel.amount)
      .plus(new Prisma.Decimal(service.amount))
      .plus(new Prisma.Decimal(fines.amount));

    const estimated = sum(
      assignmentRows.map((row) => ({
        currency: row.currency,
        value: row.expectedDailyRevenue ?? row.company?.defaultDailyRevenue ?? null,
      })),
    );

    /**
     * Bekleyen ve ihtilafli tutarlar da AYNI para birimi kapisindan geciyor
     * ve KIRPILMAMIS kumeden hesaplaniyor.
     *
     * `unconverted` kovasina da bunlar giriyor: onay bekleyen ya da itiraz
     * edilmis bir TRY kaydinin "toplanmadi" listesinde gorunmemesi, o
     * kaydin hic var olmadigi izlenimini verirdi.
     */
    const pendingServiceTotal = sum(
      pendingServiceAllRows.map((row) => ({ currency: row.currency, value: row.costAmount })),
    );
    const disputedFineTotal = sum(
      disputedFineAllRows.map((row) => ({ currency: row.currency, value: row.amount })),
    );

    for (const entry of actualRevenue.unconvertedByCurrency) {
      const bucket = unconverted.get(entry.currency) ?? { amount: ZERO, count: 0 };
      bucket.amount = bucket.amount.plus(new Prisma.Decimal(entry.amount));
      bucket.count += entry.count;
      unconverted.set(entry.currency, bucket);
    }

    /**
     * Fatura HIC YOKSA `null`.
     *
     * `0,00` yazmak "bu donemde hic ciro olmadi" demektir; oysa dogru cevap
     * cogu zaman "henuz fatura kesilmedi". Ikisi ayni ekranda ayirt
     * edilemezse yonetim yanlis bir sonuca varir.
     */
    const actualRows = actualRevenue.rows;
    const actualTotal = actualRows.reduce(
      (acc, row) => acc.plus(new Prisma.Decimal(row.amount)),
      ZERO,
    );
    const actual: FinanceAmount | null =
      actualRows.length === 0 ? null : { amount: money(actualTotal), count: actualRows.length };

    return {
      baseCurrency,
      period: { from: from.toISOString(), to: to.toISOString(), timezone: timeZone },
      revenue: { actual, estimated },
      cost: {
        fuel,
        service,
        fines,
        total: { amount: money(totalCost), count: fuel.count + service.count + fines.count },
      },
      // Marj GERCEK gelirden; fatura yoksa hesaplanMIYOR.
      margin: actual === null ? null : money(new Prisma.Decimal(actual.amount).minus(totalCost)),
      pendingServiceRecords: {
        totalAmount: pendingServiceTotal.amount,
        totalCount: pendingServiceAllRows.length,
        items: pendingServiceRows.map((row) => ({
          id: row.id,
          date: row.date.toISOString(),
          vehicleId: row.vehicle.id,
          vehiclePlate: row.vehicle.plateNumber,
          serviceType: row.serviceType,
          repairCompany: row.repairCompany,
          amount: row.costAmount.toFixed(2),
          currency: row.currency,
          inBaseCurrency: matchesBaseCurrency(row.currency, baseCurrency),
        })),
      },
      fuelReceipts: {
        // Bekleyen fis tutari TOPLAMA girmiyor; burada yalnizca "gorunmeyen
        // ne var" sorusunu cevaplamak icin duruyor.
        totalAmount: money(
          pendingFuelAllRows.reduce((acc, row) => acc.plus(row.totalCost ?? ZERO), ZERO),
        ),
        totalCount: pendingFuelAllRows.length,
        items: pendingFuelRows.map((row) => ({
          id: row.id,
          enteredAt: row.enteredAt.toISOString(),
          vehicleId: row.vehicle.id,
          vehiclePlate: row.vehicle.plateNumber,
          stationName: row.stationName,
          amount: row.totalCost === null ? null : row.totalCost.toFixed(2),
          currency: row.currency,
          workflowStatus: row.workflowStatus,
        })),
      },
      disputedFines: {
        totalAmount: disputedFineTotal.amount,
        totalCount: disputedFineAllRows.length,
        items: disputedFineRows.map((row) => ({
          id: row.id,
          violationAt: row.violationAt.toISOString(),
          vehicleId: row.vehicle.id,
          vehiclePlate: row.vehicle.plateNumber,
          violationType: row.violationType,
          amount: row.amount === null ? null : row.amount.toFixed(2),
          currency: row.currency,
          inBaseCurrency: matchesBaseCurrency(row.currency, baseCurrency),
        })),
      },
      unconvertedByCurrency: [...unconverted.entries()]
        .map(([currency, bucket]) => ({
          currency,
          amount: money(bucket.amount),
          entryCount: bucket.count,
        }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
    };
  }
}
