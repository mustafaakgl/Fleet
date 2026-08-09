import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PayrollEntryKind, PayrollPeriodStatus, Prisma, TachoWorkState } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  foldWorkTimeEvents,
  type FoldableWorkTimeEvent,
  type WorkInterval,
} from '../work-time/core/work-time-fold.util';
import type { CalendarDayInput } from './core/day-type-mapping';
import {
  buildPayrollDays,
  buildPayrollEntryTotals,
  localDatesOfMonth,
  type PayrollDayDraft,
} from './core/payroll-aggregate.util';
import {
  compareBreakWithTacho,
  intersectIntervals,
  TACHO_BREAK_MISMATCH_ANOMALY,
} from './core/tacho-comparison.util';
import {
  bucketWorkIntervals,
  DEFAULT_PAYROLL_TIME_ZONE,
  localDateOf,
  type DayBuckets,
} from './core/time-buckets.util';
import { PayrollSettingsService } from './payroll-settings.service';

/**
 * Donem hesabi ve yasam dongusu (Faz 4b).
 *
 * `approved` DONDURMA NOKTASI: gun satirlari orada kesinlesir ve yeniden
 * hesaplama kapanir. Sonradan gelen cevrimdisi olay bu donemi degistiremez;
 * duzeltme sonraki doneme kalem olarak yazilacak (Ruckrechnung, 4c).
 */

/** Gece vardiyasi ay sinirini asabildigi icin sorgu iki gun genis tutuluyor. */
const BOUNDARY_DAYS = 1;

const EDITABLE_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.draft,
  PayrollPeriodStatus.review,
];

type DriverBucketSet = {
  buckets: Map<string, DayBuckets>;
  breakMinutesByDate: Map<string, number>;
  anomaliesByDate: Map<string, string[]>;
  /**
   * Takografin VARDIYA PENCERESINE dusen REST dakikalari. Anahtar yoksa o gun
   * icin takograf verisi yok demektir — sifirla karistirilmamali.
   */
  tachoRestByDate: Map<string, number>;
};

function assertMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException({ code: 'invalid_year' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException({ code: 'invalid_month' });
  }
}

/** "YYYY-MM-DD" → UTC gece yarisi. Gun satirinin anahtar tarihi. */
function toUtcDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

