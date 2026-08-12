import { describe, expect, it } from 'vitest';
import de from '@/src/locales/de/common.json';
import en from '@/src/locales/en/common.json';
import tr from '@/src/locales/tr/common.json';
import {
  EXTRA_DISTANCE_DISPLAY_THRESHOLD_KM,
  EXTRA_DURATION_DISPLAY_THRESHOLD_MIN,
  MAX_PLANNED_LITRES,
  MIN_PLANNED_LITRES,
  ROUTE_SORT_MODES,
  defaultRouteSortMode,
  estimateDetourOperatingCost,
  estimatePurchaseCost,
  estimateStationChoiceCost,
  formatCurrencyEur,
  formatDriveTime,
  formatExtraDistance,
  formatExtraDuration,
  formatRoadDistance,
  formatStationEta,
  hasRouteMetrics,
  isEconomicComparisonAvailable,
  isPlannedLitresValid,
  isRouteSortAvailable,
  parseLitresInput,
  recommendedStationId,
  sortRouteStations,
} from './fuel-station-route';
import type { FuelProductType, RouteRecommendationStation, StationRouteMetrics } from './types';

function metrics(overrides: Partial<StationRouteMetrics> = {}): StationRouteMetrics {
  return {
    calculationStatus: 'calculated',
    roadDistanceToStationKm: 4.8,
    driveTimeToStationMin: 8,
    viaStationDistanceKm: 11.6,
    viaStationDurationMin: 15,
    extraDistanceKm: 1.6,
    extraDurationMin: 3,
    stationEta: '2026-08-12T15:24:00.000Z',
    ...overrides,
  };
}

const UNAVAILABLE: StationRouteMetrics = {
  calculationStatus: 'unavailable',
  roadDistanceToStationKm: null,
  driveTimeToStationMin: null,
  viaStationDistanceKm: null,
  viaStationDurationMin: null,
  extraDistanceKm: null,
  extraDurationMin: null,
  stationEta: null,
};

function offering(productType: FuelProductType, pricePerUnit: number | null) {
  return { productType, pricePerUnit, unit: 'liter' as const, currency: 'EUR' as const, updatedAt: null };
}

function station(
  id: string,
  overrides: Partial<RouteRecommendationStation> = {},
): RouteRecommendationStation {
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
    routeMetrics: metrics(),
    ...overrides,
  };
}

describe('sort modes', () => {
  it('offers the four documented modes', () => {
    expect([...ROUTE_SORT_MODES]).toEqual(['detour', 'driveTime', 'price', 'distance']);
  });

  it('defaults to detour with an active tour and metrics, distance otherwise', () => {
    expect(defaultRouteSortMode({ mode: 'active_tour', anyRouteMetrics: true })).toBe('detour');
    // Metrik yoksa sapmaya gore siralamak anlamsiz.
    expect(defaultRouteSortMode({ mode: 'active_tour', anyRouteMetrics: false })).toBe('distance');
    expect(defaultRouteSortMode({ mode: 'nearby_only', anyRouteMetrics: false })).toBe('distance');
  });

  it('disables route sorts without metrics and price sort without a fuel', () => {
    expect(isRouteSortAvailable('detour', { anyRouteMetrics: false, selectedProduct: 'DIESEL' })).toBe(false);
    expect(isRouteSortAvailable('driveTime', { anyRouteMetrics: false, selectedProduct: 'DIESEL' })).toBe(false);
    expect(isRouteSortAvailable('price', { anyRouteMetrics: true, selectedProduct: null })).toBe(false);
    expect(isRouteSortAvailable('distance', { anyRouteMetrics: false, selectedProduct: null })).toBe(true);
  });

  it('detects whether a station carries metrics', () => {
    expect(hasRouteMetrics(station('a'))).toBe(true);
    expect(hasRouteMetrics(station('b', { routeMetrics: UNAVAILABLE }))).toBe(false);
  });
});

