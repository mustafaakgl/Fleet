import { describe, expect, it } from 'vitest';
import {
  hasIntentRouteImpact,
  isActiveFuelStop,
  isSelectionContextUsable,
} from './fueling-intent-view';
import { fuelStationErrorKey } from './fuel-station-view';
import type { FuelingIntent } from './types';

function intent(overrides: Partial<FuelingIntent> = {}): FuelingIntent {
  return {
    id: 'intent-1',
    status: 'ACTIVE',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    vehiclePlateNumber: 'DU-AB 123',
    tourId: null,
    anchorTourStopId: null,
    station: {
      provider: 'tankerkoenig',
      providerStationId: 'station-1',
      name: 'Aral Duisburg Hafen',
      brand: 'ARAL',
      address: { street: null, houseNumber: null, postalCode: null, city: 'Duisburg' },
      latitude: 51.44,
      longitude: 6.76,
    },
    selectedFuelProduct: 'DIESEL',
    quotedPricePerLitre: 1.759,
    priceRetrievedAt: null,
    attribution: { label: 'Tankerkönig', url: null },
    plannedLitres: null,
    routeMode: 'nearby_only',
    extraDistanceKm: null,
    extraDurationMin: null,
    driveTimeToStationMin: null,
    stationEta: null,
    routeCalculatedAt: null,
    selectedAt: '2026-08-13T10:00:00.000Z',
    navigationOpenedAt: null,
    expiresAt: '2026-08-13T21:59:59.999Z',
    ...overrides,
  };
}

describe('isActiveFuelStop', () => {
  it('matches on provider and provider station id, not on the name', () => {
    expect(isActiveFuelStop({ id: 'station-1', provider: 'tankerkoenig' }, intent())).toBe(true);
    // Ayni kimlik ama BASKA saglayici: farkli istasyon.
    expect(isActiveFuelStop({ id: 'station-1', provider: 'mock' }, intent())).toBe(false);
    expect(isActiveFuelStop({ id: 'station-2', provider: 'tankerkoenig' }, intent())).toBe(false);
  });

  it('matches nothing when there is no active stop', () => {
    expect(isActiveFuelStop({ id: 'station-1', provider: 'tankerkoenig' }, null)).toBe(false);
  });
});

describe('isSelectionContextUsable', () => {
  const now = Date.parse('2026-08-13T10:00:00.000Z');

  it('accepts a context that has not expired yet', () => {
    expect(isSelectionContextUsable('2026-08-13T10:05:00.000Z', now)).toBe(true);
  });

  it('rejects an expired, missing or unparseable value', () => {
    // Suresi gecmis baglamda ESKI FIYAT kullanilmaz — surucu yeniden arar.
    expect(isSelectionContextUsable('2026-08-13T09:59:59.000Z', now)).toBe(false);
    expect(isSelectionContextUsable(null, now)).toBe(false);
    expect(isSelectionContextUsable(undefined, now)).toBe(false);
    expect(isSelectionContextUsable('not-a-date', now)).toBe(false);
  });
});

describe('hasIntentRouteImpact', () => {
  it('is false for a selection made without a tour', () => {
    // Sapma yokken "0 km" gostermek yanlis olurdu.
    expect(hasIntentRouteImpact(intent())).toBe(false);
  });

  it('is true as soon as one of the two deviations is known', () => {
    expect(hasIntentRouteImpact(intent({ extraDistanceKm: 1.6 }))).toBe(true);
    expect(hasIntentRouteImpact(intent({ extraDurationMin: 3 }))).toBe(true);
    // Gercek sifir sapma da gosterilir: "rotana ekstra yuk yok" bir bilgidir.
    expect(hasIntentRouteImpact(intent({ extraDistanceKm: 0, extraDurationMin: 0 }))).toBe(true);
  });
});

describe('fuelStationErrorKey — fuel stop codes', () => {
  const keyFor = (code: string) => fuelStationErrorKey({ response: { data: { code } } });

  it('maps every phase 5 code to a translation key, never to the raw code', () => {
    const codes = [
      'fueling_selection_context_expired',
      'fueling_station_not_in_context',
      'fuel_product_not_compatible',
      'fuel_product_not_offered',
      'active_fueling_intent_not_found',
      'fueling_intent_conflict',
      'driver_vehicle_not_resolved',
    ];

    for (const code of codes) {
      const key = keyFor(code);
      expect(key, code).toBeTruthy();
      expect(key).toMatch(/^driverPortal\.fuelStations\.errors\./);
      expect(key).not.toContain(code);
    }
  });

  it('sends an expired context and an unknown station down the same path', () => {
    // Backend ikisini ayirmiyor (kehanet olmasin diye) ve kullanici acisindan
    // dogru davranis ayni: yeniden arama.
    expect(keyFor('fueling_station_not_in_context')).toBe(
      keyFor('fueling_selection_context_expired'),
    );
  });

  it('falls back to null for a code it does not know', () => {
    expect(keyFor('something_new_from_the_backend')).toBeNull();
  });
});
