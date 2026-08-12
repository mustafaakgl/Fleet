import { describe, expect, it } from 'vitest';
import de from '@/src/locales/de/common.json';
import en from '@/src/locales/en/common.json';
import tr from '@/src/locales/tr/common.json';
import {
  ADDITIVE_PRODUCTS,
  FUEL_COMPATIBILITY_ERROR_CODES,
  FUEL_PRODUCT_TYPES,
  PRIMARY_PRODUCTS,
  UI_COMPATIBILITY_SOURCE,
  buildCompatibilityPayload,
  extractErrorCode,
  fuelCompatibilityErrorKey,
  fuelProductLabelKey,
  fuelSourceLabelKey,
  fuelUsageLabelKey,
  isAdditiveProduct,
  isKnownFuelProduct,
  previewCompatibleProducts,
  selectionFromEntries,
  validateSelections,
  type FuelCompatibilitySelection,
} from './fuel-compatibility';
import type { VehicleFuelCompatibilityEntry } from './types';

function selection(
  overrides: Partial<FuelCompatibilitySelection> = {},
): FuelCompatibilitySelection {
  return {
    productType: 'DIESEL',
    usageType: 'PRIMARY',
    approved: true,
    source: 'MANUFACTURER',
    ...overrides,
  };
}

function serverEntry(
  overrides: Partial<VehicleFuelCompatibilityEntry> = {},
): VehicleFuelCompatibilityEntry {
  return {
    id: 'cmp-1',
    productType: 'DIESEL',
    usageType: 'PRIMARY',
    approved: true,
    source: 'MANUFACTURER',
    verifiedAt: null,
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-12T08:00:00.000Z',
    ...overrides,
  };
}

describe('product grouping', () => {
  it('keeps AdBlue out of the main fuel group', () => {
    expect(PRIMARY_PRODUCTS).not.toContain('ADBLUE');
    expect(ADDITIVE_PRODUCTS).toEqual(['ADBLUE']);
    expect(isAdditiveProduct('ADBLUE')).toBe(true);
    expect(isAdditiveProduct('DIESEL')).toBe(false);
  });

  it('offers every other schema product as a main fuel', () => {
    // Sema'ya yeni urun eklendiginde bu test onu gruplardan birine koymaya
    // zorlar; sessizce arayuzden dusmez.
    const grouped = [...PRIMARY_PRODUCTS, ...ADDITIVE_PRODUCTS].sort();
    expect(grouped).toEqual([...FUEL_PRODUCT_TYPES].sort());
  });

  it('recognises schema products and rejects unknown ones', () => {
    expect(isKnownFuelProduct('HVO100')).toBe(true);
    expect(isKnownFuelProduct('SOMETHING_NEW')).toBe(false);
  });
});

describe('buildCompatibilityPayload', () => {
  it('produces exactly the fields the backend DTO accepts', () => {
    const payload = buildCompatibilityPayload([selection()]);

    expect(payload).toEqual([
      { productType: 'DIESEL', usageType: 'PRIMARY', approved: true, source: 'MANUFACTURER' },
    ]);
  });

  it('collapses a repeated product/usage pair into one entry', () => {
    // Backend'de benzersiz kisit var (tenantId+vehicleId+productType+usageType);
    // iki kez gondermek duplicate_fuel_compatibility_entry ile 400 olurdu.
    const payload = buildCompatibilityPayload([selection(), selection()]);

    expect(payload).toHaveLength(1);
  });

  it('keeps the same product under two different usages', () => {
    const payload = buildCompatibilityPayload([
      selection({ usageType: 'PRIMARY' }),
      selection({ usageType: 'ALTERNATIVE' }),
    ]);

    expect(payload).toHaveLength(2);
  });

  it('only sends verifiedAt when the entry actually has one', () => {
    const withDate = buildCompatibilityPayload([
      selection({ verifiedAt: '2026-08-01T00:00:00.000Z' }),
    ]);
    const withoutDate = buildCompatibilityPayload([selection()]);

    expect(withDate[0]!.verifiedAt).toBe('2026-08-01T00:00:00.000Z');
    expect('verifiedAt' in withoutDate[0]!).toBe(false);
  });

  it('round-trips server entries without losing usage or source', () => {
    const entries = [
      serverEntry({ productType: 'DIESEL', usageType: 'ALTERNATIVE', source: 'VIN' }),
      serverEntry({ id: 'cmp-2', productType: 'ADBLUE', usageType: 'ADDITIVE', source: 'IMPORTED' }),
    ];

    const payload = buildCompatibilityPayload(selectionFromEntries(entries));

    expect(payload).toEqual([
      { productType: 'DIESEL', usageType: 'ALTERNATIVE', approved: true, source: 'VIN' },
      { productType: 'ADBLUE', usageType: 'ADDITIVE', approved: true, source: 'IMPORTED' },
    ]);
  });

  it('preserves an unknown product instead of dropping it', () => {
    const entries = [
      serverEntry({ productType: 'SOMETHING_NEW' as VehicleFuelCompatibilityEntry['productType'] }),
    ];

    expect(buildCompatibilityPayload(selectionFromEntries(entries))).toHaveLength(1);
  });

  it('uses ADMIN as the source for anything entered through this screen', () => {
    expect(UI_COMPATIBILITY_SOURCE).toBe('ADMIN');
  });
});

