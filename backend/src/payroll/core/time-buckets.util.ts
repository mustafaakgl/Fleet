/**
 * Calisilan araliklari bordro kovalarina ayirir: gece, gece cekirdegi, Pazar,
 * tatil.
 *
 * NEDEN ZAMAN DILIMI ONEMLI: veritabani UTC tutuyor ama "Pazar" ve "20:00–06:00"
 * YEREL kavramlar. Yaz saatinde Berlin UTC+2; UTC uzerinden hesaplanan bir gece
 * penceresi iki saat kayar ve Pazar sinirlari yanlis yere duser. Bu yuzden her
 * dakika yerel saate cevrilerek siniflandiriliyor.
 *
 * Yontem dakika dakika yurumek. Aralik-cebiri yerine tercih edilmesinin sebebi
 * yaz saati gecisleri: Mart'ta gece vardiyasinin icinden bir saat siliniyor,
 * Ekim'de bir saat tekrarlaniyor. Aralik aritmetigi bunu sessizce yanlis
 * hesaplardi. Bir vardiya en fazla ~14 saat, yani ~840 adim — maliyeti onemsiz.
 * Ofset yalnizca saat basi yeniden okunuyor (gecisler saat basinda olur).
 */

import type { WorkInterval } from '../../work-time/core/work-time-fold.util';

export const DEFAULT_PAYROLL_TIME_ZONE = 'Europe/Berlin';

export type NightWindow = {
  /** Gun ici dakika (0–1439). Baslangic > bitis ise pencere gece yarisini asar. */
  startMinute: number;
  endMinute: number;
};

export type BucketOptions = {
  timeZone?: string;
  night: NightWindow;
  nightCore: NightWindow;
  /** Yasal tatil gunleri, yerel takvimde "YYYY-MM-DD". */
  holidayDates: ReadonlySet<string>;
};

export type DayBuckets = {
  /** Yerel takvim gunu, "YYYY-MM-DD". */
  localDate: string;
  workedMinutes: number;
  nightMinutes: number;
  nightCoreMinutes: number;
  sundayMinutes: number;
  holidayMinutes: number;
};

const MINUTE_MS = 60_000;

/**
 * Bir anin verilen zaman dilimindeki yerel alanlari.
 *
 * Intl kullaniliyor cunku yaz saati kurallarini elle tasimak hatanin ta kendisi
 * olurdu. (Fatura bicimlendirmesinde Intl'den KACINILIYOR — orada cikti
 * ICU surumune gore kaymamali; burada istenen sey tam olarak ICU'nun bildigi
 * zaman dilimi kurallari.)
 */
function zonedFields(instant: Date, timeZone: string): {
  localDate: string;
  minuteOfDay: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(value('hour')) % 24; // bazi ICU surumleri gece yarisini 24 verir
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));

  return {
    localDate: `${value('year')}-${value('month')}-${value('day')}`,
    minuteOfDay: hour * 60 + Number(value('minute')),
    weekday: weekdayIndex,
  };
}

/** Pencere gece yarisini asabilir: 20:00–06:00 icin start > end. */
function inWindow(minuteOfDay: number, window: NightWindow): boolean {
  if (window.startMinute === window.endMinute) return false;
  if (window.startMinute < window.endMinute) {
    return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
  }
  return minuteOfDay >= window.startMinute || minuteOfDay < window.endMinute;
}

function emptyDay(localDate: string): DayBuckets {
  return {
    localDate,
    workedMinutes: 0,
    nightMinutes: 0,
    nightCoreMinutes: 0,
    sundayMinutes: 0,
    holidayMinutes: 0,
  };
}

/**
 * Araliklari yerel gunlere ve kovalara dagitir.
 *
 * Gece yarisini asan vardiya IKI gune bolunur: dakika, gerceklestigi yerel gune
 * yazilir. Zam hesabi gunun kendisine baglandigi icin dogrusu bu — bir gece
 * vardiyasinin tamami baslangic gunune yazilsaydi Pazar zammi yanlis gune
 * duserdi.
 *
 * Pazar ve tatil BIRBIRINI DISLAR, tatil kazanir: §3b'de ikisi ust uste
 * binmiyor. Gece bagimsiz sayilir, gece + Pazar/tatil birlikte olabilir.
 */
export function bucketWorkIntervals(
  intervals: readonly WorkInterval[],
  options: BucketOptions,
): DayBuckets[] {
  const timeZone = options.timeZone ?? DEFAULT_PAYROLL_TIME_ZONE;
  const byDate = new Map<string, DayBuckets>();

  for (const interval of intervals) {
    const startMs = interval.from.getTime();
    const endMs = interval.to.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    // Dakikaya hizala: saniyeler bordro icin anlamsiz ve iki komsu araligin
    // sinirinda cift sayima yol acabilir.
    let cursor = Math.floor(startMs / MINUTE_MS) * MINUTE_MS;
    const last = Math.floor((endMs - 1) / MINUTE_MS) * MINUTE_MS;

    let fields = zonedFields(new Date(cursor), timeZone);
    while (cursor <= last) {
      // Yaz saati gecisleri saat basinda olur; ofseti her dakika okumak gereksiz.
      if (fields.minuteOfDay % 60 === 0) {
        fields = zonedFields(new Date(cursor), timeZone);
      }

      const day = byDate.get(fields.localDate) ?? emptyDay(fields.localDate);
      day.workedMinutes += 1;
      if (inWindow(fields.minuteOfDay, options.night)) day.nightMinutes += 1;
      if (inWindow(fields.minuteOfDay, options.nightCore)) day.nightCoreMinutes += 1;
      if (options.holidayDates.has(fields.localDate)) {
        day.holidayMinutes += 1;
      } else if (fields.weekday === 0) {
        day.sundayMinutes += 1;
      }
      byDate.set(fields.localDate, day);

      cursor += MINUTE_MS;
      // Bir sonraki dakikanin alanlari: ucuz yol ilerletmek, saat basinda
      // yukaridaki kontrol zaten yeniden okuyor.
      fields =
        fields.minuteOfDay + 1 >= 1_440
          ? zonedFields(new Date(cursor), timeZone)
          : { ...fields, minuteOfDay: fields.minuteOfDay + 1 };
    }
  }

  return [...byDate.values()].sort((left, right) => left.localDate.localeCompare(right.localDate));
}

/** Bir anin yerel takvim gunu — gun tipi eslemesi bunu anahtar olarak kullanir. */
export function localDateOf(instant: Date, timeZone = DEFAULT_PAYROLL_TIME_ZONE): string {
  return zonedFields(instant, timeZone).localDate;
}
