import { canViewFinancialFields } from '../../common/utils/permissions';
import type { FinancialContent } from './order-intake-identity';

/**
 * ALAN BAZLI FINANS KORUMASI — GELEN KUTUSU (Faz 16, bolum 7).
 *
 * NEDEN FAZ 15'IN MASKESI YETMIYOR: `maskOrderFinancials` bir SIPARIS
 * govdesini maskeliyor. Gelen kutusu bundan cok daha genis bir yuzey acar —
 * ajanin onerdigi alanlar, KANIT SNIPPET'LERI, guven skorlari, revizyon
 * diff'i ve ham `.eml`. Fiyati siparis alaninda gizleyip kanit satirinda
 * gostermek, maskeyi tamamen anlamsiz kilardi:
 *
 *     "Frachtpreis: 1.250,00 EUR"   <- kanit snippet'i
 *
 * Bu yuzden maskeleme kaniti da kapsiyor ve `financial` isareti CIKARIM
 * ANINDA konuyor (bkz. order-intake-extract.ts) — sonradan tahmin etmek daha
 * zayif olurdu.
 *
 * KORUMA SUNUCU YANITINDA: ekranda gizlemek, ayni ucu `curl` ile cagiran
 * birine hicbir sey yapmaz.
 */

/** Yalnizca finansal rollerin gorebilecegi cikarim alanlari. */
export const FINANCIAL_EXTRACTION_FIELDS = [
  'revenueAmount',
  'currency',
  'billingMode',
] as const;

export function canSeeIntakeFinancials(role: string | null | undefined): boolean {
  return canViewFinancialFields(role ?? '');
}

/**
 * HAM BELGE (`.eml` / PDF) ACILABILIR MI.
 *
 * Ham belge alan bazinda maskelenemez — icinde ne varsa okunur. Bu yuzden
 * kural DAR: finansal veri TASIMADIGI KESIN OLMAYAN bir belge, yalnizca
 * finansal rollere aciliyor.
 *
 * `unknown` GUVENLI SAYILMAZ. Tersini soylemek — "emin degilim, o halde
 * gosterebilirim" — saldirganin tek isini tespiti sasirtmaya indirger.
 */
export function canOpenRawDocument(
  role: string | null | undefined,
  containsFinancialData: FinancialContent,
): boolean {
  if (canSeeIntakeFinancials(role)) return true;
  return containsFinancialData === 'no';
}

interface EvidenceEntry {
  field: string;
  source: string;
  snippet: string;
  financial: boolean;
}

/**
 * Kanit listesini maskeler.
 *
 * SATIR SILINMIYOR, SNIPPET'I GIZLENIYOR: kanitin YOKLUGU ile GORULEMEZ
 * OLMASI ayni sey degildir. Satiri hic gondermezsek incelemeci "bu alanin
 * kaniti yok" der; `masked` isaretiyle gonderirsek "gorme yetkim yok" der.
 * Operasyonel kanit (yukleme adresi, agirlik) OLDUGU GIBI kaliyor.
 */
export function maskEvidence<T extends { entries?: unknown }>(
  evidence: T | null | undefined,
  role: string | null | undefined,
): T | null {
  if (!evidence) return null;
  if (canSeeIntakeFinancials(role)) return evidence;
  if (!Array.isArray(evidence.entries)) return evidence;

  return {
    ...evidence,
    entries: (evidence.entries as EvidenceEntry[]).map((entry) =>
      entry.financial
        ? { field: entry.field, source: entry.source, snippet: null, financial: true, masked: true }
        : entry,
    ),
  };
}

/** Cikarim govdesinden finansal alanlari cikarir. `null` yazilir, silinmez. */
export function maskExtractionPayload<T extends Record<string, unknown>>(
  payload: T,
  role: string | null | undefined,
): T {
  if (canSeeIntakeFinancials(role)) return payload;

  const masked: Record<string, unknown> = { ...payload };
  for (const field of FINANCIAL_EXTRACTION_FIELDS) {
    if (field in masked) masked[field] = null;
  }
  masked.financialFieldsMasked = true;
  return masked as T;
}

/** Guven skorlari da alan adi tasiyor — finansal olanlar cikariliyor. */
export function maskConfidence(
  confidence: Record<string, number> | null | undefined,
  role: string | null | undefined,
): Record<string, number> | null {
  if (!confidence) return null;
  if (canSeeIntakeFinancials(role)) return confidence;

  const masked: Record<string, number> = {};
  for (const [field, score] of Object.entries(confidence)) {
    if (!isFinancialField(field)) masked[field] = score;
  }
  return masked;
}

/**
 * Revizyon diff'i ESKI VE YENI DEGERI tasir — en dogrudan sizinti yolu.
 *
 * Alan adi korunuyor ki incelemeci "fiyat degisti ama goremiyorum" diyebilsin;
 * degerler gidiyor.
 */
export function maskDiff<T extends { field?: unknown }>(
  changes: readonly T[] | null | undefined,
  role: string | null | undefined,
): T[] {
  if (!changes) return [];
  if (canSeeIntakeFinancials(role)) return [...changes];

  return changes.map((change) =>
    isFinancialField(String(change.field))
      ? ({ field: change.field, before: null, after: null, masked: true } as unknown as T)
      : change,
  );
}

/**
 * Mesaj ozeti — liste ve ARAMA yanitlari icin.
 *
 * ARAMA DA MASKELENIYOR: konu satiri tutar tasiyabilir ("Auftrag 1.250 EUR")
 * ve maskelenmemis bir arama sonucu, korunan alani baska bir kapidan
 * gostermek olurdu.
 */
export function maskMessageSummary<T extends Record<string, unknown>>(
  message: T,
  role: string | null | undefined,
): T {
  if (canSeeIntakeFinancials(role)) return message;
  const financialContent = (message.containsFinancialData ?? 'unknown') as FinancialContent;
  if (financialContent === 'no') return message;

  const masked: Record<string, unknown> = { ...message };
  // Konu ve govde onizlemesi fiyat TASIYABILIR.
  if ('subject' in masked) masked.subject = null;
  if ('bodyPreview' in masked) masked.bodyPreview = null;
  masked.subjectMasked = true;
  masked.rawDocumentAvailable = false;
  return masked as T;
}

/**
 * Denetim metadata'si.
 *
 * Denetim kayitlari genis okunur; korunan bir alanin oraya duz metin olarak
 * dusmesi maskelemeyi tamamen atlatirdi.
 */
export function maskAuditMetadata<T extends Record<string, unknown>>(
  metadata: T,
  role: string | null | undefined,
): T {
  if (canSeeIntakeFinancials(role)) return metadata;
  const masked: Record<string, unknown> = { ...metadata };
  for (const key of Object.keys(masked)) {
    if (isFinancialField(key)) masked[key] = null;
  }
  return masked as T;
}

/**
 * FINANSAL ALAN MI.
 *
 * Ad ESLESTIRMESI kasitli olarak GENIS: `revenueAmount`, `contractedRevenue`,
 * `totalPrice`, `netAmount` gibi adlarin hepsi yakalanmali. Dar bir tam-eslesme
 * listesi, yeni bir alan eklendiginde sessizce acik kalirdi — ve o sessizlik
 * ancak birisi ekranda fiyati gordugunde fark edilirdi.
 */
export function isFinancialField(field: string): boolean {
  const normalized = field.toLowerCase();
  return [
    'revenue', 'amount', 'price', 'currency', 'cost', 'rate', 'billing',
    'tarif', 'fracht', 'preis', 'betrag', 'tutar', 'fiyat', 'navlun',
  ].some((token) => normalized.includes(token));
}