function addMinutes(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

@Injectable()
export class PayrollPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly settings: PayrollSettingsService,
  ) {}

  async listPeriods() {
    return this.prisma.payrollPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { entries: true, days: true } } },
    });
  }

  async getOrCreatePeriod(tenantId: string, year: number, month: number) {
    assertMonth(year, month);
    const existing = await this.prisma.payrollPeriod.findFirst({ where: { year, month } });
    if (existing) return existing;
    return this.prisma.payrollPeriod.create({ data: { tenantId, year, month } });
  }

  async getPeriod(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        entries: {
          include: {
            driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          },
          orderBy: { driver: { lastName: 'asc' } },
        },
      },
    });
    if (!period) throw new NotFoundException({ code: 'payroll_period_not_found' });

    // Mola suresi KALEMDE YOK cunku bordroya girmiyor (calisilan sure zaten
    // molalar dusulmus halde). Ama Zeiterfassung ekrani onu gostermek zorunda,
    // o yuzden gun satirlarindan burada toplaniyor — ikinci bir sutun
    // saklamaktansa okurken toplamak, iki rakamin birbirinden kaymasini
    // imkansiz kiliyor.
    const breakTotals = await this.prisma.payrollDay.groupBy({
      by: ['driverId'],
      where: { periodId: id },
      _sum: { breakMinutes: true },
    });
    const breakByDriver = new Map(
      breakTotals.map((row) => [row.driverId, row._sum.breakMinutes ?? 0]),
    );

    return {
      ...period,
      entries: period.entries.map((entry) => ({
        ...entry,
        breakMinutes: breakByDriver.get(entry.driverId) ?? 0,
      })),
    };
  }

  /** Faz 3'un surucu detay ekrani: gun gun dokum. */
  async getPeriodDriverDays(periodId: string, driverId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException({ code: 'payroll_period_not_found' });

    return this.prisma.payrollDay.findMany({
      where: { periodId, driverId },
      orderBy: { date: 'asc' },
    });
  }

  // ------------------------------------------------------------- hesaplama

  /**
   * Donemi olaylardan yeniden hesaplar.
   *
   * Sil-ve-yaz: gun satirlari ve kalemler tek islemde bastan uretiliyor.
   * Artimli guncelleme denenmedi cunku gec gelen bir cevrimdisi olay gunun
   * ORTASINI degistirebiliyor ve kismi guncelleme bunu kacirirdi.
   */
  async recomputePeriod(id: string, actorUserId: string, asOf: Date = new Date()) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException({ code: 'payroll_period_not_found' });
    if (!EDITABLE_STATUSES.includes(period.status)) {
      throw new ConflictException({ code: 'payroll_period_frozen' });
    }

    const { dayRows, entryRows } = await this.computePeriod(period, asOf);

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollDay.deleteMany({ where: { periodId: period.id } });
      await tx.payrollEntry.deleteMany({
        where: { periodId: period.id, kind: PayrollEntryKind.regular },
      });
      if (dayRows.length > 0) await tx.payrollDay.createMany({ data: dayRows });
      if (entryRows.length > 0) await tx.payrollEntry.createMany({ data: entryRows });
      await tx.payrollPeriod.update({ where: { id: period.id }, data: { updatedAt: new Date() } });
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.period_recomputed',
      entityType: 'payroll_period',
      entityId: period.id,
      summary: `Payroll period ${period.year}-${String(period.month).padStart(2, '0')} recomputed`,
      metadata: { driverCount: entryRows.length, dayCount: dayRows.length },
    });

    return this.getPeriod(period.id);
  }

  /**
   * Donemi hesaplar ama HICBIR SEY YAZMAZ.
   *
   * Ayrilmasinin sebebi Ruckrechnung: kilitli bir donemin "bugun olsa ne
   * olurdu" hali, o donemi degistirmeden hesaplanabilmeli ki fark duzeltme
   * kalemine cevrilebilsin.
   */
  async computePeriod(
    period: { id: string; tenantId: string; year: number; month: number },
    asOf: Date,
  ): Promise<{
    dayRows: Prisma.PayrollDayCreateManyInput[];
    entryRows: Prisma.PayrollEntryCreateManyInput[];
  }> {
    const localDates = localDatesOfMonth(period.year, period.month);
    const monthStart = toUtcDate(localDates[0]);
    const monthEnd = toUtcDate(localDates[localDates.length - 1]);
    // Gece vardiyasi ayin ilk/son gunune tasabilir; sorgu iki gun genis.
    const queryFrom = new Date(monthStart);
    queryFrom.setUTCDate(queryFrom.getUTCDate() - BOUNDARY_DAYS);
    const queryTo = new Date(monthEnd);
    queryTo.setUTCDate(queryTo.getUTCDate() + BOUNDARY_DAYS + 1);

    const [profile, holidays, rules, sessions, calendarRows, tachoRest] = await Promise.all([
      this.settings.getTenantProfile(),
      this.prisma.publicHoliday.findMany({
        where: { date: { gte: monthStart, lte: monthEnd } },
        select: { date: true },
      }),
      this.settings.loadDayTypeRules(period.tenantId),
      this.prisma.workSession.findMany({
        where: { startedAt: { gte: queryFrom, lt: queryTo } },
        select: {
          id: true,
          driverId: true,
          timeEvents: {
            select: {
              id: true,
              type: true,
              occurredAt: true,
              createdAt: true,
              supersedesEventId: true,
            },
          },
        },
      }),
      this.prisma.calendarEvent.findMany({
        where: { date: { gte: queryFrom, lt: queryTo } },
        select: { driverId: true, date: true, status: true, uiStatus: true },
      }),
      // Yalnizca REST: `available` (Bereitschaft) mola degil, surucu emre
      // amade bekliyor. Kartsiz kayitlarin driverId'si bos oldugu icin
      // eslestirilemez, disarida kaliyorlar.
      this.prisma.tachoActivity.findMany({
        where: {
          workState: TachoWorkState.rest,
          driverId: { not: null },
          startedAt: { lt: queryTo },
          endedAt: { gt: queryFrom },
        },
        select: { driverId: true, startedAt: true, endedAt: true },
      }),
    ]);

    const bucketOptions = {
      timeZone: DEFAULT_PAYROLL_TIME_ZONE,
      night: {
        startMinute: profile?.nightWindowStartMinute ?? 1_200,
        endMinute: profile?.nightWindowEndMinute ?? 360,
      },
      nightCore: {
        startMinute: profile?.nightCoreStartMinute ?? 0,
        endMinute: profile?.nightCoreEndMinute ?? 240,
      },
      holidayDates: new Set(holidays.map((row) => localDateOf(row.date))),
    };

    // Takograf araliklari surucu bazinda toplanıyor; her vardiya kendi
    // penceresiyle kesistirecek.
    const tachoByDriver = new Map<string, WorkInterval[]>();
    for (const row of tachoRest) {
      if (!row.driverId) continue;
      const list = tachoByDriver.get(row.driverId) ?? [];
      list.push({ from: row.startedAt, to: row.endedAt });
      tachoByDriver.set(row.driverId, list);
    }

    const perDriver = new Map<string, DriverBucketSet>();
    for (const session of sessions) {
      const folded = foldWorkTimeEvents(toFoldable(session.timeEvents), asOf);
      const set =
        perDriver.get(session.driverId) ??
        {
          buckets: new Map(),
          breakMinutesByDate: new Map(),
          anomaliesByDate: new Map(),
          tachoRestByDate: new Map(),
        };

      mergeBuckets(set.buckets, bucketWorkIntervals(folded.workIntervals, bucketOptions));
      for (const day of bucketWorkIntervals(folded.breakIntervals, bucketOptions)) {
        addMinutes(set.breakMinutesByDate, day.localDate, day.workedMinutes);
      }

      // Takograf REST'i YALNIZCA vardiya penceresi icinde molayla
      // karsilastirilabilir: gunluk dinlenme (gece 11 saat) de REST olarak
      // yaziliyor ve pencere disini saymak her gunu devasa sapma gosterirdi.
      const shiftWindow =
        folded.startedAt !== null
          ? { from: folded.startedAt, to: folded.endedAt ?? asOf }
          : null;
      if (shiftWindow) {
        const restInWindow = intersectIntervals(
          tachoByDriver.get(session.driverId) ?? [],
          shiftWindow,
        );
        // Takograf verisi hic yoksa gun ANAHTARSIZ kaliyor; sifir yazmak
        // "surucu hic dinlenmedi" demek olurdu.
        if (restInWindow.length > 0) {
          for (const day of bucketWorkIntervals(restInWindow, bucketOptions)) {
            addMinutes(set.tachoRestByDate, day.localDate, day.workedMinutes);
          }
        }
      }

      // Anomali vardiyanin BASLADIGI gune yaziliyor: "cikis eksik" uyarisi
      // vardiyanin sahibi olan gunde gorunmeli, gece yarisini asmissa ertesi
      // gune tasinmamali.
      if (folded.anomalies.length > 0 && folded.startedAt) {
        const key = localDateOf(folded.startedAt, DEFAULT_PAYROLL_TIME_ZONE);
        set.anomaliesByDate.set(key, [
          ...(set.anomaliesByDate.get(key) ?? []),
          ...folded.anomalies,
        ]);
      }

      perDriver.set(session.driverId, set);
    }

    const calendarByDriver = new Map<string, Map<string, CalendarDayInput>>();
    for (const row of calendarRows) {
      const key = localDateOf(row.date, DEFAULT_PAYROLL_TIME_ZONE);
      const forDriver = calendarByDriver.get(row.driverId) ?? new Map<string, CalendarDayInput>();
      forDriver.set(key, { status: row.status, uiStatus: row.uiStatus });
      calendarByDriver.set(row.driverId, forDriver);
    }

    // Bordro profili olan HER surucu kaleme giriyor, o ay hic kaydi olmasa
    // bile. Yoksa verisi eksik kalan surucu listede hic gorunmez ve eksik veri
    // sessizce kaybolurdu; boyle Soll 168s / Ist 0s olarak goze batiyor.
    const driverProfiles = await this.prisma.driverPayrollProfile.findMany();
    const profileByDriver = new Map(driverProfiles.map((row) => [row.driverId, row]));
    const driverIds = [
      ...new Set([...profileByDriver.keys(), ...perDriver.keys(), ...calendarByDriver.keys()]),
    ];
    const defaultWeekly = profile?.defaultWeeklyTargetMinutes ?? 2_400;

    const dayRows: Prisma.PayrollDayCreateManyInput[] = [];
    const entryRows: Prisma.PayrollEntryCreateManyInput[] = [];

    for (const driverId of driverIds) {
      const set = perDriver.get(driverId);
      const days = buildPayrollDays({
        localDates,
        buckets: set?.buckets ?? new Map(),
        breakMinutesByDate: set?.breakMinutesByDate ?? new Map(),
        calendarByDate: calendarByDriver.get(driverId) ?? new Map(),
        holidayDates: bucketOptions.holidayDates,
        rules,
        anomaliesByDate: set?.anomaliesByDate ?? new Map(),
      });

      const driverProfile = profileByDriver.get(driverId);
      const totals = buildPayrollEntryTotals(days, {
        monthlyTargetMinutes: driverProfile?.monthlyTargetMinutes ?? null,
        weeklyTargetMinutes: driverProfile?.weeklyTargetMinutes ?? defaultWeekly,
      });

      // `unmappedDays` kalemde sutun degil, onay kapisinin gun satirlarindan
      // saydigi bir gosterge; toplamdan ayriliyor.
      const { unmappedDays: _unmappedDays, ...entryTotals } = totals;

      // Takograf karsilastirmasi gun satirlarina yaziliyor ama TOPLAMLARA
      // GIRMIYOR: bordronun kaynagi surucunun kendi kaydi, takograf yalnizca
      // dogrulama. Uyusmazlik anomali listesine ekleniyor, saati degistirmiyor.
      const tolerance = profile?.tachoBreakToleranceMinutes ?? 15;
      for (const day of days) {
        const comparison = compareBreakWithTacho({
          driverBreakMinutes: day.breakMinutes,
          workedMinutes: day.workedMinutes,
          tachoRestMinutes: set?.tachoRestByDate.get(day.localDate),
          toleranceMinutes: tolerance,
        });
        if (comparison?.mismatch) {
          day.anomalies.push(TACHO_BREAK_MISMATCH_ANOMALY);
        }
        dayRows.push(toDayRow(period.tenantId, period.id, driverId, day, comparison));
      }
      entryRows.push({
        tenantId: period.tenantId,
        periodId: period.id,
        driverId,
        kind: PayrollEntryKind.regular,
        ...entryTotals,
        driverProfileSnapshot: driverProfile
          ? {
              datevPersonnelNumber: driverProfile.datevPersonnelNumber,
              costCenter: driverProfile.costCenter,
              costUnit: driverProfile.costUnit,
              employmentType: driverProfile.employmentType,
              weeklyTargetMinutes: driverProfile.weeklyTargetMinutes,
              monthlyTargetMinutes: driverProfile.monthlyTargetMinutes,
            }
          : Prisma.DbNull,
      } as Prisma.PayrollEntryCreateManyInput);
    }

    return { dayRows, entryRows };
  }

  // -------------------------------------------------------- yasam dongusu

  async submitForReview(id: string, actorUserId: string) {
    const period = await this.requirePeriod(id);
    if (period.status !== PayrollPeriodStatus.draft) {
      throw new ConflictException({ code: 'payroll_period_not_draft' });
    }
    return this.setStatus(period.id, PayrollPeriodStatus.review, actorUserId, {});
  }

  async reopen(id: string, actorUserId: string) {
    const period = await this.requirePeriod(id);
    // Onaylanmis donem geri acilmiyor: onay dondurma noktasi ve zaten
    // Steuerberater'a giden rakamlar sessizce degismemeli.
    if (period.status !== PayrollPeriodStatus.review) {
      throw new ConflictException({ code: 'payroll_period_not_reopenable' });
    }
    return this.setStatus(period.id, PayrollPeriodStatus.draft, actorUserId, {});
  }

  /**
   * Donemi onaylar — gun satirlarinin dondugu an.
   *
   * Iki kapi var ve ikisi de sessiz yanlisi engellemek icin: gun tipi
   * cozulemeyen gun kalmis olamaz (eslenmemis takvim kodu) ve bordroya girecek
   * her surucunun personel numarasi olmali (yoksa DATEV satiri kimsiz kalir).
   */
  async approve(id: string, actorUserId: string) {
    const period = await this.requirePeriod(id);
    if (period.status !== PayrollPeriodStatus.review) {
      throw new ConflictException({ code: 'payroll_period_not_in_review' });
    }

    const [unmappedDays, entries] = await Promise.all([
      this.prisma.payrollDay.count({ where: { periodId: id, dayTypeSource: 'unmapped' } }),
      this.prisma.payrollEntry.findMany({
        where: { periodId: id, kind: PayrollEntryKind.regular },
        select: { driverId: true, driverProfileSnapshot: true },
      }),
    ]);

    if (unmappedDays > 0) {
      throw new ConflictException({ code: 'payroll_period_has_unmapped_days', unmappedDays });
    }
    const withoutProfile = entries.filter((entry) => entry.driverProfileSnapshot === null);
    if (withoutProfile.length > 0) {
      throw new ConflictException({
        code: 'payroll_period_driver_profile_missing',
        driverIds: withoutProfile.map((entry) => entry.driverId),
      });
    }

    return this.setStatus(period.id, PayrollPeriodStatus.approved, actorUserId, {
      approvedBy: { connect: { id: actorUserId } },
      approvedAt: new Date(),
    });
  }

  private async requirePeriod(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException({ code: 'payroll_period_not_found' });
    return period;
  }

  private async setStatus(
    id: string,
    status: PayrollPeriodStatus,
    actorUserId: string,
    extra: Prisma.PayrollPeriodUpdateInput,
  ) {
    const row = await this.prisma.payrollPeriod.update({
      where: { id },
      data: { status, ...extra },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: `payroll.period_${status}`,
      entityType: 'payroll_period',
      entityId: id,
      summary: `Payroll period moved to ${status}`,
    });

    return row;
  }
}

