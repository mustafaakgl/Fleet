import type {
  EffectiveAccountingStatus,
  FuelReceiptReviewDetail,
  FuelReversalReasonCode,
} from '@/lib/types';

/**
 * Ters kayit ekranlarinin SAF gorunum mantigi.
 *
 * Bilesenden ayri duruyor ki kurallar DOM olmadan sinanabilsin: "hangi fis
 * geri alinabilir", "maliyete giriyor mu", "aciklama gecerli mi" sorulari
 * render'a bagli olmamali.
 */

export const MIN_REVERSAL_REASON = 10;
export const MAX_REVERSAL_REASON = 500;

/**
 * Bu fis geri alinabilir mi.
 *
 * YALNIZCA etkili onayli kayit. Zaten geri alinmis bir fis icin dugmeyi acik
 * birakmak, kullaniciyi kaybedecegi bir istege sokmak olurdu; onaylanmamis
 * kayitta ise geri alinacak bir sey yok — o reddedilir.
 */
export function canReverse(detail: FuelReceiptReviewDetail | null): boolean {
  return detail?.effectiveAccountingStatus === 'approved_effective';
}

/** Bu kayit su anda maliyet toplamina giriyor mu. */
export function countsTowardCost(status: EffectiveAccountingStatus): boolean {
  return status === 'approved_effective';
}

/**
 * Durum rozetinin gorunumu.
 *
 * `tone` YALNIZCA renk degil: her rozetin ayri bir METNI var, cunku renk tek
 * basina durum anlatmamali (renk korlugu, yazdirma, yuksek kontrast).
 */
export interface StatusBadge {
  labelKey: string;
  tone: 'neutral' | 'positive' | 'warning' | 'danger';
  /** Maliyete dahil edilmeme aciklamasi — gerekmiyorsa null. */
  costNoteKey: string | null;
}

export function statusBadge(
  status: EffectiveAccountingStatus,
  isCorrection: boolean,
): StatusBadge {
  switch (status) {
    case 'reversed':
      return {
        labelKey: 'costs.fuelReceipts.reversal.badge',
        // "danger" DEGIL: ters kayit bir hata degil, bir duzeltmedir.
        // Saldirgan kirmizi, muhasebeciyi dogru bir islemden caydirir.
        tone: 'warning',
        costNoteKey: 'costs.fuelReceipts.reversal.notInTotals',
      };
    case 'approved_effective':
      return {
        labelKey: isCorrection
          ? 'costs.fuelReceipts.reversal.correctionBadge'
          : 'costs.fuelReceipts.status.approved',
        tone: 'positive',
        costNoteKey: null,
      };
    case 'submitted':
      return {
        labelKey: isCorrection
          ? 'costs.fuelReceipts.reversal.correctionBadge'
          : 'costs.fuelReceipts.status.submitted',
        tone: 'neutral',
        // Bekleyen duzeltme de toplamda YOK — kullanici bunu bilmeli.
        costNoteKey: 'costs.fuelReceipts.reversal.pendingNotInTotals',
      };
    case 'rejected':
      return {
        labelKey: 'costs.fuelReceipts.status.rejected',
        tone: 'danger',
        costNoteKey: 'costs.fuelReceipts.reversal.pendingNotInTotals',
      };
    default:
      return {
        labelKey: 'costs.fuelReceipts.status.driver_review',
        tone: 'neutral',
        costNoteKey: 'costs.fuelReceipts.reversal.pendingNotInTotals',
      };
  }
}

/** Aciklama gecerli mi — bosluk temizlenmis haliyle. */
export function isReversalReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= MIN_REVERSAL_REASON && trimmed.length <= MAX_REVERSAL_REASON;
}

/**
 * Ham backend kodu HICBIR dilde gosterilmez.
 *
 * Bilinmeyen kod genel mesaja duser: yeni bir sunucu kodu, kullaniciya
 * anlamsiz bir teknik dize olarak sizmamali.
 */
export function reversalErrorKey(code: string | null): string {
  switch (code) {
    case 'fuel_receipt_not_approved':
      return 'costs.fuelReceipts.reversal.errors.notApproved';
    case 'fuel_receipt_already_reversed':
      return 'costs.fuelReceipts.reversal.errors.alreadyReversed';
    case 'fuel_receipt_invalid_reversal_reason':
      return 'costs.fuelReceipts.reversal.errors.invalidReason';
    case 'fuel_receipt_reversal_conflict':
    case 'fuel_receipt_review_conflict':
      return 'costs.fuelReceipts.reversal.errors.conflict';
    case 'fuel_receipt_not_a_correction':
      return 'costs.fuelReceipts.reversal.errors.notACorrection';
    case 'fuel_receipt_correction_not_editable':
      return 'costs.fuelReceipts.reversal.errors.correctionNotEditable';
    case 'fuel_receipt_invalid':
      return 'costs.fuelReceipts.reversal.errors.invalidReceipt';
    case 'fuel_receipt_not_found':
      return 'costs.fuelReceipts.errors.notFound';
    default:
      return 'costs.fuelReceipts.reversal.errors.generic';
  }
}

/** Sebep kodunun ceviri anahtari. */
export function reasonLabelKey(code: FuelReversalReasonCode): string {
  return `costs.fuelReceipts.reversal.reason.${code}`;
}
