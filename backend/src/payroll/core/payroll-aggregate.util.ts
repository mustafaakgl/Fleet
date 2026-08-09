import { PayrollDayType, PayrollDayTypeSource } from '@prisma/client';
import { resolveCalendarDayType, type CalendarDayInput, type DayTypeRule } from './day-type-mapping';
import type { DayBuckets } from './time-buckets.util';

/**
 * Gun satirlarinin ve donem kaleminin hesabi. Saf: veritabani ve saat yok.
 *
 * Ayrik tutulmasinin sebebi bordronun en tartisilacak yeri burasi olmasi —
 * Soll'un hangi gunlerden olustugu, hangi devamsizligin kredilendigi. Servise
 * gomulseydi bu kurallar test edilebilir olmaktan cikardi.
 */

export type PayrollDayDraft = {
  localDate: string;
  dayType: PayrollDayType | null;
  dayTypeSource: PayrollDayTypeSource;
  calendarCode: string | null;
  paid: boolean;
  workedMinutes: number;
  breakMinutes: number;
  nightMinutes: number;
  nightCoreMinutes: number;
  sundayMinutes: number;
  holidayMinutes: number;
  anomalies: string[];
  /** Bu gun hedefe (Soll) sayiliyor mu. */
  countsTowardTarget: boolean;
};

export type BuildDaysInput = {
  /** Donemdeki butun yerel gunler, "YYYY-MM-DD" sirali. */
  localDates: readonly string[];
  buckets: ReadonlyMap<string, DayBuckets>;
  breakMinutesByDate: ReadonlyMap<string, number>;
  calendarByDate: ReadonlyMap<string, CalendarDayInput>;
  holidayDates: ReadonlySet<string>;
  rules: ReadonlyMap<string, DayTypeRule>;
  /** Zeiterfassung katlamasinin o gune dusen anomalileri. */
  anomaliesByDate: ReadonlyMap<string, readonly string[]>;
};

