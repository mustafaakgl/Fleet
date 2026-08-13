import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FuelProductType, FuelProductUsage } from '@prisma/client';
import {
  MOCK_PROVIDER_IN_PRODUCTION_MESSAGE,
  resolveFuelStationProviderKind,
} from './fuel-station-provider.config';
import { FuelSelectionContextService } from './fuel-selection-context.service';
import { FuelStationService } from './fuel-station.service';
import { MockFuelStationProvider } from './mock-fuel-station.provider';
import { TankerkoenigFuelStationProvider } from './tankerkoenig-fuel-station.provider';

/**
 * Demo saglayici ve uretim korumasi.
 *
 * En kritik iddia: mock URETIMDE calismaz. Sahte fiyatla yola cikan bir surucu,
 * hic fiyat gormeyen surucuden daha kotu durumda — bu yuzden yanlis yapilandirma
 * sessizce live'a dusmuyor, ACILISTA hata veriyor.
 */


/**
 * Gercek FuelSelectionContextService + surec ici onbellek.
 *
 * Sahte bir baglam servisi yazmak yerine gercegi kullaniyoruz: sinanmasi
 * gereken sey (kimin hangi baglami cozebildigi, snapshot'ta ne durdugu) tam
 * olarak orada.
 */
function memoryContextCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null),
    set: async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    },
  };
}

const DUISBURG = { latitude: 51.4344, longitude: 6.7623, radiusKm: 10 };

/** Onbellegi devre disi birakan sahte. */
function noCache() {
  return { get: async () => null, set: async () => undefined, ttlSeconds: 300 };
}

function buildProvider() {
  return new MockFuelStationProvider(noCache() as never);
}

describe('fuel station provider selection', () => {
  it('defaults to the live provider when the variable is unset', () => {
    // process.env acikca temizleniyor: `.env` bu depoda mock'a ayarli oldugu
    // icin varsayilan parametreyi ortamdan okuyan bir test yanlis gecerdi.
    const previous = process.env.FUEL_STATION_PROVIDER;
    try {
      delete process.env.FUEL_STATION_PROVIDER;
      assert.equal(resolveFuelStationProviderKind(undefined, false), 'tankerkoenig');
      assert.equal(resolveFuelStationProviderKind('', false), 'tankerkoenig');
      assert.equal(resolveFuelStationProviderKind('   ', false), 'tankerkoenig');
    } finally {
      if (previous === undefined) delete process.env.FUEL_STATION_PROVIDER;
      else process.env.FUEL_STATION_PROVIDER = previous;
    }
  });

  it('accepts mock in development and test', () => {
    assert.equal(resolveFuelStationProviderKind('mock', false), 'mock');
    assert.equal(resolveFuelStationProviderKind('MOCK', false), 'mock');
  });

  it('refuses mock in production', () => {
    assert.throws(
      () => resolveFuelStationProviderKind('mock', true),
      (error: Error) => {
        assert.equal(error.message, MOCK_PROVIDER_IN_PRODUCTION_MESSAGE);
        return true;
      },
    );
  });

  it('still allows the live provider in production', () => {
    assert.equal(resolveFuelStationProviderKind('tankerkoenig', true), 'tankerkoenig');
  });

  it('refuses an unrecognised value instead of silently defaulting', () => {
    // Yazim hatasi (`moc`) varsayilana dusup fark edilmemesin.
    assert.throws(() => resolveFuelStationProviderKind('moc', false), /must be/);
    assert.throws(() => resolveFuelStationProviderKind('openstreetmap', false), /must be/);
  });

  it('reads NODE_ENV when the production flag is not passed', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.throws(() => resolveFuelStationProviderKind('mock'), /not allowed/);
      process.env.NODE_ENV = 'development';
      assert.equal(resolveFuelStationProviderKind('mock'), 'mock');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});

describe('MockFuelStationProvider — contract', () => {
  it('declares itself as mock data with a non-technical attribution', () => {
    const provider = buildProvider();

    assert.equal(provider.dataMode, 'mock');
    // Surucuye "Tankerkonig" yazip sahte fiyat gostermek yanlis guven yaratir.
    assert.equal(provider.attribution.label.toLowerCase().includes('tankerkönig'), false);
    assert.equal(provider.attribution.label.toLowerCase().includes('tankerkoenig'), false);
    assert.equal(provider.attribution.url, null);
  });

  it('is always configured — it needs no API key', () => {
    assert.equal(buildProvider().isConfigured(), true);
  });

  it('claims exactly the same products as the live provider', () => {
    // Mock'un daha fazla urun destekledigi bir dunya, gercek anahtara
    // gecildiginde sessizce kaybolan ozellikler demek olurdu.
    const mock = [...buildProvider().supportedProducts()].sort();
    const live = [
      ...new TankerkoenigFuelStationProvider(noCache() as never).supportedProducts(),
    ].sort();

    assert.deepEqual(mock, live);
  });

  it('never touches the network', async () => {
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      throw new Error('the mock provider must not perform network calls');
    }) as typeof globalThis.fetch;

    try {
      const result = await buildProvider().search(DUISBURG);
      assert.equal(result.ok, true);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(called, 0);
  });
});

