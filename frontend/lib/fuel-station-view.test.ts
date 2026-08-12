import { describe, expect, it } from 'vitest';
import de from '@/src/locales/de/common.json';
import en from '@/src/locales/en/common.json';
import tr from '@/src/locales/tr/common.json';
import {
  DEFAULT_FUEL_STATION_RADIUS_KM,
  FUEL_STATION_ERROR_CODES,
  FUEL_STATION_RADIUS_OPTIONS,
  cheapestStationId,
  extractApiErrorCode,
  formatDistance,
  formatPricePerLiter,
  formatRetrievedAt,
  formatStationAddress,
  fuelStationErrorKey,
  geolocationErrorKey,
  nearestStationId,
  priceFor,
  selectableProducts,
  sortStations,
  visibleOfferings,
} from './fuel-station-view';
import {
  POSITION_MAX_AGE_MS,
  isPositionFresh,
  resetDriverPositionCache,
  rememberDriverPosition,
  resolveDriverPosition,
} from './driver-geolocation';
import type { FuelProductType, NearbyFuelStation } from './types';

function offering(productType: FuelProductType, pricePerUnit: number | null) {
  return { productType, pricePerUnit, unit: 'liter' as const, currency: 'EUR' as const, updatedAt: null };
}

function station(
  id: string,
  overrides: Partial<NearbyFuelStation> = {},
): NearbyFuelStation {
  return {
    id,
    provider: 'mock',
    name: `Station ${id}`,
    brand: 'ARAL',
    address: { street: 'Hafenstraße', houseNumber: '12', postalCode: '47059', city: 'Duisburg' },
    latitude: 51.44,
    longitude: 6.76,
    distanceKm: 2,
    isOpen: true,
    pricesUpdatedAt: null,
    retrievedAt: '2026-08-12T12:32:00.000Z',
    hgvAccess: 'unknown',
    acceptedFuelCards: null,
    offerings: [offering('DIESEL', 1.759)],
    ...overrides,
  };
}

describe('radius options', () => {
  it('offers 5, 10, 15 and 25 km with 10 as the default', () => {
    expect([...FUEL_STATION_RADIUS_OPTIONS]).toEqual([5, 10, 15, 25]);
    expect(DEFAULT_FUEL_STATION_RADIUS_KM).toBe(10);
  });

  it('stays within the radius the backend accepts', () => {
    // Backend DTO'su 1..25 km kabul ediyor; disina cikan bir secenek 400 uretirdi.
    for (const option of FUEL_STATION_RADIUS_OPTIONS) {
      expect(option).toBeGreaterThanOrEqual(1);
      expect(option).toBeLessThanOrEqual(25);
    }
  });
});

