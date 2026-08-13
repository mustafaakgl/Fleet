import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FuelProductType, FuelProductUsage } from '@prisma/client';
import { FuelSelectionContextService } from './fuel-selection-context.service';
import { FuelStationService } from './fuel-station.service';
import type {
  FuelStationProvider,
  FuelStationResult,
  FuelStationSearchQuery,
  NormalizedFuelStation,
} from './fuel-station.types';

/**
 * Surucu ucunun davranisi.
 *
 * Saglayici MOCK: gercek Tankerkonig'e cikan test kirilgan olur (anahtar, ag,
 * kota, degisen fiyat). Sinanan sey bizim filtremiz ve yetki sinirimiz.
 *
 * Veritabani da elle kuruluyor — TourService testlerinin ayni deseni.
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

const SEARCH = { latitude: 51.4344, longitude: 6.7623, radiusKm: 10 };

function offering(productType: FuelProductType, pricePerUnit: number | null = 1.75) {
  return { productType, pricePerUnit, unit: 'liter' as const, currency: 'EUR' as const, updatedAt: null };
}

function fullStation(id: string): NormalizedFuelStation {
  return {
    id,
    provider: 'test',
    name: 'Aral Duisburg',
    brand: 'Aral',
    address: { street: 'Musterweg', houseNumber: '1', postalCode: '47051', city: 'Duisburg' },
    latitude: 51.44,
    longitude: 6.76,
    distanceKm: 1.4,
    isOpen: true,
    pricesUpdatedAt: null,
    retrievedAt: '2026-08-12T08:00:00.000Z',
    hgvAccess: 'unknown',
    acceptedFuelCards: null,
    offerings: [
      offering(FuelProductType.DIESEL, 1.759),
      offering(FuelProductType.SUPER_E5, 1.879),
      offering(FuelProductType.SUPER_E10, 1.819),
    ],
  };
}

/** Cagrilari sayan, istenen sonucu donduren saglayici. */
function mockProvider(
  result: FuelStationResult<NormalizedFuelStation[]>,
  supported: FuelProductType[] = [
    FuelProductType.DIESEL,
    FuelProductType.SUPER_E5,
    FuelProductType.SUPER_E10,
  ],
) {
  const calls: FuelStationSearchQuery[] = [];
  const provider: FuelStationProvider = {
    name: 'test-provider',
    dataMode: 'live',
    attribution: { label: 'Test attribution', url: null },
    isConfigured: () => true,
    supportedProducts: () => supported,
    search: async (query) => {
      calls.push(query);
      return result;
    },
  };
  return { provider, calls };
}

type CompatibilityRow = {
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved: boolean;
};

/**
 * Kiracı sinirini taklit eden sahte veri katmani.
 *
 * `tenantOfRecord`, kaydin gercek kiracisi; `actingTenant` istegi yapan
 * kiraci. Kapsamli Prisma istemcisi gibi davranir: kiraci uyusmuyorsa kayit
 * YOK sayilir.
 */
function buildService(options: {
  driverId?: string | null;
  vehicle?: { id: string; plateNumber: string; tenant: string } | null;
  compatibility?: CompatibilityRow[];
  compatibilityTenant?: string;
  actingTenant?: string;
  providerResult?: FuelStationResult<NormalizedFuelStation[]>;
  supported?: FuelProductType[];
}) {
  const actingTenant = options.actingTenant ?? 'tenant-a';
  const compatibilityTenant = options.compatibilityTenant ?? actingTenant;
  const { provider, calls } = mockProvider(
    options.providerResult ?? { ok: true, value: [fullStation('s1')] },
    options.supported,
  );

  const driverVehicle = {
    requireDriverForUser: async () => {
      if (!options.driverId) {
        const error = new Error('driver_profile_not_found');
        throw error;
      }
      return { id: options.driverId };
    },
    resolveTodayVehicle: async () => {
      const vehicle = options.vehicle;
      // Kapsamli istemci baska kiracinin aracini dondurmez.
      if (!vehicle || vehicle.tenant !== actingTenant) {
        return null;
      }
      return { id: vehicle.id, plateNumber: vehicle.plateNumber, source: 'assignment' as const };
    },
  };

  const compatibility = {
    listRowsForVehicle: async () => {
      if (compatibilityTenant !== actingTenant) {
        return [];
      }
      return options.compatibility ?? [];
    },
  };

  const contextCache = memoryContextCache();
  const service = new FuelStationService(
    driverVehicle as never,
    compatibility as never,
    new FuelSelectionContextService(contextCache as never),
    provider,
  );

  return { service, calls, provider };
}

const DIESEL_VEHICLE = { id: 'veh-1', plateNumber: 'DU-AB 123', tenant: 'tenant-a' };
const DIESEL_ROWS: CompatibilityRow[] = [
  { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: true },
];

