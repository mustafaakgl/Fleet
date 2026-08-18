import { canViewFinancialFields } from '../../common/utils/permissions';

/**
 * ALAN BAZLI FINANS KORUMASI (Faz 15) — SAF mantik.
 *
 * NEDEN AYRI BIR MASKELEYICI: repodaki `maskFinancialFields` anahtar adlarini
 * TAM ESLESME ile suzuyor (`amount`, `revenue`, `costAmount`...) ve
 * `contractedRevenue` o listede YOK. Paylasilan listeye eklemek, ayni adi
 * tasiyan baska uclarin davranisini de sessizce degistirirdi — bu yuzden
 * siparis alanlari icin kendi, dar kapsamli maskesi var.
 *
 * FRONTEND GIZLEME YETERLI DEGIL: maskeleme SUNUCU yanitinda yapiliyor.
 * Ekranda gizlemek, `curl` ile ayni ucu cagiran birine hicbir sey yapmaz.
 */

/** Yalnizca finansal rollerin gorebilecegi siparis alanlari. */
export const FINANCIAL_ORDER_FIELDS = [
  'currency',
  'contractedRevenue',
  'billingMode',
  'revenueAllocation',
] as const;

/** Gorev duzeyinde gizlenen alanlar. */
const FINANCIAL_ASSIGNMENT_FIELDS = ['expectedDailyRevenue'] as const;

export function canSeeOrderFinancials(role: string | null | undefined): boolean {
  return canViewFinancialFields(role ?? '');
}

/**
 * Yanittan finansal alanlari cikarir.
 *
 * ALANLAR SILINMIYOR, `null` YAZILIYOR: alanin YOKLUGU ile DEGERININ BOS
 * olmasi arayuzde ayni sey degildir. `null` gonderdigimizde ekran "gorme
 * yetkiniz yok" diyebilir; alani hic gondermezsek "deger girilmemis" der.
 */
export function maskOrderFinancials<T extends Record<string, unknown>>(
  payload: T,
  role: string | null | undefined,
): T {
  if (canSeeOrderFinancials(role)) {
    return payload;
  }

  const masked: Record<string, unknown> = { ...payload };
  for (const field of FINANCIAL_ORDER_FIELDS) {
    if (field in masked) {
      masked[field] = null;
    }
  }
  masked.financialFieldsMasked = true;

  if (Array.isArray(masked.assignments)) {
    masked.assignments = (masked.assignments as Array<Record<string, unknown>>).map((item) => {
      const copy = { ...item };
      for (const field of FINANCIAL_ASSIGNMENT_FIELDS) {
        if (field in copy) copy[field] = null;
      }
      return copy;
    });
  }

  // REVIZYON GECMISI DE SIZDIRIR: `changedFields` eski/yeni TUTARI tasiyor.
  if (Array.isArray(masked.revisions)) {
    masked.revisions = (masked.revisions as Array<Record<string, unknown>>).map((item) => {
      const copy = { ...item };
      if (Array.isArray(copy.changedFields)) {
        copy.changedFields = (copy.changedFields as Array<Record<string, unknown>>).map((change) =>
          isFinancialField(String(change.field))
            ? { field: change.field, before: null, after: null, masked: true }
            : change,
        );
      }
      return copy;
    });
  }

  return masked as T;
}

export function maskOrderList<T extends Record<string, unknown>>(
  rows: T[],
  role: string | null | undefined,
): T[] {
  return rows.map((row) => maskOrderFinancials(row, role));
}

function isFinancialField(field: string): boolean {
  return (FINANCIAL_ORDER_FIELDS as readonly string[]).includes(field);
}

/**
 * Yetkisiz rolun finansal alan YAZMASINI engeller.
 *
 * SESSIZCE YOK SAYMIYORUZ, REDDEDIYORUZ: gonderdigi fiyatin kaydedildigini
 * sanan bir kullanici, kaydedilmemis bir fiyatla calismaya devam eder. Hata
 * vermek, sessizce dusurmekten durust.
 */
export function assertCanWriteFinancials(
  role: string | null | undefined,
  input: Record<string, unknown>,
): void {
  if (canSeeOrderFinancials(role)) {
    return;
  }
  const attempted = FINANCIAL_ORDER_FIELDS.filter(
    (field) => input[field] !== undefined && input[field] !== null,
  );
  if (attempted.length > 0) {
    throw new FinancialFieldForbiddenError(attempted);
  }
}

export class FinancialFieldForbiddenError extends Error {
  constructor(readonly fields: readonly string[]) {
    super('transport_order_financial_field_forbidden');
    this.name = 'FinancialFieldForbiddenError';
  }
}
