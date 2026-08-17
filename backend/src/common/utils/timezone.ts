/**
 * Kiraci zaman dilimi — TEK canonical yer.
 *
 * NEDEN GEREKLI: Faz 8'de aylik kovalar `Europe/Berlin` sabitine baglıydi.
 * Urun Turkiye'ye acilirken bu sessiz varsayim yanlis AY uretir: 31 Temmuz
 * 23:30 UTC kaydi Berlin'de 1 Agustos, Istanbul'da 2 Agustos'tur — yani ayni
 * UTC ani iki kiracida farkli aya duser ve rapor sinirlari kayar.
 *
 * PRISMA ENUM DEGIL: IANA veritabani yuzlerce bolge tasiyor ve yilda birkac
 * kez degisiyor; enum'a kopyalamak her guncellemede migration gerektiren olu
 * bir liste uretirdi. Dogrulama Intl uzerinden CALISMA ANINDA yapiliyor.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

/**
 * Arayuzde onerilen bolgeler.
 *
 * Kisitlayici DEGIL — `isSupportedTimeZone` her gecerli IANA kimligini kabul
 * eder. Bu liste yalnizca secim kutusunu kullanilabilir tutuyor.
 */
export const SUGGESTED_TIME_ZONES = [
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Paris',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Bucharest',
  'Europe/Sofia',
  'Europe/Budapest',
  'UTC',
] as const;

/**
 * Gercekten var olan bir IANA kimligi mi.
 *
 * Intl'e SORULUYOR, listeye bakilmiyor: `Europe/Istanbul` gibi gecerli ama
 * bizim listemizde olmayan bir deger reddedilmemeli. Gecersiz kimlikte
 * `Intl.DateTimeFormat` firlatiyor — tek guvenilir kontrol bu.
 */
export function isSupportedTimeZone(raw: string | null | undefined): boolean {
  const value = raw?.trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Gecerliyse kirpilmis degeri, degilse null. TAHMIN YOK. */
export function normalizeTimeZone(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value && isSupportedTimeZone(value) ? value : null;
}

/** Kayitli deger bozuksa belgelenmis varsayilana duser — asla cokmez. */
export function resolveTimeZone(raw: string | null | undefined): string {
  return normalizeTimeZone(raw) ?? DEFAULT_TIME_ZONE;
}
