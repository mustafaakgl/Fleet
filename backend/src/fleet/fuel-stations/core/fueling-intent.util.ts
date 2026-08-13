import type { FuelProductType } from '@prisma/client';

/**
 * Yakit niyetinin saf mantigi: sure sonu, "ayni secim mi", snapshot yuvarlama.
 *
 * Saf tutuluyor cunku burada verilen karar KALICI: yanlis hesaplanan bir
 * `expiresAt` ya surucunun secimini gun ortasinda dusurur ya da haftalarca
 * yasayan bir "aktif" kayit birakir. Ikisi de sessizce yanlis olur.
 */

/**
 * Filonun isletme zaman dilimi.
 *
 * Repo genelinde tek deger kullaniliyor (tum @Cron ifadeleri ve
 * DEFAULT_PAYROLL_TIME_ZONE 'Europe/Berlin'); Tenant uzerinde bir zaman dilimi
 * ALANI YOK. Sunucunun yerel saatine BIRAKILMIYOR: konteyner UTC calisiyor ve
 * "calisma gununun sonu" UTC'de iki saat erken biterdi — yaz saatinde 22:00'de
 * secim yapan surucunun niyeti aninda EXPIRED olurdu.
 */
export const FLEET_OPERATING_TIME_ZONE = 'Europe/Berlin';

/**
 * Tura BAGLI OLMAYAN secimin ust siniri.
 *
 * Repoda "tur disi bir surucu gunu" icin guvenilir bir canonical kural yok
 * (WorkSession serbest baslar/biter), bu yuzden tahmin yurutmek yerine
 * belgelenmis sabit bir tavan kullaniliyor.
 */
export const STANDALONE_INTENT_MAX_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** Bir anin verilen zaman dilimindeki takvim gunu. */
function zonedCalendarDate(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: value('year'), month: value('month'), day: value('day') };
}

/**
 * Bir anin verilen zaman dilimindeki UTC ofseti (ms).
 *
 * Yontem: an, hedef zaman diliminde bicimlendirilip UTC'ymis gibi geri
 * okunuyor; fark tam olarak ofsettir. Intl kullaniliyor cunku yaz saati
 * kurallarini elle tasimak hatanin kendisi olurdu (bkz. time-buckets.util.ts).
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24, // bazi ICU surumleri gece yarisini 24 verir
    value('minute'),
    value('second'),
  );
  return asIfUtc - instant.getTime();
}

/**
 * Verilen gunun YEREL bitisi (bir sonraki yerel gece yarisindan 1 ms once).
 *
 * Iki adimda cozuluyor: ilk tahmin gunun ofsetiyle duzeltiliyor, sonra
 * duzeltilmis anin KENDI ofsetiyle bir kez daha. Tek adim, saat degisiminin
 * yasandigi gecelerde bir saat kayardi.
 */
export function endOfLocalDay(reference: Date, timeZone = FLEET_OPERATING_TIME_ZONE): Date {
  const { year, month, day } = zonedCalendarDate(reference, timeZone);
  const nextLocalMidnight = Date.UTC(year, month - 1, day + 1, 0, 0, 0);

  let instant = nextLocalMidnight - zoneOffsetMs(new Date(nextLocalMidnight), timeZone);
  instant = nextLocalMidnight - zoneOffsetMs(new Date(instant), timeZone);

  return new Date(instant - 1);
}

/**
 * Aktif niyetin son gecerlilik ani.
 *
 *   - Tura bagli secim  -> turun CALISMA GUNUNUN yerel sonu
 *   - Bagimsiz secim    -> secimden itibaren STANDALONE_INTENT_MAX_HOURS
 *
 * Gecmis tarihli bir turda (ornegin dun aksamdan kalan bir plan) gunun sonu
 * ZATEN GECMIS olurdu ve kayit dogar dogmaz EXPIRED olurdu; bu durumda
 * bagimsiz tavan uygulaniyor. Sessizce olu bir kayit yaratmaktansa acik bir
 * kural.
 */
export function resolveIntentExpiry(params: {
  selectedAt: Date;
  tourWorkDate: Date | null;
  timeZone?: string;
}): Date {
  const timeZone = params.timeZone ?? FLEET_OPERATING_TIME_ZONE;
  const standalone = new Date(params.selectedAt.getTime() + STANDALONE_INTENT_MAX_HOURS * HOUR_MS);

  if (!params.tourWorkDate || Number.isNaN(params.tourWorkDate.getTime())) {
    return standalone;
  }

  const endOfWorkDay = endOfLocalDay(params.tourWorkDate, timeZone);
  return endOfWorkDay.getTime() > params.selectedAt.getTime() ? endOfWorkDay : standalone;
}

/** Ayni secimi ayirt eden alanlar — idempotency'nin tanimi. */
export interface IntentSelectionKey {
  provider: string;
  providerStationId: string;
  selectedFuelProduct: FuelProductType;
  plannedLitres: number | null;
}

/**
 * Iki secim AYNI mi?
 *
 * Fiyat ve rota metrigi KARSILASTIRMAYA GIRMEZ: bunlar arama anina bagli
 * turetilmis degerlerdir ve iki arama arasinda dogal olarak degisir. Girseydi
 * cift dokunus her seferinde yeni bir kayit ve yeni bir ofis bildirimi
 * uretirdi — tam olarak engellemek istedigimiz sey.
 */
export function isSameSelection(left: IntentSelectionKey, right: IntentSelectionKey): boolean {
  return (
    left.provider === right.provider &&
    left.providerStationId === right.providerStationId &&
    left.selectedFuelProduct === right.selectedFuelProduct &&
    sameLitres(left.plannedLitres, right.plannedLitres)
  );
}

/** Litre 2 ondalikla saklaniyor; karsilastirma da ayni hassasiyette. */
function sameLitres(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) < 0.005;
}

/** Sonlu ve negatif olmayan sayi; NaN/Infinity/negatif -> null. */
export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
