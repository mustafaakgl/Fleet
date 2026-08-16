/**
 * Para birimi — TEK canonical liste.
 *
 * Faz 6'da bu liste fuel-receipts modulunun icinde duruyordu ve TRY
 * ICERMIYORDU; urun Turkiye'ye acilirken tam da o kod gerekli oldu. Ikinci bir
 * liste acmak yerine buraya tasindi: iki ayri liste, bir tarafta kabul edilen
 * bir fisin digerinde reddedilmesi demek olurdu.
 *
 * PRISMA ENUM DEGIL ve bilincli: dunyadaki tum para birimlerini enum'a
 * kopyalamak, her yeni pazar icin migration gerektiren olu bir liste uretirdi.
 * Dogrulama uc harfli ISO-4217 bicimi + bu allowlist uzerinden yapiliyor.
 */

/** Filonun varsayilan temel para birimi. Almanya'da baslayan urun. */
export const DEFAULT_BASE_CURRENCY = 'EUR';

/**
 * Desteklenen ISO-4217 kodlari.
 *
 * Kapsam: urunun fiilen calistigi/planlandigi pazarlar ve komsu ulkelerde
 * yapilan sinir gecisi yakit alimlari. Yeni pazar eklendiginde buraya bir
 * satir yeter — sema degismez.
 */
export const SUPPORTED_CURRENCIES = [
  'EUR',
  'TRY',
  'CHF',
  'GBP',
  'PLN',
  'CZK',
  'DKK',
  'SEK',
  'NOK',
  'HUF',
  'RON',
  'BGN',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** ISO-4217 bicimi: tam olarak uc buyuk harf. */
const ISO_4217_PATTERN = /^[A-Z]{3}$/;

/** Bosluk kirpar ve buyuk harfe cevirir. Gecersizse null — TAHMIN YOK. */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  const value = raw?.trim().toUpperCase();
  if (!value || !ISO_4217_PATTERN.test(value)) {
    return null;
  }
  return value;
}

export function isSupportedCurrency(raw: string | null | undefined): boolean {
  const value = normalizeCurrency(raw);
  return value !== null && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Kaydin para birimi tenant'in temel para birimiyle AYNI mi.
 *
 * Toplama katilmanin sarti budur. Farkli para birimlerini toplamak
 * `100 EUR + 500 TRY = 600` gibi anlamsiz bir rakam uretir; guvenilir bir kur
 * altyapisi olmadan donusturmek ise kur uydurmak olur.
 */
export function matchesBaseCurrency(
  recordCurrency: string | null | undefined,
  baseCurrency: string,
): boolean {
  const value = normalizeCurrency(recordCurrency) ?? DEFAULT_BASE_CURRENCY;
  return value === (normalizeCurrency(baseCurrency) ?? DEFAULT_BASE_CURRENCY);
}
