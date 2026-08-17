import { describe, expect, it } from 'vitest';
import {
  MIN_REVERSAL_REASON,
  canReverse,
  countsTowardCost,
  isReversalReasonValid,
  reasonLabelKey,
  reversalErrorKey,
  statusBadge,
} from './fuel-reversal-view';
import { FUEL_REVERSAL_REASONS, type FuelReceiptReviewDetail } from './types';

function detail(overrides: Partial<FuelReceiptReviewDetail> = {}) {
  return {
    effectiveAccountingStatus: 'approved_effective',
    reversal: null,
    correctionOf: null,
    ...overrides,
  } as FuelReceiptReviewDetail;
}

describe('ters kayit yapilabilirligi', () => {
  it('etkili onayli fis geri alinabilir', () => {
    expect(canReverse(detail())).toBe(true);
  });

  it('ZATEN geri alinmis fis tekrar geri alinamaz', () => {
    expect(canReverse(detail({ effectiveAccountingStatus: 'reversed' }))).toBe(false);
  });

  it('onaylanmamis fis geri alinamaz', () => {
    for (const status of ['submitted', 'rejected', 'driver_review'] as const) {
      expect(canReverse(detail({ effectiveAccountingStatus: status }))).toBe(false);
    }
  });

  it('kayit yuklenmemisken dugme acilmaz', () => {
    expect(canReverse(null)).toBe(false);
  });
});

describe('maliyete dahil olma', () => {
  it('yalnizca etkili onayli kayit maliyete girer', () => {
    expect(countsTowardCost('approved_effective')).toBe(true);
    expect(countsTowardCost('reversed')).toBe(false);
    expect(countsTowardCost('submitted')).toBe(false);
    expect(countsTowardCost('rejected')).toBe(false);
  });
});

describe('durum rozeti', () => {
  it('ters kayit rozeti maliyet aciklamasi tasir', () => {
    const badge = statusBadge('reversed', false);
    expect(badge.labelKey).toBe('costs.fuelReceipts.reversal.badge');
    expect(badge.costNoteKey).toBe('costs.fuelReceipts.reversal.notInTotals');
  });

  it('ters kayit SALDIRGAN kirmizi degil', () => {
    // Ters kayit bir hata degil, bir duzeltme. Kirmizi rozet muhasebeciyi
    // dogru bir islemden caydirirdi.
    expect(statusBadge('reversed', false).tone).toBe('warning');
  });

  it('onayli kayitta maliyet aciklamasi GEREKMEZ', () => {
    expect(statusBadge('approved_effective', false).costNoteKey).toBeNull();
  });

  it('duzeltme kaydi kendi etiketini alir', () => {
    expect(statusBadge('submitted', true).labelKey).toBe(
      'costs.fuelReceipts.reversal.correctionBadge',
    );
  });

  it('bekleyen duzeltme de toplama dahil DEGIL', () => {
    expect(statusBadge('submitted', true).costNoteKey).toBe(
      'costs.fuelReceipts.reversal.pendingNotInTotals',
    );
  });

  it('her rozetin bir METNI var — renk tek basina anlam tasimiyor', () => {
    for (const status of [
      'approved_effective',
      'reversed',
      'submitted',
      'rejected',
      'driver_review',
    ] as const) {
      expect(statusBadge(status, false).labelKey.length).toBeGreaterThan(0);
    }
  });
});

describe('aciklama dogrulamasi', () => {
  it('bos aciklama gecersiz', () => {
    expect(isReversalReasonValid('')).toBe(false);
  });

  it('YALNIZCA bosluktan olusan aciklama gecersiz', () => {
    expect(isReversalReasonValid('              ')).toBe(false);
  });

  it('cok kisa aciklama gecersiz', () => {
    expect(isReversalReasonValid('hata')).toBe(false);
  });

  it('makul aciklama gecerli', () => {
    expect(isReversalReasonValid('Tutar fisle uyusmuyor, yeniden girilecek.')).toBe(true);
  });

  it('bastaki bosluk uzunlugu SISIRMEZ', () => {
    const padded = ' '.repeat(50) + 'kisa';
    expect(isReversalReasonValid(padded)).toBe(false);
  });

  it('alt sinir makul', () => {
    expect(MIN_REVERSAL_REASON).toBeGreaterThanOrEqual(5);
  });
});

describe('hata kodu cevirisi', () => {
  it('bilinen kodlar kendi mesajina cevrilir', () => {
    expect(reversalErrorKey('fuel_receipt_already_reversed')).toBe(
      'costs.fuelReceipts.reversal.errors.alreadyReversed',
    );
    expect(reversalErrorKey('fuel_receipt_not_approved')).toBe(
      'costs.fuelReceipts.reversal.errors.notApproved',
    );
    expect(reversalErrorKey('fuel_receipt_reversal_conflict')).toBe(
      'costs.fuelReceipts.reversal.errors.conflict',
    );
  });

  it('bilinmeyen kod genel mesaja duser — HAM KOD sizmaz', () => {
    const key = reversalErrorKey('internal_db_failure');
    expect(key).toBe('costs.fuelReceipts.reversal.errors.generic');
    expect(key).not.toContain('internal_db_failure');
  });

  it('kod hic yoksa da genel mesaj doner', () => {
    expect(reversalErrorKey(null)).toBe('costs.fuelReceipts.reversal.errors.generic');
  });
});

describe('sebep kodlari', () => {
  it('yedi sebep kodu tanimli', () => {
    expect(FUEL_REVERSAL_REASONS).toHaveLength(7);
  });

  it('her sebep kodunun bir ceviri anahtari var', () => {
    for (const code of FUEL_REVERSAL_REASONS) {
      expect(reasonLabelKey(code)).toBe(`costs.fuelReceipts.reversal.reason.${code}`);
    }
  });
});