describe('validateSelections', () => {
  it('accepts a plain diesel vehicle', () => {
    expect(validateSelections([selection()])).toBeNull();
  });

  it('accepts an empty set — the backend treats it as "undefined again"', () => {
    // Burada uydurma bir "en az bir ana yakit" kurali OLMAMALI: backend bos
    // diziyi acikca gecerli sayiyor, aksi halde yanlis girilmis bir set
    // temizlenemezdi.
    expect(validateSelections([])).toBeNull();
  });

  it('rejects AdBlue as a main fuel', () => {
    expect(validateSelections([selection({ productType: 'ADBLUE', usageType: 'PRIMARY' })])).toBe(
      'adblue_must_be_additive',
    );
  });

  it('rejects ADDITIVE usage for a real fuel', () => {
    expect(validateSelections([selection({ usageType: 'ADDITIVE' })])).toBe(
      'additive_usage_only_for_adblue',
    );
  });

  it('rejects a duplicate product/usage pair', () => {
    expect(validateSelections([selection(), selection()])).toBe(
      'duplicate_fuel_compatibility_entry',
    );
  });
});

describe('previewCompatibleProducts', () => {
  it('mirrors the backend filter: approved PRIMARY/ALTERNATIVE only', () => {
    const products = previewCompatibleProducts([
      selection({ productType: 'DIESEL', usageType: 'PRIMARY' }),
      selection({ productType: 'SUPER_E5', usageType: 'ALTERNATIVE' }),
      selection({ productType: 'ADBLUE', usageType: 'ADDITIVE' }),
      selection({ productType: 'HVO100', approved: false }),
    ]);

    expect(products).toEqual(['DIESEL', 'SUPER_E5']);
  });

  it('never infers one product from another', () => {
    // E10 onayi E5'i, dizel onayi HVO100'u ima ETMEZ.
    expect(previewCompatibleProducts([selection({ productType: 'SUPER_E10' })])).toEqual([
      'SUPER_E10',
    ]);
    expect(previewCompatibleProducts([selection({ productType: 'DIESEL' })])).toEqual(['DIESEL']);
  });
});

describe('error code mapping', () => {
  it('reads a top-level code (the shape production returns)', () => {
    expect(extractErrorCode({ response: { data: { code: 'adblue_must_be_additive' } } })).toBe(
      'adblue_must_be_additive',
    );
  });

  it('reads a nested details.code (the shape development returns)', () => {
    expect(
      extractErrorCode({ response: { data: { details: { code: 'duplicate_fuel_compatibility_entry' } } } }),
    ).toBe('duplicate_fuel_compatibility_entry');
  });

  it('returns null when there is no code at all', () => {
    expect(extractErrorCode({ response: { data: { message: 'Bad Request' } } })).toBeNull();
    expect(extractErrorCode(new Error('network'))).toBeNull();
    expect(extractErrorCode(undefined)).toBeNull();
  });

  it('maps every known backend code to a translation key', () => {
    for (const code of FUEL_COMPATIBILITY_ERROR_CODES) {
      const key = fuelCompatibilityErrorKey({ response: { data: { code } } });
      expect(key, `${code} must map to a key`).toBeTruthy();
      // Ham kod kullaniciya gitmemeli: anahtar kodun kendisi OLAMAZ.
      expect(key).not.toBe(code);
    }
  });

  it('covers the codes the backend service can actually throw', () => {
    // Kaynak: backend/src/fleet/fuel-stations/vehicle-fuel-compatibility.service.ts
    for (const code of [
      'adblue_must_be_additive',
      'additive_usage_only_for_adblue',
      'duplicate_fuel_compatibility_entry',
      'vehicle_not_found',
    ]) {
      expect(FUEL_COMPATIBILITY_ERROR_CODES).toContain(code);
    }
  });

  it('falls back to null for an unmapped code so the generic message is used', () => {
    expect(fuelCompatibilityErrorKey({ response: { data: { code: 'brand_new_code' } } })).toBeNull();
  });
});