describe('MockFuelStationProvider — generated stations', () => {
  it('is deterministic: the same query yields the same stations and prices', async () => {
    const first = await buildProvider().search(DUISBURG);
    const second = await buildProvider().search(DUISBURG);

    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;

    assert.deepEqual(
      first.value.map((s) => [s.id, s.distanceKm, s.offerings.map((o) => o.pricePerUnit)]),
      second.value.map((s) => [s.id, s.distanceKm, s.offerings.map((o) => o.pricePerUnit)]),
    );
  });

  it('honours the radius filter', async () => {
    const near = await buildProvider().search({ ...DUISBURG, radiusKm: 5 });
    const far = await buildProvider().search({ ...DUISBURG, radiusKm: 25 });

    assert.equal(near.ok && far.ok, true);
    if (!near.ok || !far.ok) return;

    assert.equal(near.value.length > 0, true);
    // 5 km secen surucuye 18 km uzaktaki istasyonu gostermek demo veriyi
    // ise yaramaz kilardi.
    for (const station of near.value) {
      assert.equal((station.distanceKm ?? 0) <= 5, true, `${station.id} is outside 5 km`);
    }
    assert.equal(far.value.length > near.value.length, true);
  });

  it('places stations around the requested coordinate', async () => {
    const result = await buildProvider().search(DUISBURG);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const station of result.value) {
      // Yaklasik 25 km, derece cinsinden kabaca 0.35 — sabit bir sehir
      // koordinatina cakilmadigini kanitlar.
      assert.equal(Math.abs(station.latitude - DUISBURG.latitude) < 0.35, true);
      assert.equal(Math.abs(station.longitude - DUISBURG.longitude) < 0.6, true);
    }
  });

  it('follows the coordinate: a different centre yields different coordinates', async () => {
    const hamburg = { latitude: 53.5511, longitude: 9.9937, radiusKm: 10 };
    const duisburg = await buildProvider().search(DUISBURG);
    const north = await buildProvider().search(hamburg);

    assert.equal(duisburg.ok && north.ok, true);
    if (!duisburg.ok || !north.ok) return;

    assert.notEqual(duisburg.value[0]!.latitude, north.value[0]!.latitude);
  });

  it('returns stations sorted by distance', async () => {
    const result = await buildProvider().search({ ...DUISBURG, radiusKm: 25 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const distances = result.value.map((s) => s.distanceKm ?? 0);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  });

  it('covers open, closed and unknown-price scenarios', async () => {
    const result = await buildProvider().search({ ...DUISBURG, radiusKm: 25 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(
      result.value.some((s) => s.isOpen === true),
      true,
      'an open station is required',
    );
    assert.equal(
      result.value.some((s) => s.isOpen === false),
      true,
      'a closed station is required',
    );
    assert.equal(
      result.value.some((s) => s.offerings.some((o) => o.pricePerUnit === null)),
      true,
      'a station without a price is required',
    );
  });

  it('covers diesel-only, petrol-only and mixed stations', async () => {
    const result = await buildProvider().search({ ...DUISBURG, radiusKm: 25 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const productSets = result.value.map(
      (s) => new Set(s.offerings.map((o) => o.productType as string)),
    );

    assert.equal(
      productSets.some((set) => set.has('DIESEL') && !set.has('SUPER_E5') && !set.has('SUPER_E10')),
      true,
      'a diesel-only station is required',
    );
    assert.equal(
      productSets.some((set) => !set.has('DIESEL') && set.has('SUPER_E5')),
      true,
      'a petrol-only station is required',
    );
    assert.equal(
      productSets.some((set) => set.has('DIESEL') && set.has('SUPER_E5') && set.has('SUPER_E10')),
      true,
      'a station with all three products is required',
    );
  });

  it('carries an address so the driver can recognise the station', async () => {
    const result = await buildProvider().search(DUISBURG);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const station = result.value[0]!;
    assert.equal(typeof station.address.street, 'string');
    assert.equal(typeof station.address.city, 'string');
    assert.match(station.address.postalCode ?? '', /^\d{5}$/);
  });

  it('invents no price timestamp and no truck or fuel-card data', async () => {
    const result = await buildProvider().search(DUISBURG);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const station of result.value) {
      assert.equal(station.pricesUpdatedAt, null);
      assert.equal(station.hgvAccess, 'unknown');
      assert.equal(station.acceptedFuelCards, null);
      for (const offering of station.offerings) {
        assert.equal(offering.updatedAt, null);
      }
    }
  });

  it('uses the cache the same way the live provider does', async () => {
    const store = new Map<string, unknown>();
    const cache = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        store.set(key, value);
      },
      ttlSeconds: 300,
    };
    const provider = new MockFuelStationProvider(cache as never);

    await provider.search(DUISBURG);
    assert.equal(store.size, 1);

    // Ikinci cagri onbellekten gelmeli — davranis iki modda ayni olsun.
    const cached = await provider.search(DUISBURG);
    assert.equal(cached.ok, true);
    assert.equal(store.size, 1);
  });
});

describe('MockFuelStationProvider — through the vehicle compatibility filter', () => {
  /** Mock saglayici + gercek FuelStationService: filtre kopyalanmadi. */
  function buildService(compatibility: Array<{ productType: FuelProductType; usageType: FuelProductUsage; approved: boolean }>) {
    const driverVehicle = {
      requireDriverForUser: async () => ({ id: 'drv-1' }),
      resolveTodayVehicle: async () => ({
        id: 'veh-1',
        plateNumber: 'DU-AB 123',
        source: 'assignment' as const,
      }),
    };
    const compat = { listRowsForVehicle: async () => compatibility };

    return new FuelStationService(
      driverVehicle as never,
      compat as never,
      new FuelSelectionContextService(memoryContextCache() as never),
      buildProvider(),
    );
  }

  it('hides petrol offerings entirely from a diesel-only vehicle', async () => {
    const service = buildService([
      { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: true },
    ]);

    const response = await service.findNearbyForDriver('user-1', {
      latitude: DUISBURG.latitude,
      longitude: DUISBURG.longitude,
      radiusKm: 25,
    });

    assert.equal(response.dataMode, 'mock');
    assert.equal(response.stations.length > 0, true);
    for (const station of response.stations) {
      assert.deepEqual(
        [...new Set(station.offerings.map((o) => o.productType as string))],
        ['DIESEL'],
        `${station.id} leaked a non-diesel offering`,
      );
    }
    // Yalnizca benzin satan istasyon listeden tamamen dusmus olmali.
    assert.equal(
      response.stations.some((s) => s.id === 'mock-total-benzin'),
      false,
    );
  });

  it('returns both grades for an E5 + E10 vehicle', async () => {
    const service = buildService([
      { productType: FuelProductType.SUPER_E5, usageType: FuelProductUsage.PRIMARY, approved: true },
      {
        productType: FuelProductType.SUPER_E10,
        usageType: FuelProductUsage.ALTERNATIVE,
        approved: true,
      },
    ]);

    const response = await service.findNearbyForDriver('user-1', {
      latitude: DUISBURG.latitude,
      longitude: DUISBURG.longitude,
      radiusKm: 25,
    });

    const products = new Set(
      response.stations.flatMap((s) => s.offerings.map((o) => o.productType as string)),
    );
    assert.equal(products.has('DIESEL'), false);
    assert.equal(products.has('SUPER_E5') || products.has('SUPER_E10'), true);
  });

  it('reports HVO100 as unsupported rather than hiding it', async () => {
    const service = buildService([
      { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: true },
      { productType: FuelProductType.HVO100, usageType: FuelProductUsage.ALTERNATIVE, approved: true },
    ]);

    const response = await service.findNearbyForDriver('user-1', {
      latitude: DUISBURG.latitude,
      longitude: DUISBURG.longitude,
      radiusKm: 10,
    });

    assert.deepEqual(response.unsupportedCompatibleProducts, [FuelProductType.HVO100]);
  });

  it('still returns 409 when the vehicle has no recorded compatibility', async () => {
    const service = buildService([]);

    await assert.rejects(
      () =>
        service.findNearbyForDriver('user-1', {
          latitude: DUISBURG.latitude,
          longitude: DUISBURG.longitude,
          radiusKm: 10,
        }),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 409);
        assert.equal(error.response?.code, 'vehicle_fuel_compatibility_missing');
        return true;
      },
    );
  });
});
