/**
 * ONAY GOREVLERI VE ONAY ON KOSULLARI (Faz 16, bolum 6 ve 7) — SAF mantik.
 *
 * Faz 12'nin `ApprovalTask` iliskisi zaten 1:n ve tam bu gun icin oyle
 * birakilmisti: "ileride veri tasimadan adim eklenebilsin". Faz 16 o adimi
 * ekliyor — OPERASYONEL ve FINANSAL inceleme.
 */

export const OPERATIONAL_REVIEW_SEQUENCE = 1;
export const FINANCIAL_REVIEW_SEQUENCE = 2;

export interface ReviewTaskPlan {
  sequence: number;
  assignedRole: string | null;
  required: boolean;
}

/**
 * Hangi inceleme gorevleri acilacak.
 *
 * OPERASYONEL DAIMA ACILIR: her siparis mesajinin bir operasyon karsiligi var.
 *
 * FINANSAL YALNIZCA GEREKIYORSA: mesajda tutar yoksa ve belge finansal veri
 * tasimiyorsa ikinci bir gorev ACILMAZ. Gereksiz finans adimi acmak, muhasebeyi
 * bos gorevlerle doldurur ve gercek finans incelemesinin degerini dusurur —
 * herkesin refleksle "onayla"ya bastigi bir kuyruk, inceleme degildir.
 *
 * `containsFinancialData` `unknown` ise GEREKLI SAYILIR: belgede fiyat olup
 * olmadigini bilmiyorsak, olmadigini VARSAYAMAYIZ.
 */
export function planReviewTasks(input: {
  hasRevenue: boolean;
  containsFinancialData: 'yes' | 'no' | 'unknown';
}): ReviewTaskPlan[] {
  const tasks: ReviewTaskPlan[] = [
    { sequence: OPERATIONAL_REVIEW_SEQUENCE, assignedRole: 'office', required: true },
  ];

  if (input.hasRevenue || input.containsFinancialData !== 'no') {
    tasks.push({ sequence: FINANCIAL_REVIEW_SEQUENCE, assignedRole: 'accounting', required: true });
  }

  return tasks;
}

export type ApprovalBlockReason =
  | 'review_not_open'
  | 'intent_unknown'
  | 'company_not_selected'
  | 'order_not_selected'
  | 'operational_review_pending'
  | 'financial_review_pending'
  | 'already_produced_result';

/**
 * Canonical kayit URETILEBILIR MI.
 *
 * ZORUNLU GOREVLER TAMAMLANMADAN TASLAK OLUSMAZ. Sira kontrolu burada, saf
 * ve test edilebilir; servis yalnizca sonucu uyguluyor.
 */
export function assessApproval(input: {
  reviewStatus: string;
  intent: string;
  companyId: string | null;
  orderId: string | null;
  operationalDecided: boolean;
  financialRequired: boolean;
  financialDecided: boolean;
  alreadyProduced: boolean;
}): { allowed: boolean; blockedBy: ApprovalBlockReason[] } {
  const blockedBy: ApprovalBlockReason[] = [];

  if (input.reviewStatus !== 'open') blockedBy.push('review_not_open');
  // EXACTLY-ONCE: ikinci bir sonuc uretmek veritabaninda da imkansiz, ama
  // kullaniciya anlasilir bir sebep gostermek icin burada da bakiliyor.
  if (input.alreadyProduced) blockedBy.push('already_produced_result');

  // `unknown` ONAYLANAMAZ: neyin yapilacagi belli degilken bir kayit acmak,
  // tahmin uzerine siparis yazmaktir. Insan once somut bir niyet secmeli.
  if (input.intent === 'unknown') blockedBy.push('intent_unknown');

  if (input.intent === 'new_order' && !input.companyId) blockedBy.push('company_not_selected');

  if ((input.intent === 'amendment' || input.intent === 'cancellation') && !input.orderId) {
    // BELIRSIZ ESLESMEDE kullanici mevcut siparisi secmeden islem yapilamaz.
    blockedBy.push('order_not_selected');
  }

  if (!input.operationalDecided) blockedBy.push('operational_review_pending');
  if (input.financialRequired && !input.financialDecided) blockedBy.push('financial_review_pending');

  return { allowed: blockedBy.length === 0, blockedBy };
}

/**
 * Insanin degistirdigi alanlar — `AutomationCorrectionEvent` icin.
 *
 * DEGER TASIMIYOR: yalnizca alan ADI ve degisip degismedigi. Belgeden okunan
 * tutar ve ad bu tabloya KOPYALANMAZ (bkz. schema.prisma) — deger gerekiyorsa
 * onerinin kendisine gidilir.
 */
export interface FieldCorrection {
  fieldName: string;
  fieldType: string;
  changed: boolean;
  category: 'accepted_as_is' | 'value_corrected' | 'field_added' | 'field_removed';
}

export function diffCorrections(
  proposed: Record<string, unknown>,
  finalValues: Record<string, unknown>,
): FieldCorrection[] {
  const names = new Set([...Object.keys(proposed), ...Object.keys(finalValues)]);
  const corrections: FieldCorrection[] = [];

  for (const fieldName of [...names].sort()) {
    const before = proposed[fieldName];
    const after = finalValues[fieldName];
    const hadBefore = before !== undefined && before !== null;
    const hasAfter = after !== undefined && after !== null;

    if (!hadBefore && !hasAfter) continue;

    let category: FieldCorrection['category'];
    if (!hadBefore && hasAfter) category = 'field_added';
    else if (hadBefore && !hasAfter) category = 'field_removed';
    else if (JSON.stringify(before) !== JSON.stringify(after)) category = 'value_corrected';
    else category = 'accepted_as_is';

    corrections.push({
      fieldName,
      fieldType: typeOf(hasAfter ? after : before),
      changed: category !== 'accepted_as_is',
      category,
    });
  }

  return corrections;
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