function toFoldable(
  events: ReadonlyArray<{
    id: string;
    type: string;
    occurredAt: Date;
    createdAt: Date;
    supersedesEventId: string | null;
  }>,
): FoldableWorkTimeEvent[] {
  return events.map((event) => ({
    id: event.id,
    type: event.type as FoldableWorkTimeEvent['type'],
    occurredAt: event.occurredAt,
    sequence: event.createdAt.getTime(),
    supersedesEventId: event.supersedesEventId,
  }));
}

/** Ayni surucunun birden fazla vardiyasi ayni gune dusebilir. */
function mergeBuckets(target: Map<string, DayBuckets>, source: readonly DayBuckets[]): void {
  for (const day of source) {
    const existing = target.get(day.localDate);
    if (!existing) {
      target.set(day.localDate, { ...day });
      continue;
    }
    existing.workedMinutes += day.workedMinutes;
    existing.nightMinutes += day.nightMinutes;
    existing.nightCoreMinutes += day.nightCoreMinutes;
    existing.sundayMinutes += day.sundayMinutes;
    existing.holidayMinutes += day.holidayMinutes;
  }
}

function toDayRow(
  tenantId: string,
  periodId: string,
  driverId: string,
  day: PayrollDayDraft,
  tacho: { tachoRestMinutes: number; deltaMinutes: number } | null,
): Prisma.PayrollDayCreateManyInput {
  return {
    tenantId,
    periodId,
    driverId,
    date: toUtcDate(day.localDate),
    dayType: day.dayType,
    dayTypeSource: day.dayTypeSource,
    calendarCode: day.calendarCode,
    paid: day.paid,
    workedMinutes: day.workedMinutes,
    breakMinutes: day.breakMinutes,
    nightMinutes: day.nightMinutes,
    nightCoreMinutes: day.nightCoreMinutes,
    sundayMinutes: day.sundayMinutes,
    holidayMinutes: day.holidayMinutes,
    // Karsilastirilamayan gun NULL kaliyor: takograf verisi yok demek.
    tachoRestMinutes: tacho?.tachoRestMinutes ?? null,
    tachoDeltaMinutes: tacho?.deltaMinutes ?? null,
    anomalies: day.anomalies.length > 0 ? day.anomalies : Prisma.DbNull,
  };
}

export type { WorkInterval };