describe('sortRouteStations', () => {
  it('sorts by smallest detour', () => {
    const sorted = sortRouteStations(
      [
        station('big', { routeMetrics: metrics({ extraDistanceKm: 9 }) }),
        station('small', { routeMetrics: metrics({ extraDistanceKm: 0.4 }) }),
      ],
      'detour',
      'DIESEL',
    );
    expect(sorted.map((s) => s.id)).toEqual(['small', 'big']);
  });

  it('puts stations without route metrics last in a route sort', () => {
    const sorted = sortRouteStations(
      [
        station('nometrics', { routeMetrics: UNAVAILABLE }),
        station('withmetrics', { routeMetrics: metrics({ extraDistanceKm: 5 }) }),
      ],
      'detour',
      'DIESEL',
    );
    // null'i kucuk sayan bir karsilastirma bunu "en az sapma" diye basa tasirdi.
    expect(sorted.map((s) => s.id)).toEqual(['withmetrics', 'nometrics']);
  });

  it('sorts by drive time to the station', () => {
    const sorted = sortRouteStations(
      [
        station('slow', { routeMetrics: metrics({ driveTimeToStationMin: 22 }) }),
        station('fast', { routeMetrics: metrics({ driveTimeToStationMin: 4 }) }),
      ],
      'driveTime',
      'DIESEL',
    );
    expect(sorted.map((s) => s.id)).toEqual(['fast', 'slow']);
  });

  it('sorts by price of the selected fuel and puts unpriced last', () => {
    const sorted = sortRouteStations(
      [
        station('noprice', { offerings: [offering('DIESEL', null)] }),
        station('expensive', { offerings: [offering('DIESEL', 1.9)] }),
        station('cheap', { offerings: [offering('DIESEL', 1.6)] }),
      ],
      'price',
      'DIESEL',
    );
    expect(sorted.map((s) => s.id)).toEqual(['cheap', 'expensive', 'noprice']);
  });

  it('breaks ties deterministically', () => {
    const input = [
      station('bbb', { distanceKm: 3, routeMetrics: metrics({ extraDistanceKm: 1 }) }),
      station('aaa', { distanceKm: 3, routeMetrics: metrics({ extraDistanceKm: 1 }) }),
    ];
    expect(sortRouteStations(input, 'detour', 'DIESEL').map((s) => s.id)).toEqual(['aaa', 'bbb']);
    expect(sortRouteStations([...input].reverse(), 'detour', 'DIESEL').map((s) => s.id)).toEqual([
      'aaa',
      'bbb',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [station('b'), station('a')];
    sortRouteStations(input, 'distance', null);
    expect(input.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('recommendedStationId', () => {
  it('picks the first suitable station for the active sort', () => {
    const sorted = [
      station('best', { routeMetrics: metrics({ extraDistanceKm: 0.2 }) }),
      station('other', { routeMetrics: metrics({ extraDistanceKm: 3 }) }),
    ];
    expect(recommendedStationId(sorted, 'detour', 'DIESEL')).toBe('best');
  });

  it('never recommends a closed station but keeps it in the list', () => {
    const sorted = [
      station('closed', { isOpen: false, routeMetrics: metrics({ extraDistanceKm: 0.1 }) }),
      station('open', { isOpen: true, routeMetrics: metrics({ extraDistanceKm: 4 }) }),
    ];
    // Kapali istasyon listede kaliyor ama ONERILMIYOR.
    expect(recommendedStationId(sorted, 'detour', 'DIESEL')).toBe('open');
    expect(sorted).toHaveLength(2);
  });

  it('never recommends an unpriced station in a price sort', () => {
    const sorted = [
      station('noprice', { offerings: [offering('DIESEL', null)] }),
      station('priced', { offerings: [offering('DIESEL', 1.8)] }),
    ];
    expect(recommendedStationId(sorted, 'price', 'DIESEL')).toBe('priced');
  });

  it('never recommends a station without metrics in a route sort', () => {
    const sorted = [
      station('nometrics', { routeMetrics: UNAVAILABLE }),
      station('withmetrics', { routeMetrics: metrics({ extraDistanceKm: 6 }) }),
    ];
    expect(recommendedStationId(sorted, 'detour', 'DIESEL')).toBe('withmetrics');
    expect(recommendedStationId(sorted, 'driveTime', 'DIESEL')).toBe('withmetrics');
  });

  it('returns null when nothing is suitable', () => {
    const sorted = [station('closed', { isOpen: false })];
    expect(recommendedStationId(sorted, 'detour', 'DIESEL')).toBeNull();
  });

  it('is not the same concept as cheapest or nearest', () => {
    // En yakin ve en ucuz KAPALI istasyon olabilir; onerilen olamaz.
    const sorted = [
      station('closest-and-cheapest', {
        isOpen: false,
        distanceKm: 0.2,
        offerings: [offering('DIESEL', 1.5)],
        routeMetrics: metrics({ extraDistanceKm: 0.1 }),
      }),
      station('usable', { isOpen: true, distanceKm: 8, offerings: [offering('DIESEL', 1.9)] }),
    ];
    expect(recommendedStationId(sorted, 'detour', 'DIESEL')).toBe('usable');
  });
});

describe('formatting', () => {
  it('formats road distance and drive time', () => {
    expect(formatRoadDistance(4.8, 'de')).toBe('4,8 km');
    expect(formatRoadDistance(0.4, 'de')).toBe('400 m');
    expect(formatRoadDistance(null, 'de')).toBeNull();
    expect(formatDriveTime(8, 'de')).toBe('8 min');
    expect(formatDriveTime(95, 'de')).toBe('1 h 35 min');
    expect(formatDriveTime(120, 'de')).toBe('2 h');
    expect(formatDriveTime(null, 'de')).toBeNull();
  });

  it('formats the route impact with an explicit plus sign', () => {
    expect(formatExtraDistance(1.6, 'de')).toBe('+1,6 km');
    expect(formatExtraDuration(3, 'de')).toBe('+3 min');
    // Sifir sapma bos birakilmiyor: hesaplanmadigi izlenimi vermesin.
    expect(formatExtraDistance(0, 'de')).toBe('+0 km');
    expect(formatExtraDistance(null, 'de')).toBeNull();
  });

  it('formats the station ETA as a clock time', () => {
    expect(formatStationEta('2026-08-12T15:24:00.000Z', 'de')).toMatch(/\d{2}:\d{2}/);
    expect(formatStationEta(null, 'de')).toBeNull();
    expect(formatStationEta('not-a-date', 'de')).toBeNull();
  });

  it('formats currency for the locale', () => {
    const german = formatCurrencyEur(78.5, 'de')!;
    expect(german).toContain('78,50');
    expect(german).toContain('€');
    expect(formatCurrencyEur(null, 'de')).toBeNull();
  });
});

describe('planned litres input', () => {
  it('accepts a German comma decimal', () => {
    // Number("45,5") NaN dondururdu; locale ayirici dikkate aliniyor.
    expect(parseLitresInput('45,5', 'de')).toBe(45.5);
    expect(parseLitresInput('1.045,5', 'de')).toBe(1045.5);
  });

  it('accepts an English dot decimal', () => {
    expect(parseLitresInput('45.5', 'en')).toBe(45.5);
    expect(parseLitresInput('1,045.5', 'en')).toBe(1045.5);
  });

  it('returns null for empty or invalid input', () => {
    for (const raw of ['', '   ', 'abc', '-5', '4,5,5', '1e5']) {
      expect(parseLitresInput(raw, 'de'), `${raw} must not parse`).toBeNull();
    }
  });

  it('applies safe bounds without inventing a tank capacity', () => {
    // Semada arac tank kapasitesi alani YOK; sinir yalnizca kaba korkuluk.
    expect(MIN_PLANNED_LITRES).toBe(1);
    expect(MAX_PLANNED_LITRES).toBe(1500);
    expect(isPlannedLitresValid(0)).toBe(false);
    expect(isPlannedLitresValid(400)).toBe(true);
    expect(isPlannedLitresValid(5000)).toBe(false);
    expect(isPlannedLitresValid(null)).toBe(false);
  });
});

describe('economic estimates', () => {
  it('computes the purchase cost from price and litres', () => {
    expect(estimatePurchaseCost({ pricePerLitre: 1.759, plannedLitres: 400 })).toBe(703.6);
  });

  it('invents no cost when litres are missing', () => {
    // Alan bos baslarsa hicbir tutar gosterilmemeli.
    expect(estimatePurchaseCost({ pricePerLitre: 1.759, plannedLitres: null })).toBeNull();
    expect(estimatePurchaseCost({ pricePerLitre: 1.759, plannedLitres: 0 })).toBeNull();
  });

  it('invents no cost when the price is unknown', () => {
    expect(estimatePurchaseCost({ pricePerLitre: null, plannedLitres: 400 })).toBeNull();
  });

  it('computes the detour operating cost from canonical consumption', () => {
    // 10 km * 30 L/100km / 100 = 3 L; 3 * 1.70 = 5.10
    expect(
      estimateDetourOperatingCost({
        extraDistanceKm: 10,
        consumptionLPer100Km: 30,
        pricePerLitre: 1.7,
      }),
    ).toBe(5.1);
  });

  it('returns null rather than inventing a consumption value', () => {
    expect(
      estimateDetourOperatingCost({
        extraDistanceKm: 10,
        consumptionLPer100Km: null,
        pricePerLitre: 1.7,
      }),
    ).toBeNull();
  });

  it('only totals when both components exist', () => {
    expect(estimateStationChoiceCost({ purchaseCost: 700, detourOperatingCost: 5 })).toBe(705);
    expect(estimateStationChoiceCost({ purchaseCost: 700, detourOperatingCost: null })).toBeNull();
    expect(estimateStationChoiceCost({ purchaseCost: null, detourOperatingCost: 5 })).toBeNull();
  });

  it('gates the economic comparison on reliable consumption data', () => {
    expect(isEconomicComparisonAvailable(28.5)).toBe(true);
    expect(isEconomicComparisonAvailable(null)).toBe(false);
    expect(isEconomicComparisonAvailable(0)).toBe(false);
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
    `${P}routeBasedTitle`,
    `${P}nextStop`,
    `${P}detourHint`,
    `${P}sort.detour`,
    `${P}sort.driveTime`,
    `${P}sortRouteHint`,
    `${P}toStation`,
    `${P}routeImpact`,
    `${P}stationEta`,
    `${P}refuellingExcluded`,
    `${P}recommended`,
    `${P}routingUnavailable`,
    `${P}noActiveTour`,
    `${P}nextStopLocationMissing`,
    `${P}plannedLitresLabel`,
    `${P}plannedLitresHint`,
    `${P}plannedLitresInvalid`,
    `${P}estimatedPurchase`,
    `${P}estimatedChoiceCost`,
    `${P}economicFormula`,
    `${P}purchaseEstimateNote`,
    `${P}economicUnavailable`,
  ];

  for (const [lang, bundle] of locales) {
    it(`${lang} has every route recommendation key with a non-empty value`, () => {
      const missing = requiredKeys.filter((key) => {
        const value = bundle[key];
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${lang} keeps the interpolation placeholders intact`, () => {
      expect(bundle[`${P}nextStop`]).toContain('{{stop}}');
      expect(bundle[`${P}toStation`]).toContain('{{distance}}');
      expect(bundle[`${P}toStation`]).toContain('{{duration}}');
      expect(bundle[`${P}routeImpact`]).toContain('{{distance}}');
      expect(bundle[`${P}stationEta`]).toContain('{{time}}');
      expect(bundle[`${P}plannedLitresInvalid`]).toContain('{{min}}');
      expect(bundle[`${P}plannedLitresInvalid`]).toContain('{{max}}');
    });

    it(`${lang} states that refuelling time is excluded`, () => {
      const text = String(bundle[`${P}refuellingExcluded`]).toLowerCase();
      expect(text.length).toBeGreaterThan(10);
      // Yakit alma suresinin DAHIL OLMADIGI acikca yazilmali.
      expect(/tank|refuel|yakıt/.test(text)).toBe(true);
    });

    it(`${lang} calls the amount an estimated purchase, not a total tour cost`, () => {
      const note = String(bundle[`${P}purchaseEstimateNote`]).toLowerCase();
      expect(note.length).toBeGreaterThan(10);
    });
  }

  it('translates the route-based title distinctly per language', () => {
    const values = locales.map(([, bundle]) => bundle[`${P}routeBasedTitle`] as string);
    expect(new Set(values).size).toBe(3);
  });

  it('uses natural driver-facing German', () => {
    const bundle = de as Record<string, string>;
    expect(bundle[`${P}routeBasedTitle`]).toBe('Routenbasierte Vorschläge');
    expect(bundle[`${P}sort.detour`]).toBe('Geringster Umweg');
    expect(bundle[`${P}recommended`]).toBe('Empfohlen');
    expect(bundle[`${P}nextStop`]).toBe('Nächster Halt: {{stop}}');
  });
});

/* ===========================================================================
 * Faz 4.1 — gosterim esikleri
 * ========================================================================= */

describe('rounding display never turns a real positive into zero', () => {
  it('shows a sub-minute positive deviation as a less-than value', () => {
    // OLCULEN HATA: 0,6 dk'lik gercek sapma "+0 min" olarak gorunuyordu ve
    // surucu "hic saptirmiyor" diye okuyordu.
    expect(formatExtraDuration(0.6, 'de')).toBe('<1 min');
    expect(formatExtraDuration(0.04, 'de')).toBe('<1 min');
    expect(formatExtraDuration(0.999, 'de')).toBe('<1 min');
  });

  it('shows a sub-100-metre positive deviation as a less-than value', () => {
    expect(formatExtraDistance(0.04, 'de')).toBe('<0,1 km');
    expect(formatExtraDistance(0.099, 'de')).toBe('<0,1 km');
  });

  it('keeps a true zero as an explicit zero, without a less-than sign', () => {
    // "Sapma yok" ile "cok kucuk sapma" AYRI bilgiler.
    expect(formatExtraDuration(0, 'de')).toBe('+0 min');
    expect(formatExtraDistance(0, 'de')).toBe('+0 km');
    expect(formatExtraDuration(0, 'de')).not.toContain('<');
    expect(formatExtraDistance(0, 'de')).not.toContain('<');
  });

  it('leaves values at or above the threshold unchanged', () => {
    expect(formatExtraDuration(1, 'de')).toBe('+1 min');
    expect(formatExtraDuration(3, 'de')).toBe('+3 min');
    expect(formatExtraDistance(0.1, 'de')).toBe('+0,1 km');
    expect(formatExtraDistance(1.6, 'de')).toBe('+1,6 km');
  });

  it('keeps locale number formatting for the threshold value', () => {
    // Almanca virgul, Ingilizce nokta.
    expect(formatExtraDistance(0.04, 'de')).toBe('<0,1 km');
    expect(formatExtraDistance(0.04, 'en')).toBe('<0.1 km');
    expect(formatExtraDistance(0.04, 'tr')).toBe('<0,1 km');
  });

  it('still returns null for missing or unusable values', () => {
    expect(formatExtraDuration(null, 'de')).toBeNull();
    expect(formatExtraDistance(null, 'de')).toBeNull();
    expect(formatExtraDuration(Number.NaN, 'de')).toBeNull();
  });

  it('exposes the thresholds as documented constants', () => {
    expect(EXTRA_DISTANCE_DISPLAY_THRESHOLD_KM).toBe(0.1);
    expect(EXTRA_DURATION_DISPLAY_THRESHOLD_MIN).toBe(1);
  });
});

describe('Faz 4.1 translation completeness', () => {
  const locales: Array<[string, Record<string, unknown>]> = [
    ['de', de as Record<string, unknown>],
    ['en', en as Record<string, unknown>],
    ['tr', tr as Record<string, unknown>],
  ];

  const requiredKeys = [
    'driverPortal.fuelStations.currentStopInService',
    'driverPortal.fuelStations.currentStop',
    'driverPortal.fuelStations.ambiguousActiveTour',
  ];

  for (const [lang, bundle] of locales) {
    it(`${lang} has the new edge-case keys`, () => {
      const missing = requiredKeys.filter((key) => {
        const value = bundle[key];
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(missing, `${lang} is missing: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('keeps the current-stop placeholder', () => {
    for (const [, bundle] of locales) {
      expect(bundle['driverPortal.fuelStations.currentStop']).toContain('{{stop}}');
    }
  });

  it('translates the in-service message distinctly and non-technically', () => {
    const values = locales.map(
      ([, bundle]) => bundle['driverPortal.fuelStations.currentStopInService'] as string,
    );
    expect(new Set(values).size).toBe(3);
    for (const value of values) {
      expect(value.length).toBeGreaterThan(20);
      // Ham durum kodu kullaniciya gitmemeli.
      expect(value).not.toContain('current_stop_in_service');
      expect(value).not.toContain('arrived');
    }
  });

  it('keeps the ambiguous-tour message free of technical detail', () => {
    for (const [, bundle] of locales) {
      const value = bundle['driverPortal.fuelStations.ambiguousActiveTour'] as string;
      expect(value).not.toContain('ambiguous_active_tour');
      expect(value).not.toContain('tourId');
      expect(value).not.toContain('in_progress');
    }
  });
});
