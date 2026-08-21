import type { FinanceAmount, FinanceSummaryResponse } from './types';

/**
 * Finance merkezinin SAF gorunum mantigi.
 *
 * Saf tutuluyor cunku buradaki her karar bir muhasebe ekranina rakam basiyor
 * ve DOM olmadan sinanabilmeli. En onemlisi: "olculemedi" ile "sifir cikti"
 * ayrimi TEK yerde tanimli — iki ekran bunu ayri ayri yorumlarsa biri
 * kacinilmaz olarak yanlis yorumlar.
 */

/**
 * Bir tutarin ekranda nasil okunacagi.
 *
 * - `value`  : olculmus bir tutar var (sifir OLABILIR — "olctuk, sifir cikti")
 * - `noData` : hic kayit yok. `0,00` YAZILMAZ; yazilsaydi "bu donemde hic
 *              masraf olmadi" diye okunurdu, oysa dogru cevap "veri yok".
 */
export type FinanceCellKind = 'value' | 'noData';

export function amountKind(entry: FinanceAmount | null | undefined): FinanceCellKind {
  if (!entry || entry.count === 0) return 'noData';
  return 'value';
}

/**
 * GERCEK gelir hic olculemediyse `null` doner.
 *
 * Backend `revenue.actual`i fatura yoksa `null` gonderiyor; burada yalnizca
 * bir kez daha kontrol ediliyor ki ekran `0,00` ile "fatura yok"u
 * karistirmasin.
 */
export function hasActualRevenue(data: FinanceSummaryResponse | null): boolean {
  return data?.revenue.actual != null && data.revenue.actual.count > 0;
}

/** Marj olculebilir mi — GERCEK gelir yoksa hesaplanmaz, tahminden TUREMEZ. */
export function hasMargin(data: FinanceSummaryResponse | null): boolean {
  return data?.margin != null && hasActualRevenue(data);
}

/**
 * Listede kac satirin gosterildigi.
 *
 * Kirpma SESSIZ OLMAMALI: 180 kaydin 50'si gosteriliyorsa ekran bunu yazar.
 * Aksi halde "50 kayit var" diye okunur ve kuyrugun tamami sanilir.
 */
export function isTruncated(block: { totalCount: number; items: unknown[] }): boolean {
  return block.totalCount > block.items.length;
}

/** Ekranda kac karar bekliyor — sekme rozetleri ve baslik icin. */
export function openDecisionCount(data: FinanceSummaryResponse | null): number {
  if (!data) return 0;
  return data.pendingServiceRecords.totalCount + data.fuelReceipts.totalCount;
}

/** Backend hata kodu -> ceviri anahtari. HAM KOD GOSTERILMEZ. */
export function financeErrorKey(code: string | null | undefined): string {
  switch (code) {
    case 'finance_reversed_range':
      return 'finance.errors.reversedRange';
    case 'finance_range_in_future':
      return 'finance.errors.futureRange';
    case 'finance_range_too_large':
      return 'finance.errors.rangeTooLarge';
    case 'finance_invalid_range':
      return 'finance.errors.invalidRange';
    default:
      return 'finance.errors.generic';
  }
}

/**
 * Servis kaydi reddi icin en kisa anlamli metin.
 *
 * Sunucudaki `MIN_SERVICE_REJECTION_REASON` ile AYNI sayi. Iki tarafta da
 * kontrol var cunku istemci kontrolu atlanabilir; ekranin bunu bilmesi ise
 * kullaniciya 400 yemeden once soyleyebilmesi icin.
 */
export const MIN_REJECTION_REASON = 10;

export function isRejectionReasonValid(reason: string): boolean {
  return reason.trim().length >= MIN_REJECTION_REASON;
}

/** Donem secenekleri — backend DTO'sundaki `PERIOD_MONTH_OPTIONS` ile ayni. */
export const FINANCE_PERIODS = [1, 3, 6, 12] as const;
export type FinancePeriod = (typeof FINANCE_PERIODS)[number];