/** "YYYY-MM-DD" → haftanin gunu (0 = Pazar). Yerel gun oldugu icin UTC guvenli. */
function weekdayOf(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekend(localDate: string): boolean {
  const weekday = weekdayOf(localDate);
  return weekday === 0 || weekday === 6;
}

const EMPTY_BUCKETS = {
  workedMinutes: 0,
  nightMinutes: 0,
  nightCoreMinutes: 0,
  sundayMinutes: 0,
  holidayMinutes: 0,
};

/**
 * Gun satirlarini kurar.
 *
 * Gun tipi sirasi: yasal tatil tablosu → takvim → calisma olaylari → bos.
 * Takvim kodu eslenmemisse gun tipi BOS birakilir (`unmapped`); sessizce bir
 * varsayilana dusmuyor, donem de bu haliyle onaylanamiyor.
 */
export function buildPayrollDays(input: BuildDaysInput): PayrollDayDraft[] {
  return input.localDates.map((localDate) => {
    const buckets = input.buckets.get(localDate) ?? EMPTY_BUCKETS;
    const calendar = input.calendarByDate.get(localDate);
    const anomalies = [...(input.anomaliesByDate.get(localDate) ?? [])];

    let dayType: PayrollDayType | null = null;
    let dayTypeSource: PayrollDayTypeSource = PayrollDayTypeSource.none;
    let calendarCode: string | null = null;
    let paid = false;

    if (input.holidayDates.has(localDate)) {
      dayType = PayrollDayType.holiday;
      dayTypeSource = PayrollDayTypeSource.holiday_table;
      paid = true;
      calendarCode = calendar?.uiStatus?.trim() || calendar?.status || null;
    } else if (calendar) {
      const resolved = resolveCalendarDayType(calendar, input.rules);
      if (resolved) {
        dayType = resolved.dayType;
        dayTypeSource = PayrollDayTypeSource.calendar;
        calendarCode = resolved.calendarCode;
        paid = resolved.paid;
        // Takvim tatil diyor ama yasal tatil tablosunda yok: biri yanlis.
        // Zam vergi ayricalikli oldugu icin sessiz gecilemez.
        if (resolved.dayType === PayrollDayType.holiday) {
          anomalies.push('calendar_holiday_not_in_table');
        }
      } else {
        dayTypeSource = PayrollDayTypeSource.unmapped;
        calendarCode = calendar.uiStatus?.trim() || calendar.status;
        anomalies.push('calendar_code_unmapped');
      }
    } else if (buckets.workedMinutes > 0) {
      dayType = PayrollDayType.work;
      dayTypeSource = PayrollDayTypeSource.events;
      paid = true;
    } else {
      dayType = PayrollDayType.off;
      dayTypeSource = PayrollDayTypeSource.none;
    }

    // Izin/hastalik gunune calisma dusmus: ya takvim eski ya vardiya yanlis
    // gune yazilmis. Ikisi de ofisin bakmasi gereken bir sey.
    if (
      buckets.workedMinutes > 0 &&
      (dayType === PayrollDayType.vacation ||
        dayType === PayrollDayType.sick ||
        dayType === PayrollDayType.absence_unpaid)
    ) {
      anomalies.push('worked_on_absence_day');
    }

    return {
      localDate,
      dayType,
      dayTypeSource,
      calendarCode,
      paid,
      workedMinutes: buckets.workedMinutes,
      breakMinutes: input.breakMinutesByDate.get(localDate) ?? 0,
      nightMinutes: buckets.nightMinutes,
      nightCoreMinutes: buckets.nightCoreMinutes,
      sundayMinutes: buckets.sundayMinutes,
      holidayMinutes: buckets.holidayMinutes,
      anomalies,
      countsTowardTarget: countsTowardTarget(localDate, dayType, dayTypeSource, input.holidayDates),
    };
  });
}

/**
 * Gun hedefe sayilir mi.
 *
 * Hafta sonu ve yasal tatil sayilmaz. Ofis takvimde acikca "Frei" isaretlediyse
 * de sayilmaz — vardiya sistemlerinde hafta ici bir gun serbest olabiliyor ve
 * duz "Pazartesi–Cuma" varsayimi o surucuyu her ay eksik gosterirdi.
 *
 * Izinsiz devamsizlik SAYILIR: hedefi dolduramamis olmasi zaten anlatilmak
 * istenen sey.
 *
 * SINIR: gercek vardiya plani (Schichtmodell) modellenmis degil. Takvimde
 * isaret yoksa hafta ici gun calisma gunu varsayiliyor. Roster gelirse
 * degistirilecek yer burasi.
 */
function countsTowardTarget(
  localDate: string,
  dayType: PayrollDayType | null,
  dayTypeSource: PayrollDayTypeSource,
  holidayDates: ReadonlySet<string>,
): boolean {
  if (isWeekend(localDate)) return false;
  if (holidayDates.has(localDate)) return false;
  if (dayType === PayrollDayType.holiday) return false;
  if (dayType === PayrollDayType.off && dayTypeSource === PayrollDayTypeSource.calendar) {
    return false;
  }
  return true;
}

export type EntryTargets = {
  /** Dolu ise aylik hedef dogrudan bu; gunluk kredi bundan turetilir. */
  monthlyTargetMinutes: number | null;
  /** Haftalik hedef; gunluk hedef bunun beste biri. */
  weeklyTargetMinutes: number;
};

export type PayrollEntryTotals = {
  targetMinutes: number;
  workedMinutes: number;
  creditedMinutes: number;
  overtimeMinutes: number;
  regularMinutes: number;
  balanceMinutes: number;
  nightMinutes: number;
  nightCoreMinutes: number;
  sundayMinutes: number;
  holidayMinutes: number;
  vacationDays: number;
  sickDays: number;
  unpaidAbsenceDays: number;
  /** Gun tipi cozulemeyen gun sayisi; sifirdan buyukse donem onaylanamaz. */
  unmappedDays: number;
};

/**
 * Gun satirlarindan donem kalemini toplar.
 *
 * `overtimeMinutes` ile `balanceMinutes` AYRI alanlar ve bu bilincli:
 * fazla mesai odemeye giden bir Lohnart oldugu icin negatif olamaz, ama
 * ekranda gosterilen +6s / −2s bakiyesi negatif olabilmeli. Tek alanda
 * birlestirilirse ya eksi bakiye kaybolur ya DATEV'e negatif miktar gider.
 */
export function buildPayrollEntryTotals(
  days: readonly PayrollDayDraft[],
  targets: EntryTargets,
): PayrollEntryTotals {
  const targetDayCount = days.filter((day) => day.countsTowardTarget).length;

  const dailyTargetMinutes = targets.monthlyTargetMinutes
    ? targetDayCount > 0
      ? Math.round(targets.monthlyTargetMinutes / targetDayCount)
      : 0
    : Math.round(targets.weeklyTargetMinutes / 5);
  const targetMinutes = targets.monthlyTargetMinutes ?? targetDayCount * dailyTargetMinutes;

  let workedMinutes = 0;
  let creditedMinutes = 0;
  let nightMinutes = 0;
  let nightCoreMinutes = 0;
  let sundayMinutes = 0;
  let holidayMinutes = 0;
  let vacationDays = 0;
  let sickDays = 0;
  let unpaidAbsenceDays = 0;
  let unmappedDays = 0;

  for (const day of days) {
    workedMinutes += day.workedMinutes;
    nightMinutes += day.nightMinutes;
    nightCoreMinutes += day.nightCoreMinutes;
    sundayMinutes += day.sundayMinutes;
    holidayMinutes += day.holidayMinutes;

    if (day.dayTypeSource === PayrollDayTypeSource.unmapped) unmappedDays += 1;

    switch (day.dayType) {
      case PayrollDayType.vacation:
        vacationDays += 1;
        // Ucretli devamsizlik hedefi dolduruyor sayilir; yoksa izne cikan
        // surucu her ay eksi bakiyeyle gorunurdu.
        if (day.countsTowardTarget) creditedMinutes += dailyTargetMinutes;
        break;
      case PayrollDayType.sick:
        sickDays += 1;
        if (day.countsTowardTarget) creditedMinutes += dailyTargetMinutes;
        break;
      case PayrollDayType.absence_unpaid:
        unpaidAbsenceDays += 1;
        break;
      default:
        break;
    }
  }

  const balanceMinutes = workedMinutes + creditedMinutes - targetMinutes;
  const overtimeMinutes = Math.max(0, balanceMinutes);
  const regularMinutes = Math.max(0, workedMinutes - overtimeMinutes);

  return {
    targetMinutes,
    workedMinutes,
    creditedMinutes,
    overtimeMinutes,
    regularMinutes,
    balanceMinutes,
    nightMinutes,
    nightCoreMinutes,
    sundayMinutes,
    holidayMinutes,
    vacationDays,
    sickDays,
    unpaidAbsenceDays,
    unmappedDays,
  };
}

/** Donemdeki butun yerel gunler, "YYYY-MM-DD". */
export function localDatesOfMonth(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return dates;
}
