import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  LOW_CONFIDENCE_THRESHOLD,
  canSubmit,
  formFromExtraction,
  formWarnings,
  fuelReceiptErrorKey,
  isFuelMismatch,
  isLowConfidence,
  ocrErrorKey,
  parseDecimal,
  toConfirmPayload,
  toDateTimeLocal,
} from './fuel-receipt-view';
import type { FuelReceiptExtraction } from './types';

function field<T>(value: T | null, confidence: number | null = 0.95) {
  return { value, confidence };
}

function extraction(overrides: Partial<FuelReceiptExtraction> = {}): FuelReceiptExtraction {
  return {
    stationName: field('Aral Duisburg'),
    stationAddress: field('Hafenstraße 12'),
    receiptNumber: field('RG-1'),
    purchasedAt: field('2026-08-13T08:42:00.000Z'),
    fuelProduct: field('DIESEL'),
    rawFuelLabel: null,
    liters: field(62.35),
    pricePerLiter: field(1.719),
    fuelGrossAmount: field(107.18),
    receiptGrossAmount: field(107.18),
    receiptNetAmount: field(90.07),
    receiptVatAmount: field(17.11),
    receiptVatRate: field(19),
    currency: field('EUR'),
    paymentMethod: field('Firmenkarte'),
    odometerKm: field(null),
    plateNumber: field('DU-AB 123'),
    hasNonFuelItems: false,
    ...overrides,
  } as FuelReceiptExtraction;
}

describe('isLowConfidence', () => {
  it('flags values below the threshold', () => {
    expect(isLowConfidence(0.35)).toBe(true);
    expect(isLowConfidence(LOW_CONFIDENCE_THRESHOLD - 0.01)).toBe(true);
  });

  it('does not flag a high confidence value', () => {
    expect(isLowConfidence(0.95)).toBe(false);
    expect(isLowConfidence(LOW_CONFIDENCE_THRESHOLD)).toBe(false);
  });

  it('does not treat "not measured" as "not sure"', () => {
    // null = saglayici guven bildirmedi. Hepsini kirmiziya boyamak uyariyi
    // anlamsizlastirir ve surucu bir sure sonra hicbirine bakmaz.
    expect(isLowConfidence(null)).toBe(false);
    expect(isLowConfidence(undefined)).toBe(false);
  });
});

describe('formFromExtraction', () => {
  it('fills the form from the draft', () => {
    const values = formFromExtraction(extraction());
    expect(values.stationName).toBe('Aral Duisburg');
    expect(values.liters).toBe('62.35');
    expect(values.fuelGrossAmount).toBe('107.18');
    expect(values.currency).toBe('EUR');
  });

  it('leaves the fuel empty when the label could not be mapped', () => {
    // "SUPER" yazan bir fisi E5 mi E10 mu diye TAHMIN ETMIYORUZ.
    const values = formFromExtraction(
      extraction({ fuelProduct: field(null, null), rawFuelLabel: 'SUPER' }),
    );
    expect(values.fuelProduct).toBe('');
  });

  it('returns an empty form when there is no extraction at all', () => {
    // OCR kapali ya da basarisiz: form ELLE doldurulabilir halde acilir.
    expect(formFromExtraction(null)).toEqual(EMPTY_FORM);
  });

  it('keeps fuel total and receipt total apart on a mixed receipt', () => {
    const values = formFromExtraction(
      extraction({
        fuelGrossAmount: field(88.4),
        receiptGrossAmount: field(95.6),
        hasNonFuelItems: true,
      }),
    );
    expect(values.fuelGrossAmount).toBe('88.4');
    expect(values.receiptGrossAmount).toBe('95.6');
  });
});

