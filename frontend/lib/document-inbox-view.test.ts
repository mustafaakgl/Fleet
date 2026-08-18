import { describe, expect, it } from 'vitest';
import {
  LOW_CONFIDENCE,
  blockReasonKey,
  documentTypeLabelKey,
  formatPageRange,
  isLowConfidence,
  mergeSegments,
  needsAttention,
  planSummaryKey,
  requiresDriver,
  splitAt,
  statusTone,
  supportsSubtype,
  typeFamily,
  validateSegments,
} from './document-inbox-view';
import type { IntakeRoutingPlan } from './types';

/**
 * Ekranin kurallari (Faz 14).
 *
 * Bilesenden AYRI test ediliyor: "hangi satir vurgulanir", "kullanici neyi
 * onaylayamaz" gibi kararlar JSX'in icine gomulseydi ancak dolayli olarak
 * test edilebilirlerdi.
 */

describe('tur anahtari — surumsuz aile adi', () => {
  it('surumu ayirir', () => {
    expect(typeFamily('service_invoice@v1')).toBe('service_invoice');
    expect(documentTypeLabelKey('traffic_fine@v1')).toBe('documentInbox.type.traffic_fine');
  });

  it('surumsuz anahtar da bozulmaz', () => {
    expect(typeFamily('unknown')).toBe('unknown');
  });
});

describe('dusuk guven', () => {
  it('esik alti DUSUK', () => {
    expect(isLowConfidence(0.55)).toBe(true);
    expect(isLowConfidence(LOW_CONFIDENCE)).toBe(false);
  });

  it('BILINMIYORSA da dusuk sayilir — guvenmedigimiz seyi yesil gostermeyiz', () => {
    expect(isLowConfidence(null)).toBe(true);
    expect(isLowConfidence(undefined)).toBe(true);
  });
});

describe('vurgulama', () => {
  it('`unknown` tur DAIMA vurgulanir — guveni yuksek olsa bile', () => {
    expect(
      needsAttention({ typeKey: 'unknown@v1', confidence: 0.95, status: 'needs_review' }),
    ).toBe(true);
  });

  it('eksik bilgi ve basarisizlik vurgulanir', () => {
    expect(
      needsAttention({ typeKey: 'fuel_receipt@v1', confidence: 0.9, status: 'needs_domain_review' }),
    ).toBe(true);
    expect(
      needsAttention({ typeKey: 'fuel_receipt@v1', confidence: 0.9, status: 'failed' }),
    ).toBe(true);
  });

  it('guvenli ve tamam olan satir vurgulanmaz', () => {
    expect(
      needsAttention({ typeKey: 'service_invoice@v1', confidence: 0.91, status: 'needs_review' }),
    ).toBe(false);
  });

  it('durum tonlari ayrilir', () => {
    expect(statusTone('routed')).toBe('positive');
    expect(statusTone('rejected')).toBe('danger');
    expect(statusTone('needs_domain_review')).toBe('warning');
    expect(statusTone('needs_review')).toBe('neutral');
  });
});

describe('bolumleme dogrulamasi', () => {
  it('ortusen bolum REDDEDILIR', () => {
    expect(
      validateSegments([{ pageFrom: 1, pageTo: 3 }, { pageFrom: 3, pageTo: 5 }], 5),
    ).toBe('page_range_overlap');
  });

  it('bosluk SERBEST', () => {
    expect(
      validateSegments([{ pageFrom: 1, pageTo: 2 }, { pageFrom: 4, pageTo: 5 }], 5),
    ).toBeNull();
  });

  it('belge disina tasan bolum REDDEDILIR', () => {
    expect(validateSegments([{ pageFrom: 1, pageTo: 9 }], 5)).toBe('page_range_out_of_bounds');
  });

  it('ters aralik ve bos liste REDDEDILIR', () => {
    expect(validateSegments([{ pageFrom: 4, pageTo: 2 }], 5)).toBe('page_range_reversed');
    expect(validateSegments([], 5)).toBe('page_range_empty');
  });
});

describe('bolme ve birlestirme', () => {
  it('bolme iki ardisik parca uretir', () => {
    expect(splitAt({ pageFrom: 1, pageTo: 4 }, 3)).toEqual([
      { pageFrom: 1, pageTo: 2, typeKey: undefined },
      { pageFrom: 3, pageTo: 4, typeKey: undefined },
    ]);
  });

  it('sinirlarda bolme YAPILMAZ', () => {
    expect(splitAt({ pageFrom: 1, pageTo: 4 }, 1)).toBeNull();
    expect(splitAt({ pageFrom: 1, pageTo: 4 }, 5)).toBeNull();
  });

  it('yalnizca ARDISIK parcalar birlesir', () => {
    expect(mergeSegments({ pageFrom: 1, pageTo: 2 }, { pageFrom: 3, pageTo: 4 })).toEqual({
      pageFrom: 1,
      pageTo: 4,
      typeKey: undefined,
    });
    expect(mergeSegments({ pageFrom: 1, pageTo: 2 }, { pageFrom: 5, pageTo: 6 })).toBeNull();
  });

  it('sayfa etiketi tek sayfada kisa', () => {
    expect(formatPageRange(4, 4)).toBe('4');
    expect(formatPageRange(1, 3)).toBe('1-3');
  });
});

describe('"onaylandiginda ne olacak" ozeti', () => {
  const plan = (overrides: Partial<IntakeRoutingPlan>): IntakeRoutingPlan => ({
    typeKey: 'service_invoice@v1',
    destination: 'ordivan.service_invoice',
    createsEntityType: 'AutomationJob',
    entersOwnReviewQueue: true,
    offersReminder: false,
    reminderAvailable: false,
    canRoute: true,
    blockedBy: [],
    ...overrides,
  });

  it('KENDI incelemesi olan hedef icin BASKA cumle kullanilir', () => {
    expect(planSummaryKey(plan({}))).toBe(
      'documentInbox.plan.review.ordivan.service_invoice',
    );
    expect(
      planSummaryKey(
        plan({ destination: 'fine.record', entersOwnReviewQueue: false }),
      ),
    ).toBe('documentInbox.plan.direct.fine.record');
  });

  it('hedefi olmayan tur icin "hicbir sey olusmaz" denir', () => {
    expect(planSummaryKey(plan({ destination: null }))).toBe('documentInbox.plan.none');
  });

  it('engel sebepleri i18n anahtarina cevrilir', () => {
    expect(blockReasonKey('driver_required')).toBe('documentInbox.blocked.driver_required');
  });
});

describe('tur bazli alan kurallari', () => {
  it('alt tur YALNIZCA muayenede', () => {
    expect(supportsSubtype('vehicle_inspection@v1')).toBe(true);
    expect(supportsSubtype('vehicle_insurance@v1')).toBe(false);
  });

  it('surucu YALNIZCA yakit fisinde zorunlu', () => {
    expect(requiresDriver('fuel_receipt@v1')).toBe(true);
    expect(requiresDriver('traffic_fine@v1')).toBe(false);
  });
});