describe('sortStations', () => {
  it('sorts by distance by default and puts unknown distance last', () => {
    const sorted = sortStations(
      [
        station('far', { distanceKm: 9 }),
        station('unknown', { distanceKm: null }),
        station('near', { distanceKm: 1.2 }),
      ],
      'distance',
      null,
    );

    expect(sorted.map((s) => s.id)).toEqual(['near', 'far', 'unknown']);
  });

  it('sorts by price for the selected fuel', () => {
    const sorted = sortStations(
      [
        station('expensive', { offerings: [offering('DIESEL', 1.899)] }),
        station('cheap', { offerings: [offering('DIESEL', 1.649)] }),
      ],
      'price',
      'DIESEL',
    );

    expect(sorted.map((s) => s.id)).toEqual(['cheap', 'expensive']);
  });

  it('uses the selected fuel, not just any price', () => {
    // E10 secildiginde dizel fiyati siralamayi belirlememeli.
    const sorted = sortStations(
      [
        station('a', { offerings: [offering('DIESEL', 1.0), offering('SUPER_E10', 1.9)] }),
        station('b', { offerings: [offering('DIESEL', 2.0), offering('SUPER_E10', 1.7)] }),
      ],
      'price',
      'SUPER_E10',
    );

    expect(sorted.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('pushes stations without a price to the end of a price sort', () => {
    const sorted = sortStations(
      [
        station('nopricehere', { offerings: [offering('DIESEL', null)] }),
        station('priced', { offerings: [offering('DIESEL', 1.799)] }),
      ],
      'price',
      'DIESEL',
    );

    expect(sorted.map((s) => s.id)).toEqual(['priced', 'nopricehere']);
  });

  it('breaks ties deterministically', () => {
    // Ayni fiyat + ayni mesafe: siralama iki cagri arasinda ZIPLAMAMALI.
    const input = [
      station('bbb', { distanceKm: 3, offerings: [offering('DIESEL', 1.7)] }),
      station('aaa', { distanceKm: 3, offerings: [offering('DIESEL', 1.7)] }),
    ];

    expect(sortStations(input, 'price', 'DIESEL').map((s) => s.id)).toEqual(['aaa', 'bbb']);
    expect(sortStations([...input].reverse(), 'price', 'DIESEL').map((s) => s.id)).toEqual([
      'aaa',
      'bbb',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [station('b', { distanceKm: 5 }), station('a', { distanceKm: 1 })];
    sortStations(input, 'distance', null);
    expect(input.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('nearest and cheapest labels', () => {
  it('marks only the truly closest station', () => {
    const stations = [
      station('a', { distanceKm: 4 }),
      station('b', { distanceKm: 0.9 }),
      station('c', { distanceKm: 12 }),
    ];
    expect(nearestStationId(stations)).toBe('b');
  });

  it('ignores stations without a distance when picking the nearest', () => {
    expect(nearestStationId([station('x', { distanceKm: null })])).toBeNull();
  });

  it('marks only the truly cheapest station for the selected fuel', () => {
    const stations = [
      station('a', { offerings: [offering('DIESEL', 1.799)] }),
      station('b', { offerings: [offering('DIESEL', 1.699)] }),
      station('c', { offerings: [offering('DIESEL', null)] }),
    ];
    expect(cheapestStationId(stations, 'DIESEL')).toBe('b');
  });

  it('never labels a station without a price as cheapest', () => {
    const stations = [
      station('nopriceA', { offerings: [offering('DIESEL', null)] }),
      station('nopriceB', { offerings: [offering('DIESEL', null)] }),
    ];
    expect(cheapestStationId(stations, 'DIESEL')).toBeNull();
  });

  it('gives no cheapest label when no fuel is selected', () => {
    // "En ucuz" hangi urun icin oldugu belirsizken anlamsizdir.
    expect(cheapestStationId([station('a')], null)).toBeNull();
  });

  it('resolves a cheapest tie deterministically', () => {
    const stations = [
      station('zzz', { offerings: [offering('DIESEL', 1.7)] }),
      station('aaa', { offerings: [offering('DIESEL', 1.7)] }),
    ];
    expect(cheapestStationId(stations, 'DIESEL')).toBe('aaa');
    expect(cheapestStationId([...stations].reverse(), 'DIESEL')).toBe('aaa');
  });
});

describe('formatting', () => {
  it('formats a German litre price with three decimals', () => {
    // Almanya'da yakit fiyati uc ondalikla ilan edilir; 2 haneye yuvarlamak
    // gercek fiyati yanlis gosterir.
    expect(formatPricePerLiter(1.759, 'de')).toBe('1,759 €/l');
  });

  it('formats an English litre price with a dot', () => {
    expect(formatPricePerLiter(1.759, 'en')).toBe('1.759 €/l');
  });

  it('never renders a raw float', () => {
    const formatted = formatPricePerLiter(1.7589999999, 'de');
    expect(formatted).not.toContain('1.7589999999');
    expect(formatted).toBe('1,759 €/l');
  });

  it('returns null for a missing price so the caller shows the text label', () => {
    expect(formatPricePerLiter(null, 'de')).toBeNull();
    expect(formatPricePerLiter(Number.NaN, 'de')).toBeNull();
  });

  it('formats distance in metres below one kilometre', () => {
    expect(formatDistance(0.4, 'de')).toBe('400 m');
    expect(formatDistance(2.35, 'de')).toBe('2,4 km');
    expect(formatDistance(null, 'de')).toBeNull();
  });

  it('formats the retrieval time as a clock time', () => {
    const formatted = formatRetrievedAt('2026-08-12T12:32:00.000Z', 'de');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('returns null for an unparseable retrieval time', () => {
    expect(formatRetrievedAt('not-a-date', 'de')).toBeNull();
  });

  it('builds a one-line address and skips missing parts', () => {
    expect(
      formatStationAddress({
        street: 'Hafenstraße',
        houseNumber: '12',
        postalCode: '47059',
        city: 'Duisburg',
      }),
    ).toBe('Hafenstraße 12, 47059 Duisburg');

    expect(
      formatStationAddress({ street: 'Hafenstraße', houseNumber: null, postalCode: null, city: 'Duisburg' }),
    ).toBe('Hafenstraße, Duisburg');

    expect(
      formatStationAddress({ street: null, houseNumber: null, postalCode: null, city: null }),
    ).toBeNull();
  });
});

describe('fuel selection', () => {
  it('offers only the intersection of vehicle and provider products', () => {
    // Arac HVO100 kabul ediyor ama saglayici fiyatlamiyor: chip secilebilir
    // olmamali, yoksa hicbir zaman dolmayacak bir filtre sunulur.
    expect(
      selectableProducts(['DIESEL', 'HVO100'], ['DIESEL', 'SUPER_E5', 'SUPER_E10']),
    ).toEqual(['DIESEL']);
  });

  it('keeps both petrol grades when the vehicle and provider both have them', () => {
    expect(
      selectableProducts(['SUPER_E5', 'SUPER_E10'], ['DIESEL', 'SUPER_E5', 'SUPER_E10']),
    ).toEqual(['SUPER_E5', 'SUPER_E10']);
  });

  it('shows only the selected fuel offering, or all when nothing is selected', () => {
    const s = station('a', {
      offerings: [offering('DIESEL', 1.7), offering('SUPER_E10', 1.8)],
    });

    expect(visibleOfferings(s, 'DIESEL').map((o) => o.productType)).toEqual(['DIESEL']);
    expect(visibleOfferings(s, null)).toHaveLength(2);
  });

  it('reads the price of a specific fuel', () => {
    const s = station('a', { offerings: [offering('DIESEL', 1.7)] });
    expect(priceFor(s, 'DIESEL')).toBe(1.7);
    expect(priceFor(s, 'SUPER_E5')).toBeNull();
    expect(priceFor(s, null)).toBeNull();
  });
});

describe('error code mapping', () => {
  it('reads a top-level code and a nested details.code', () => {
    expect(extractApiErrorCode({ response: { data: { code: 'driver_vehicle_not_resolved' } } })).toBe(
      'driver_vehicle_not_resolved',
    );
    expect(
      extractApiErrorCode({ response: { data: { details: { code: 'fuel_station_provider_unavailable' } } } }),
    ).toBe('fuel_station_provider_unavailable');
    expect(extractApiErrorCode(new Error('offline'))).toBeNull();
  });

  it('maps every backend code the driver endpoint can return', () => {
    // Kaynak: backend fuel-station.service.ts ve driver-vehicle.service.ts
    for (const code of [
      'vehicle_fuel_compatibility_missing',
      'driver_vehicle_not_resolved',
      'driver_profile_not_found',
      'fuel_station_provider_unavailable',
      'fuel_station_provider_not_configured',
    ]) {
      expect(FUEL_STATION_ERROR_CODES).toContain(code);
      const key = fuelStationErrorKey({ response: { data: { code } } });
      expect(key, `${code} must map to a key`).toBeTruthy();
      expect(key).not.toBe(code);
    }
  });

  it('shows the driver no technical config detail for a misconfigured provider', () => {
    // Production kullanicisina "API key missing" gosterilmez: ayni
    // "su anda alinamiyor" metnine dusuluyor.
    const configured = fuelStationErrorKey({
      response: { data: { code: 'fuel_station_provider_not_configured' } },
    });
    const unavailable = fuelStationErrorKey({
      response: { data: { code: 'fuel_station_provider_unavailable' } },
    });

    expect((de as Record<string, string>)[configured!]).toBe(
      (de as Record<string, string>)[unavailable!],
    );
  });

  it('returns null for an unmapped code so the generic message is used', () => {
    expect(fuelStationErrorKey({ response: { data: { code: 'brand_new' } } })).toBeNull();
  });

  it('maps each geolocation failure to its own message', () => {
    const keys = (['denied', 'timeout', 'unsupported', 'unavailable'] as const).map(
      geolocationErrorKey,
    );
    expect(new Set(keys).size).toBe(4);
  });
});

describe('driver position resolution', () => {
  it('treats a recent fix as fresh and an old one as stale', () => {
    const now = Date.UTC(2026, 7, 12, 12, 0, 0);
    const fresh = {
      latitude: 51.4,
      longitude: 6.7,
      recordedAt: new Date(now - 30_000).toISOString(),
      accuracyM: 12,
    };
    const stale = { ...fresh, recordedAt: new Date(now - POSITION_MAX_AGE_MS - 1000).toISOString() };

    expect(isPositionFresh(fresh, now)).toBe(true);
    expect(isPositionFresh(stale, now)).toBe(false);
    expect(isPositionFresh(null, now)).toBe(false);
  });

  it('does not accept a future-dated fix as fresh', () => {
    // Cihaz saati kaymissa "taze" saymak yanlis konumla arama yapmak olurdu.
    const now = Date.UTC(2026, 7, 12, 12, 0, 0);
    const future = {
      latitude: 51.4,
      longitude: 6.7,
      recordedAt: new Date(now + 60_000).toISOString(),
      accuracyM: 5,
    };
    expect(isPositionFresh(future, now)).toBe(false);
  });

  it('reuses a fresh remembered fix without touching geolocation', async () => {
    resetDriverPositionCache();
    rememberDriverPosition({
      latitude: 51.4344,
      longitude: 6.7623,
      recordedAt: new Date().toISOString(),
      accuracyM: 8,
    });

    const result = await resolveDriverPosition();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reused).toBe(true);
      expect(result.position.latitude).toBe(51.4344);
    }
    resetDriverPositionCache();
  });

  it('reports unsupported when the browser has no geolocation', async () => {
    resetDriverPositionCache();
    const original = globalThis.navigator;
    // jsdom navigator'unde geolocation yok; acikca kaldirarak dogruluyoruz.
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });

    try {
      const result = await resolveDriverPosition();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('unsupported');
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
      resetDriverPositionCache();
    }
  });
});

describe('translation completeness across de/en/tr', () => {
  const locales: Array<[string, Record<string, unknown>]> = [
    ['de', de as Record<string, unknown>],
    ['en', en as Record<string, unknown>],
    ['tr', tr as Record<string, unknown>],
  ];

  const P = 'driverPortal.fuelStations.';
  const requiredKeys = [
    `${P}title`,
    `${P}findAction`,
    `${P}intro`,
    `${P}locating`,
    `${P}searching`,
    `${P}searchAgain`,
    `${P}retry`,
    `${P}currentLocation`,
    `${P}radiusLabel`,
    `${P}radiusOption`,
    `${P}fuelLabel`,
    `${P}sortLabel`,
    `${P}sort.distance`,
    `${P}sort.price`,
    `${P}sortPriceHint`,
    `${P}distance`,
    `${P}open`,
    `${P}closed`,
    `${P}nearest`,
    `${P}cheapest`,
    `${P}priceUnavailable`,
    `${P}retrievedAt`,
    `${P}openRoute`,
    `${P}noCoordinates`,
    `${P}addressUnknown`,
    `${P}closeSummary`,
    `${P}emptyTitle`,
    `${P}emptyBody`,
    `${P}mapUnavailable`,
    `${P}demoBanner`,
    `${P}unsupportedProducts`,
    ...(
      [
        'DIESEL',
        'SUPER_E5',
        'SUPER_E10',
        'SUPER_PLUS',
        'HVO100',
        'CNG',
        'LNG',
        'ELECTRICITY',
        'HYDROGEN',
        'ADBLUE',
      ] as const
    ).map((product) => `${P}products.${product}`),
    `${P}errors.locationDenied`,
    `${P}errors.locationTimeout`,
    `${P}errors.locationUnavailable`,
    `${P}errors.locationUnsupported`,
    `${P}errors.compatibilityMissing`,
    `${P}errors.noVehicle`,
    `${P}errors.noDriverProfile`,
    `${P}errors.providerUnavailable`,
    `${P}errors.providerNotConfigured`,
    `${P}errors.generic`,
  ];

  for (const [lang, bundle] of locales) {
    it(`${lang} has every driver fuel-station key with a non-empty value`, () => {
      const missing = requiredKeys.filter((key) => {
        const value = bundle[key];
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('keeps the retrievedAt wording away from "price updated"', () => {
    // Saglayici fiyat zaman damgasi vermiyor; metin bunu ima ETMEMELI.
    const deText = (de as Record<string, string>)[`${P}retrievedAt`].toLowerCase();
    const enText = (en as Record<string, string>)[`${P}retrievedAt`].toLowerCase();
    const trText = (tr as Record<string, string>)[`${P}retrievedAt`].toLowerCase();

    expect(deText).toContain('abgerufen');
    expect(deText).not.toContain('aktualisiert');
    expect(enText).toContain('retrieved');
    expect(enText).not.toContain('updated');
    expect(trText).toContain('alındı');
    expect(trText).not.toContain('güncellen');
  });

  it('translates the demo banner distinctly in each language', () => {
    const values = locales.map(([, bundle]) => bundle[`${P}demoBanner`] as string);
    expect(new Set(values).size).toBe(3);
    for (const value of values) {
      expect(value.length).toBeGreaterThan(10);
    }
  });

  it('uses natural driver-facing German for the main action', () => {
    expect((de as Record<string, string>)[`${P}findAction`]).toBe('Tankstelle finden');
    expect((de as Record<string, string>)[`${P}currentLocation`]).toBe('Aktueller Standort');
    expect((de as Record<string, string>)[`${P}openRoute`]).toBe('Route öffnen');
    expect((de as Record<string, string>)[`${P}priceUnavailable`]).toBe('Preis nicht verfügbar');
  });
});