describe('GET /driver/fuel-stations/nearby — fuel compatibility', () => {
  it('returns only diesel prices for a diesel vehicle', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);

    assert.deepEqual(response.vehicle.compatibleProducts, [FuelProductType.DIESEL]);
    assert.equal(response.stations.length, 1);
    assert.deepEqual(
      response.stations[0]!.offerings.map((entry) => entry.productType),
      [FuelProductType.DIESEL],
    );
  });

  it('returns both grades for an E5 + E10 vehicle', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: [
        { productType: FuelProductType.SUPER_E5, usageType: FuelProductUsage.PRIMARY, approved: true },
        {
          productType: FuelProductType.SUPER_E10,
          usageType: FuelProductUsage.ALTERNATIVE,
          approved: true,
        },
      ],
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);
    const products = response.stations[0]!.offerings.map((entry) => entry.productType);

    assert.equal(products.length, 2);
    assert.equal(products.includes(FuelProductType.DIESEL), false);
  });

  it('does not treat a diesel vehicle as HVO100 capable', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);
    assert.equal(response.vehicle.compatibleProducts.includes(FuelProductType.HVO100), false);
  });

  it('reports a compatible product the provider cannot price instead of hiding it', async () => {
    // Arac HVO100 kabul ediyor ama Tankerkonig HVO fiyati vermiyor. Bunu
    // sessizce yutmak, surucuya "HVO yok" demek olurdu.
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: [
        ...DIESEL_ROWS,
        { productType: FuelProductType.HVO100, usageType: FuelProductUsage.ALTERNATIVE, approved: true },
      ],
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);
    assert.deepEqual(response.unsupportedCompatibleProducts, [FuelProductType.HVO100]);
  });

  it('keeps AdBlue out of the primary station filter', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: [
        ...DIESEL_ROWS,
        { productType: FuelProductType.ADBLUE, usageType: FuelProductUsage.ADDITIVE, approved: true },
      ],
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);
    assert.deepEqual(response.vehicle.compatibleProducts, [FuelProductType.DIESEL]);
  });
});

describe('GET /driver/fuel-stations/nearby — missing compatibility', () => {
  it('returns 409 vehicle_fuel_compatibility_missing when nothing is recorded', async () => {
    const { service, calls } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: [],
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 409);
        assert.equal(error.response?.code, 'vehicle_fuel_compatibility_missing');
        return true;
      },
    );

    // Uyumluluk bilinmiyorsa disariya hic cikilmamali.
    assert.deepEqual(calls, []);
  });

  it('returns 409 when only ADDITIVE entries exist', async () => {
    // Yalnizca AdBlue tanimli: filtrelenecek ana yakit yok, tahmin de yok.
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: [
        { productType: FuelProductType.ADBLUE, usageType: FuelProductUsage.ADDITIVE, approved: true },
      ],
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'vehicle_fuel_compatibility_missing');
        return true;
      },
    );
  });

  it('returns 409 when every recorded product is unapproved', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: [
        { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: false },
      ],
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'vehicle_fuel_compatibility_missing');
        return true;
      },
    );
  });
});

describe('GET /driver/fuel-stations/nearby — vehicle resolution and tenant isolation', () => {
  it('resolves the vehicle server-side and never accepts one from the request', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
    });

    // Istekte arac gonderme girisimi: servis imzasi yalnizca konum/yaricap
    // aliyor, fazladan alan tasinmaz.
    const response = await service.findNearbyForDriver('user-1', {
      ...SEARCH,
      vehicleId: 'someone-elses-vehicle',
    } as never);

    assert.equal(response.vehicle.id, DIESEL_VEHICLE.id);
    assert.notEqual(response.vehicle.id, 'someone-elses-vehicle');
  });

  it('cannot read a vehicle that belongs to another tenant', async () => {
    // Arac tenant-b'nin; istek tenant-a baglaminda. Kapsamli istemci onu
    // dondurmedigi icin arac hic cozulemez.
    const { service, calls } = buildService({
      driverId: 'drv-1',
      vehicle: { id: 'veh-b', plateNumber: 'K-XY 999', tenant: 'tenant-b' },
      actingTenant: 'tenant-a',
      compatibility: DIESEL_ROWS,
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 409);
        assert.equal(error.response?.code, 'driver_vehicle_not_resolved');
        return true;
      },
    );
    assert.deepEqual(calls, []);
  });

  it('cannot read another tenant fuel compatibility', async () => {
    // Arac gorunuyor ama uyumluluk kaydi baska kiracida: kapsamli istemci bos
    // dondurur ve uc 409 verir — baska kiracinin yakit profili SIZMAZ.
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
      compatibilityTenant: 'tenant-b',
      actingTenant: 'tenant-a',
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'vehicle_fuel_compatibility_missing');
        return true;
      },
    );
  });

  it('returns 409 driver_vehicle_not_resolved when the driver has no vehicle today', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: null,
      compatibility: DIESEL_ROWS,
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 409);
        assert.equal(error.response?.code, 'driver_vehicle_not_resolved');
        return true;
      },
    );
  });
});

describe('GET /driver/fuel-stations/nearby — provider failures', () => {
  it('turns a provider timeout into 503 without leaking the message', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
      providerResult: {
        ok: false,
        error: 'provider_unavailable',
        message: 'Tankerkoenig request timed out after 5000 ms',
      },
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 503);
        assert.equal(error.response?.code, 'fuel_station_provider_unavailable');
        return true;
      },
    );
  });

  it('reports a missing API key as a configuration problem, not a crash', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
      providerResult: {
        ok: false,
        error: 'provider_not_configured',
        message: 'TANKERKOENIG_API_KEY is not set',
      },
    });

    await assert.rejects(
      () => service.findNearbyForDriver('user-1', SEARCH),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 503);
        assert.equal(error.response?.code, 'fuel_station_provider_not_configured');
        return true;
      },
    );
  });

  it('treats "no station found" as an empty result, not an error', async () => {
    const { service } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
      providerResult: { ok: true, value: [] },
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);
    assert.deepEqual(response.stations, []);
    assert.equal(response.vehicle.plateNumber, DIESEL_VEHICLE.plateNumber);
  });

  it('echoes the validated search window back to the client', async () => {
    const { service, calls } = buildService({
      driverId: 'drv-1',
      vehicle: DIESEL_VEHICLE,
      compatibility: DIESEL_ROWS,
    });

    const response = await service.findNearbyForDriver('user-1', SEARCH);

    assert.deepEqual(response.search, {
      latitude: SEARCH.latitude,
      longitude: SEARCH.longitude,
      radiusKm: SEARCH.radiusKm,
    });
    assert.deepEqual(calls, [SEARCH]);
  });
});