describe('parseDecimal', () => {
  it('reads a German decimal comma', () => {
    // Number('62,35') NaN verirdi ve tutar sessizce kaybolurdu.
    expect(parseDecimal('62,35')).toBe(62.35);
    expect(parseDecimal('1 234,5')).toBe(1234.5);
  });

  it('reads a plain dot decimal and rejects junk', () => {
    expect(parseDecimal('107.18')).toBe(107.18);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
});

describe('formWarnings', () => {
  const base = { ...EMPTY_FORM, liters: '62.35', pricePerLiter: '1.719', fuelGrossAmount: '107.18' };

  it('tolerates pump rounding', () => {
    // 62,35 x 1,719 = 107,178… fiste 107,18 — DOGRU sayilmali.
    expect(formWarnings(base)).toEqual([]);
  });

  it('warns on a real unit price mismatch', () => {
    expect(formWarnings({ ...base, fuelGrossAmount: '90' })).toContain('unit_price_mismatch');
  });

  it('warns when net plus vat does not add up', () => {
    const warnings = formWarnings({
      ...base,
      receiptGrossAmount: '107.18',
      receiptNetAmount: '50',
      receiptVatAmount: '10',
    });
    expect(warnings).toContain('vat_breakdown_mismatch');
  });

  it('warns when the receipt total is below the fuel total', () => {
    const warnings = formWarnings({ ...base, receiptGrossAmount: '50' });
    expect(warnings).toContain('receipt_total_below_fuel_total');
  });
});

describe('canSubmit', () => {
  const filled = {
    ...EMPTY_FORM,
    purchasedAt: '2026-08-13T10:00',
    fuelProduct: 'DIESEL' as const,
    liters: '62.35',
    fuelGrossAmount: '107.18',
    currency: 'EUR',
  };

  it('requires the fields the backend also requires', () => {
    expect(canSubmit(filled)).toBe(true);
    expect(canSubmit({ ...filled, fuelProduct: '' })).toBe(false);
    expect(canSubmit({ ...filled, liters: '0' })).toBe(false);
    expect(canSubmit({ ...filled, fuelGrossAmount: '' })).toBe(false);
    expect(canSubmit({ ...filled, purchasedAt: '' })).toBe(false);
  });
});

describe('toConfirmPayload', () => {
  const values = {
    ...EMPTY_FORM,
    purchasedAt: '2026-08-13T10:00',
    fuelProduct: 'DIESEL' as const,
    liters: '62,35',
    fuelGrossAmount: '107,18',
    currency: 'eur',
  };

  it('sends only allowed canonical fields', () => {
    const payload = toConfirmPayload(values) as unknown as Record<string, unknown>;

    expect(payload.liters).toBe(62.35);
    expect(payload.currency).toBe('EUR');
    // Sahiplik ve is akisi alanlari GONDERILMEZ — backend zaten 400 doner.
    for (const forbidden of ['driverId', 'vehicleId', 'tenantId', 'workflowStatus', 'ocrStatus']) {
      expect(payload[forbidden]).toBeUndefined();
    }
  });

  it('omits empty optional fields instead of sending zeros', () => {
    const payload = toConfirmPayload(values);
    expect(payload.pricePerLiter).toBeUndefined();
    expect(payload.odometerKm).toBeUndefined();
    expect(payload.stationName).toBeUndefined();
  });

  it('adds the acknowledgement only when asked', () => {
    expect(toConfirmPayload(values).acknowledgeFuelMismatch).toBeUndefined();
    expect(
      toConfirmPayload(values, { acknowledgeFuelMismatch: true }).acknowledgeFuelMismatch,
    ).toBe(true);
  });
});

describe('isFuelMismatch', () => {
  it('detects a fuel outside the vehicle approval', () => {
    expect(isFuelMismatch('SUPER_E10', ['DIESEL'])).toBe(true);
    expect(isFuelMismatch('DIESEL', ['DIESEL'])).toBe(false);
  });

  it('claims no mismatch when the approval list is unknown', () => {
    // Bilinmeyeni ihlal saymak, surucuyu olmayan bir hatayla durdurmak olurdu.
    expect(isFuelMismatch('DIESEL', null)).toBe(false);
    expect(isFuelMismatch('DIESEL', [])).toBe(false);
    expect(isFuelMismatch('', ['DIESEL'])).toBe(false);
  });
});

describe('error mapping', () => {
  it('maps every backend code to a translation key, never the raw code', () => {
    const codes = [
      'receipt_file_missing',
      'receipt_file_too_large',
      'receipt_file_type_unsupported',
      'fueling_intent_not_found',
      'fueling_intent_not_linkable',
      'fueling_intent_already_settled',
      'fuel_receipt_not_found',
      'fuel_receipt_not_editable',
      'fuel_receipt_invalid',
      'fuel_product_not_compatible',
    ];
    for (const code of codes) {
      const key = fuelReceiptErrorKey(code);
      expect(key, code).toBeTruthy();
      expect(key).not.toContain(code);
      expect(key).toMatch(/^driverPortal\./);
    }
  });

  it('falls back to null for an unknown code', () => {
    expect(fuelReceiptErrorKey('brand_new_backend_code')).toBeNull();
    expect(fuelReceiptErrorKey(null)).toBeNull();
  });

  it('turns an OCR error class into a plain sentence', () => {
    expect(ocrErrorKey('not_configured')).toBe('driverPortal.fuelReceipts.ocr.notConfigured');
    expect(ocrErrorKey('unreadable')).toBe('driverPortal.fuelReceipts.ocr.unreadable');
    // Taninmayan sinif bile teknik ayrinti sizdirmiyor.
    expect(ocrErrorKey('some_provider_specific_thing')).toBe(
      'driverPortal.fuelReceipts.ocr.failedGeneric',
    );
  });
});

describe('toDateTimeLocal', () => {
  it('drops seconds and timezone for the datetime-local input', () => {
    expect(toDateTimeLocal('2026-08-13T08:42:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns empty for a missing or unparseable value', () => {
    expect(toDateTimeLocal(null)).toBe('');
    expect(toDateTimeLocal('not-a-date')).toBe('');
  });
});