describe('translation completeness across de/en/tr', () => {
  const locales: Array<[string, Record<string, unknown>]> = [
    ['de', de as Record<string, unknown>],
    ['en', en as Record<string, unknown>],
    ['tr', tr as Record<string, unknown>],
  ];

  /** Bilesenin ve saf mantigin kullandigi TUM anahtarlar. */
  const requiredKeys = [
    'vehicleDetail.fuelCompatibility.title',
    'vehicleDetail.fuelCompatibility.subtitle',
    'vehicleDetail.fuelCompatibility.empty',
    'vehicleDetail.fuelCompatibility.edit',
    'vehicleDetail.fuelCompatibility.save',
    'vehicleDetail.fuelCompatibility.saving',
    'vehicleDetail.fuelCompatibility.cancel',
    'vehicleDetail.fuelCompatibility.retry',
    'vehicleDetail.fuelCompatibility.saveSuccess',
    'vehicleDetail.fuelCompatibility.saveError',
    'vehicleDetail.fuelCompatibility.loadError',
    'vehicleDetail.fuelCompatibility.primaryGroup',
    'vehicleDetail.fuelCompatibility.primaryGroupHint',
    'vehicleDetail.fuelCompatibility.additiveGroup',
    'vehicleDetail.fuelCompatibility.additiveGroupHint',
    'vehicleDetail.fuelCompatibility.otherGroup',
    'vehicleDetail.fuelCompatibility.otherGroupHint',
    'vehicleDetail.fuelCompatibility.usageLabel',
    'vehicleDetail.fuelCompatibility.sourceLabel',
    'vehicleDetail.fuelCompatibility.notApproved',
    'vehicleDetail.fuelCompatibility.noAdditives',
    'vehicleDetail.fuelCompatibility.noPrimaryWarning',
    ...FUEL_PRODUCT_TYPES.map((product) => fuelProductLabelKey(product)),
    ...(['PRIMARY', 'ALTERNATIVE', 'ADDITIVE'] as const).map((usage) => fuelUsageLabelKey(usage)),
    ...(['MANUFACTURER', 'VIN', 'ADMIN', 'IMPORTED'] as const).map((source) =>
      fuelSourceLabelKey(source),
    ),
  ];

  for (const [lang, bundle] of locales) {
    it(`${lang} has every fuel compatibility key with a non-empty value`, () => {
      const missing = requiredKeys.filter((key) => {
        const value = bundle[key];
        return typeof value !== 'string' || value.trim() === '';
      });

      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${lang} translates every mapped error code`, () => {
      const errorKeys = FUEL_COMPATIBILITY_ERROR_CODES.map((code) =>
        fuelCompatibilityErrorKey({ response: { data: { code } } }),
      );

      for (const key of errorKeys) {
        expect(typeof bundle[key!], `${lang} missing ${key}`).toBe('string');
        expect((bundle[key!] as string).trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('uses a different wording per language (no copy-paste placeholder)', () => {
    // Ayni metnin uc dile kopyalanmasi "cevrildi" gorunur ama cevrilmemistir.
    const key = 'vehicleDetail.fuelCompatibility.empty';
    const values = locales.map(([, bundle]) => bundle[key] as string);
    expect(new Set(values).size).toBe(3);
  });

  it('keeps the German product labels in German market wording', () => {
    const bundle = de as Record<string, string>;
    expect(bundle['vehicleDetail.fuelCompatibility.title']).toBe('Kraftstofffreigaben');
    expect(bundle['vehicleDetail.fuelCompatibility.usages.PRIMARY']).toBe('Hauptkraftstoff');
    expect(bundle['vehicleDetail.fuelCompatibility.products.ELECTRICITY']).toBe('Strom');
  });
});
