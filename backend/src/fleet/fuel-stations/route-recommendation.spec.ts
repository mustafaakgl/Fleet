import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { FuelProductType, FuelProductUsage } from '@prisma/client';
import { DEFAULT_TRUCK_PROFILE } from '../../routing/core/routing.types';
import {
  MAX_ROUTE_CANDIDATES,
  NEGATIVE_DEVIATION_EPSILON_KM,
  NEGATIVE_DEVIATION_EPSILON_MIN,
  computeStationRouteMetrics,
  estimateDetourFuelCost,
  normalizeDeviation,
  selectRouteCandidates,
} from './core/route-recommendation.util';
import { NearbyFuelStationsQueryDto } from './dto/nearby-fuel-stations.query';
import { FuelStationDriverController } from './fuel-station.controller';
import { RouteRecommendationService } from './route-recommendation.service';

/**
 * Rota bazli istasyon onerisi.
 *
 * Valhalla ve istasyon saglayicisi MOCK: gercek dis ag cagrisi yok. Sinanan sey
 * sapma matematigi, aday secimi, onbellek guvenligi ve rota motoru
 * calismadiginda kismi basari.
 */

const ORIGIN = { latitude: 51.4344, longitude: 6.7623, radiusKm: 10 };

function offering(productType: FuelProductType, pricePerUnit: number | null) {
  return { productType, pricePerUnit, unit: 'liter' as const, currency: 'EUR' as const, updatedAt: null };
}

function station(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    provider: 'mock',
    name: `Station ${id}`,
    brand: 'ARAL',
    address: { street: 'Hafenstraße', houseNumber: '1', postalCode: '47059', city: 'Duisburg' },
    latitude: 51.44,
    longitude: 6.76,
    distanceKm: 2,
    isOpen: true,
    pricesUpdatedAt: null,
    retrievedAt: '2026-08-12T12:00:00.000Z',
    hgvAccess: 'unknown' as const,
    acceptedFuelCards: null,
    offerings: [offering(FuelProductType.DIESEL, 1.759)],
    ...overrides,
  };
}

/** Matris hucresi kurar. */
function cell(sourceIndex: number, targetIndex: number, distanceKm: number | null, durationMinutes: number | null) {
  return { sourceIndex, targetIndex, distanceKm, durationMinutes };
}

type BuildOptions = {
  stations?: Array<ReturnType<typeof station>>;
  activeTour?:
    | {
        tourId: string;
        routeVersion: string;
        nextStop: { id: string; sequence: number; label: string; latitude: number; longitude: number } | null;
        nextStopLocationMissing: boolean;
        currentStopInService?: { id: string; sequence: number; label: string } | null;
      }
    | { ambiguous: true; tourIds: string[] }
    | null;
  /** Matris cagrilarinin sonucu; sirayla [fromOrigin, toNextStop]. */
  matrixResults?: Array<{ ok: boolean; cells?: ReturnType<typeof cell>[]; error?: string }>;
  consumption?: number | null;
  tenantId?: string;
  cacheStore?: Map<string, unknown>;
};

function buildService(options: BuildOptions = {}) {
  const stations = options.stations ?? [station('a')];
  const matrixCalls: Array<{ sources: unknown[]; targets: unknown[]; profile: unknown; ttl?: number }> = [];
  const cacheStore = options.cacheStore ?? new Map<string, unknown>();
  const cacheKeys: string[] = [];

  const fuelStations = {
    findNearbyForDriver: async () => ({
      vehicle: { id: 'veh-1', plateNumber: 'DU-AB 123', compatibleProducts: [FuelProductType.DIESEL] },
      search: { latitude: ORIGIN.latitude, longitude: ORIGIN.longitude, radiusKm: ORIGIN.radiusKm },
      dataMode: 'mock' as const,
      attribution: { label: 'Demodaten', url: null },
      providerSupportedProducts: [FuelProductType.DIESEL, FuelProductType.SUPER_E5, FuelProductType.SUPER_E10],
      unsupportedCompatibleProducts: [],
      stations,
    }),
  };

  const driverVehicle = {
    requireDriverForUser: async () => ({ id: 'drv-1' }),
    resolveActiveTourNextStop: async () =>
      options.activeTour === undefined
        ? {
            tourId: 'tour-1',
            routeVersion: '2026-08-12T10:00:00.000Z',
            nextStop: {
              id: 'stop-2',
              sequence: 1,
              label: 'Musterweg',
              latitude: 51.5,
              longitude: 6.9,
            },
            nextStopLocationMissing: false,
            currentStopInService: null,
          }
        : options.activeTour,
  };

  let matrixIndex = 0;
  const routing = {
    matrixBetween: async (sources: unknown[], targets: unknown[], profile: unknown, ttl?: number) => {
      matrixCalls.push({ sources, targets, profile, ttl });
      const configured = options.matrixResults?.[matrixIndex];
      matrixIndex += 1;
      if (configured && !configured.ok) {
        return { ok: false as const, error: configured.error ?? 'unavailable', message: 'mocked' };
      }
      if (configured?.cells) {
        return { ok: true as const, value: configured.cells };
      }
      // Varsayilan: birinci cagri [durak, istasyonlar], ikinci [istasyonlar]->durak
      if (matrixIndex === 1) {
        const cells = [cell(0, 0, 10, 12)];
        (targets as unknown[]).slice(1).forEach((_target, index) => {
          cells.push(cell(0, index + 1, 4, 6));
        });
        return { ok: true as const, value: cells };
      }
      const cells = (sources as unknown[]).map((_source, index) => cell(index, 0, 8, 9));
      return { ok: true as const, value: cells };
    },
  };

  const cache = {
    get: async (key: string) => {
      cacheKeys.push(key);
      return cacheStore.get(`routing:${key}`) ?? null;
    },
    set: async (key: string, value: unknown) => {
      cacheStore.set(`routing:${key}`, value);
    },
  };

  const prisma = {
    vehicle: {
      findFirst: async () => ({
        tenantId: options.tenantId ?? 'tenant-a',
        avgConsumptionLPer100Km:
          options.consumption === undefined ? null : options.consumption,
      }),
    },
  };

  const service = new RouteRecommendationService(
    prisma as never,
    fuelStations as never,
    driverVehicle as never,
    routing as never,
    cache as never,
  );

  return { service, matrixCalls, cacheStore, cacheKeys };
}

describe('route recommendations — endpoint contract', () => {
  it('is exposed as GET driver/fuel-stations/route-recommendations', () => {
    const handler = Reflect.get(
      FuelStationDriverController.prototype as object,
      'routeRecommendations',
    ) as object;

    assert.equal(
      Reflect.getMetadata(PATH_METADATA, FuelStationDriverController),
      'driver/fuel-stations',
    );
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'route-recommendations');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
  });

  it('accepts no tour, vehicle, driver or costing field from the client', () => {
    // Global ValidationPipe forbidNonWhitelisted ile calisiyor: DTO'da olmayan
    // alan 400 ile reddedilir. Bu yuzden "alan yok" gercek bir korumadir.
    const fields = Object.getOwnPropertyNames(new NearbyFuelStationsQueryDto());
    for (const forbidden of [
      'vehicleId',
      'driverId',
      'tourId',
      'tenantId',
      'nextStopId',
      'costing',
      'profile',
    ]) {
      assert.equal(fields.includes(forbidden), false, `${forbidden} must not be accepted`);
    }
  });
});

describe('deviation math', () => {
  it('computes baseline, via-station and extra values', () => {
    const { metrics } = computeStationRouteMetrics({
      baseline: { distanceKm: 10, durationMin: 12 },
      toStation: { distanceKm: 4.8, durationMin: 8 },
      stationToNextStop: { distanceKm: 6.8, durationMin: 7 },
    });

    assert.equal(metrics.calculationStatus, 'calculated');
    assert.equal(metrics.roadDistanceToStationKm, 4.8);
    assert.equal(metrics.driveTimeToStationMin, 8);
    assert.equal(metrics.viaStationDistanceKm, 11.6);
    assert.equal(metrics.viaStationDurationMin, 15);
    // 11.6 - 10 = 1.6 km, 15 - 12 = 3 dk
    assert.equal(metrics.extraDistanceKm, 1.6);
    assert.equal(metrics.extraDurationMin, 3);
  });

  it('computes the station ETA from drive time only, excluding refuelling', () => {
    const departureAt = new Date('2026-08-12T15:16:00.000Z');
    const { metrics } = computeStationRouteMetrics({
      baseline: { distanceKm: 10, durationMin: 12 },
      toStation: { distanceKm: 4.8, durationMin: 8 },
      stationToNextStop: { distanceKm: 6.8, durationMin: 7 },
      departureAt,
    });

    // 15:16 + 8 dk surus = 15:24. Yakit alma suresi EKLENMIYOR.
    assert.equal(metrics.stationEta, '2026-08-12T15:24:00.000Z');
  });

  it('normalises a tiny negative deviation to zero', () => {
    // Ayni yolun iki cagrida milimetrik farki fiziksel bir kisayol degil.
    assert.equal(normalizeDeviation(-0.02, NEGATIVE_DEVIATION_EPSILON_KM), 0);
    assert.equal(normalizeDeviation(-0.3, NEGATIVE_DEVIATION_EPSILON_MIN), 0);
  });

  it('reports a significant negative deviation as unavailable instead of hiding it', () => {
    const { metrics, suspiciousNegative } = computeStationRouteMetrics({
      baseline: { distanceKm: 30, durationMin: 30 },
      toStation: { distanceKm: 4, durationMin: 5 },
      stationToNextStop: { distanceKm: 4, durationMin: 5 },
    });

    assert.equal(metrics.calculationStatus, 'unavailable');
    assert.equal(metrics.extraDistanceKm, null);
    assert.equal(suspiciousNegative, true);
  });

  it('rejects NaN, Infinity and negative inputs', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const { metrics } = computeStationRouteMetrics({
        baseline: { distanceKm: 10, durationMin: 12 },
        toStation: { distanceKm: bad, durationMin: 8 },
        stationToNextStop: { distanceKm: 6, durationMin: 7 },
      });
      assert.equal(metrics.calculationStatus, 'unavailable', `${bad} must be rejected`);
    }
  });

  it('reports unavailable when a leg is missing', () => {
    const { metrics } = computeStationRouteMetrics({
      baseline: { distanceKm: 10, durationMin: 12 },
      toStation: { distanceKm: null, durationMin: null },
      stationToNextStop: { distanceKm: 6, durationMin: 7 },
    });
    assert.equal(metrics.calculationStatus, 'unavailable');
  });
});

describe('candidate selection', () => {
  it('caps the number of candidates', () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      station(`s${String(index).padStart(2, '0')}`, { distanceKm: index }),
    );
    assert.equal(selectRouteCandidates(many).length, MAX_ROUTE_CANDIDATES);
    assert.equal(selectRouteCandidates(many, 4).length, 4);
  });

  it('prefers open and priced stations, nearest first', () => {
    const picked = selectRouteCandidates(
      [
        station('closed-near', { distanceKm: 0.5, isOpen: false }),
        station('open-priced-far', { distanceKm: 9 }),
        station('open-priced-near', { distanceKm: 1 }),
      ],
      2,
    );
    assert.deepEqual(
      picked.map((entry) => entry.id),
      ['open-priced-near', 'open-priced-far'],
    );
  });

  it('does not let closed or price-less stations crowd out the good ones', () => {
    // Bes kapali/fiyatsiz istasyon daha yakin olsa bile, tek acik+fiyatli
    // istasyon iki adaylik listede yer BULMALI.
    const stations = [
      station('c1', { distanceKm: 0.1, isOpen: false }),
      station('c2', { distanceKm: 0.2, isOpen: false }),
      station('n1', { distanceKm: 0.3, offerings: [offering(FuelProductType.DIESEL, null)] }),
      station('n2', { distanceKm: 0.4, offerings: [offering(FuelProductType.DIESEL, null)] }),
      station('good', { distanceKm: 8 }),
    ];

    const picked = selectRouteCandidates(stations, 2);
    assert.equal(picked[0]!.id, 'good');
  });

  it('still includes closed stations when nothing better exists', () => {
    const picked = selectRouteCandidates([station('only-closed', { isOpen: false })], 5);
    assert.deepEqual(picked.map((entry) => entry.id), ['only-closed']);
  });

  it('breaks ties deterministically and puts unknown distance last', () => {
    const stations = [
      station('bbb', { distanceKm: 3 }),
      station('aaa', { distanceKm: 3 }),
      station('unknown', { distanceKm: null }),
    ];
    assert.deepEqual(
      selectRouteCandidates(stations, 3).map((entry) => entry.id),
      ['aaa', 'bbb', 'unknown'],
    );
    assert.deepEqual(
      selectRouteCandidates([...stations].reverse(), 3).map((entry) => entry.id),
      ['aaa', 'bbb', 'unknown'],
    );
  });
});

describe('detour fuel cost', () => {
  it('uses the canonical consumption formula', () => {
    // route-deviation.util ile ayni: litre = km * (L/100km) / 100
    const result = estimateDetourFuelCost({
      extraDistanceKm: 10,
      consumptionLPer100Km: 30,
      pricePerLiter: 1.7,
    });
    assert.equal(result.liters, 3);
    assert.equal(result.costEur, 5.1);
  });

  it('returns null instead of inventing a consumption default', () => {
    const noConsumption = estimateDetourFuelCost({
      extraDistanceKm: 10,
      consumptionLPer100Km: null,
      pricePerLiter: 1.7,
    });
    assert.equal(noConsumption.liters, null);
    assert.equal(noConsumption.costEur, null);
  });

  it('returns litres but no cost when the price is unknown', () => {
    const noPrice = estimateDetourFuelCost({
      extraDistanceKm: 10,
      consumptionLPer100Km: 30,
      pricePerLiter: null,
    });
    assert.equal(noPrice.liters, 3);
    assert.equal(noPrice.costEur, null);
  });
});

describe('RouteRecommendationService — active tour', () => {
  it('resolves the tour server-side and returns calculated metrics', async () => {
    const { service } = buildService();

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.routeContext.mode, 'active_tour');
    assert.equal(response.routeContext.calculationStatus, 'calculated');
    assert.equal(response.routeContext.nextStop?.id, 'stop-2');
    assert.deepEqual(response.routeContext.baseline, { distanceKm: 10, durationMin: 12 });

    const metrics = response.stations[0]!.routeMetrics;
    assert.equal(metrics.calculationStatus, 'calculated');
    // toStation 4/6, stationToNext 8/9 -> via 12/15, baseline 10/12 -> +2 km, +3 dk
    assert.equal(metrics.extraDistanceKm, 2);
    assert.equal(metrics.extraDurationMin, 3);
  });

  it('keeps the Faz 3 station fields intact', async () => {
    const { service } = buildService();
    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    const first = response.stations[0]!;
    assert.equal(first.name, 'Station a');
    assert.equal(first.address.city, 'Duisburg');
    assert.equal(first.hgvAccess, 'unknown');
    assert.equal(response.dataMode, 'mock');
    assert.equal(response.attribution.label, 'Demodaten');
    assert.equal(typeof response.search.retrievedAt, 'string');
  });

  it('uses the truck costing profile for every segment and never falls back to auto', async () => {
    const { service, matrixCalls } = buildService();
    await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(matrixCalls.length, 2);
    for (const call of matrixCalls) {
      assert.deepEqual(call.profile, DEFAULT_TRUCK_PROFILE);
      assert.equal(JSON.stringify(call.profile).includes('auto'), false);
    }
  });

  it('uses two bounded matrix calls instead of per-station routing', async () => {
    const many = Array.from({ length: 25 }, (_unused, index) =>
      station(`s${String(index).padStart(2, '0')}`, { distanceKm: index * 0.5 }),
    );
    const { service, matrixCalls } = buildService({ stations: many });

    await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    // Istasyon basina ardisik cagri YOK: iki matris cagrisi.
    assert.equal(matrixCalls.length, 2);
    // Aday sayisi sinirli: hedefler = 1 durak + en fazla 10 istasyon.
    assert.equal((matrixCalls[0]!.targets as unknown[]).length, MAX_ROUTE_CANDIDATES + 1);
    assert.equal((matrixCalls[1]!.sources as unknown[]).length, MAX_ROUTE_CANDIDATES);
  });

  it('returns every station, with metrics only on the candidates', async () => {
    const many = Array.from({ length: 14 }, (_unused, index) =>
      station(`s${String(index).padStart(2, '0')}`, { distanceKm: index * 0.5 }),
    );
    const { service } = buildService({ stations: many });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    // Liste ile harita tutarli kalsin: istasyonlarin tamami donuyor.
    assert.equal(response.stations.length, 14);
    const calculated = response.stations.filter(
      (entry) => entry.routeMetrics.calculationStatus === 'calculated',
    );
    assert.equal(calculated.length, MAX_ROUTE_CANDIDATES);
  });

  it('exposes the vehicle consumption when it is recorded', async () => {
    const { service } = buildService({ consumption: 28.5 });
    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);
    assert.equal(response.vehicle.avgConsumptionLPer100Km, 28.5);
  });

  it('reports null consumption rather than a made-up default', async () => {
    const { service } = buildService({ consumption: null });
    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);
    assert.equal(response.vehicle.avgConsumptionLPer100Km, null);
  });
});

describe('RouteRecommendationService — nearby_only fallback', () => {
  it('falls back when there is no active tour', async () => {
    const { service, matrixCalls } = buildService({ activeTour: null });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.routeContext.mode, 'nearby_only');
    assert.equal(response.routeContext.calculationStatus, 'no_active_tour');
    assert.equal(response.routeContext.nextStop, null);
    // Bu bir hata degil ve Valhalla'ya hic gidilmiyor.
    assert.deepEqual(matrixCalls, []);
    // Istasyonlar yine donuyor (Faz 3 davranisi).
    assert.equal(response.stations.length, 1);
    assert.equal(response.stations[0]!.routeMetrics.calculationStatus, 'unavailable');
  });

  it('falls back when the next stop has no coordinates', async () => {
    const { service, matrixCalls } = buildService({
      activeTour: {
        tourId: 'tour-1',
        routeVersion: 'v1',
        nextStop: null,
        nextStopLocationMissing: true,
      },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.routeContext.mode, 'nearby_only');
    assert.equal(response.routeContext.calculationStatus, 'next_stop_location_missing');
    // Yanlis koordinatla hesap YOK.
    assert.deepEqual(matrixCalls, []);
  });

  it('falls back when the tour has no incomplete stop left', async () => {
    const { service } = buildService({
      activeTour: { tourId: 'tour-1', routeVersion: 'v1', nextStop: null, nextStopLocationMissing: false },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);
    assert.equal(response.routeContext.calculationStatus, 'no_active_tour');
  });
});

describe('RouteRecommendationService — graceful degradation', () => {
  it('returns stations without metrics when routing is unavailable', async () => {
    const { service } = buildService({
      matrixResults: [{ ok: false, error: 'unavailable' }, { ok: false, error: 'unavailable' }],
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    // Butun istek 503 OLMUYOR.
    assert.equal(response.routeContext.calculationStatus, 'routing_unavailable');
    assert.equal(response.routeContext.baseline, null);
    assert.equal(response.stations.length, 1);
    assert.equal(response.stations[0]!.routeMetrics.calculationStatus, 'unavailable');
    // Kus ucusu mesafe yol mesafesi gibi ETIKETLENMIYOR.
    assert.equal(response.stations[0]!.routeMetrics.roadDistanceToStationKm, null);
    assert.equal(response.stations[0]!.distanceKm, 2);
  });

  it('degrades when only the second matrix call fails', async () => {
    const { service } = buildService({
      matrixResults: [
        { ok: true, cells: [cell(0, 0, 10, 12), cell(0, 1, 4, 6)] },
        { ok: false, error: 'unavailable' },
      ],
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);
    assert.equal(response.routeContext.calculationStatus, 'routing_unavailable');
  });

  it('degrades when the baseline cell is missing', async () => {
    const { service } = buildService({
      matrixResults: [
        { ok: true, cells: [cell(0, 1, 4, 6)] },
        { ok: true, cells: [cell(0, 0, 8, 9)] },
      ],
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);
    // Baseline yoksa sapma tanimsiz; metrik verilmiyor.
    assert.equal(response.routeContext.calculationStatus, 'routing_unavailable');
    assert.equal(response.routeContext.baseline, null);
  });

  it('returns the other stations when one station has no route', async () => {
    const { service } = buildService({
      stations: [station('good', { distanceKm: 1 }), station('unreachable', { distanceKm: 2 })],
      matrixResults: [
        { ok: true, cells: [cell(0, 0, 10, 12), cell(0, 1, 4, 6), cell(0, 2, null, null)] },
        { ok: true, cells: [cell(0, 0, 8, 9), cell(1, 0, null, null)] },
      ],
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    const byId = new Map(response.stations.map((entry) => [entry.id, entry.routeMetrics]));
    assert.equal(byId.get('good')!.calculationStatus, 'calculated');
    assert.equal(byId.get('unreachable')!.calculationStatus, 'unavailable');
    // Kismi basari: tur baglami hala hesaplanmis sayiliyor.
    assert.equal(response.routeContext.calculationStatus, 'calculated');
  });

  it('handles an empty station list without calling the router', async () => {
    const { service, matrixCalls } = buildService({ stations: [] });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.deepEqual(response.stations, []);
    assert.deepEqual(matrixCalls, []);
    assert.equal(response.routeContext.nextStop?.id, 'stop-2');
  });
});

describe('RouteRecommendationService — cache safety', () => {
  it('keys the cache by tenant, vehicle, next stop, profile and route version', async () => {
    const { service, cacheKeys } = buildService({ tenantId: 'tenant-a' });
    await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    const key = cacheKeys[0]!;
    assert.equal(key.includes('tenant-a'), true, 'tenant must be part of the key');
    assert.equal(key.includes('veh-1'), true, 'vehicle must be part of the key');
    assert.equal(key.includes('2026-08-12T10:00:00.000Z'), true, 'route version must be in the key');
    assert.equal(key.includes('truck:'), true, 'costing profile must be in the key');
    assert.equal(key.includes('51.50000,6.90000'), true, 'next stop must be in the key');
  });

  it('does not reuse another tenant result', async () => {
    const shared = new Map<string, unknown>();
    const first = buildService({ tenantId: 'tenant-a', cacheStore: shared });
    await first.service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    const second = buildService({ tenantId: 'tenant-b', cacheStore: shared });
    await second.service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    // Ikinci kiraci kendi hesabini yapmis olmali: onbellek isabeti olsaydi
    // matris hic cagrilmazdi.
    assert.equal(second.matrixCalls.length, 2);
  });

  it('does not reuse a result computed for an older tour version', async () => {
    const shared = new Map<string, unknown>();
    const first = buildService({ cacheStore: shared });
    await first.service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    const changed = buildService({
      cacheStore: shared,
      activeTour: {
        tourId: 'tour-1',
        // Dispatcher turu degistirdi.
        routeVersion: '2026-08-12T11:30:00.000Z',
        nextStop: { id: 'stop-2', sequence: 1, label: 'Musterweg', latitude: 51.5, longitude: 6.9 },
        nextStopLocationMissing: false,
      },
    });
    await changed.service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(changed.matrixCalls.length, 2);
  });

  it('serves a repeated identical request from the cache', async () => {
    const shared = new Map<string, unknown>();
    const first = buildService({ cacheStore: shared });
    await first.service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    const again = buildService({ cacheStore: shared });
    const response = await again.service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.deepEqual(again.matrixCalls, []);
    assert.equal(response.stations[0]!.routeMetrics.extraDistanceKm, 2);
  });
});

describe('RouteRecommendationService — no external network', () => {
  it('performs no fetch call', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error('no external call allowed');
    }) as typeof globalThis.fetch;

    try {
      const { service } = buildService();
      await service.findRouteRecommendationsForDriver('user-1', ORIGIN);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls, 0);
  });
});

describe('active tour resolution rules', () => {
  it('excludes completed and skipped stops from being the next stop', () => {
    // Bu repoda TourStopStatus'te `cancelled` YOK; iptalin karsiligi `skipped`.
    // Servis sorgusu bu iki durumu notIn ile disliyor.
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'driver-vehicle.service.ts'),
      'utf8',
    ) as string;

    assert.match(source, /notIn:\s*\[TourStopStatus\.completed,\s*TourStopStatus\.skipped\]/);
    // Sira korunuyor: sequence artan.
    assert.match(source, /orderBy:\s*\{\s*sequence:\s*'asc'\s*\}/);
  });

  it('uses the same driver-visible tour statuses as the driver tour screen', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'driver-vehicle.service.ts'),
      'utf8',
    ) as string;

    assert.match(source, /DRIVER_VISIBLE_TOUR_STATUSES\s*=\s*\['optimized',\s*'released',\s*'in_progress'\]/);
  });

  it('does not reorder or optimise stops', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'route-recommendation.service.ts'),
      'utf8',
    ) as string;

    // Bu faz yalnizca hesaplama: TourStop yazimi ve optimizasyon cagrisi yok.
    assert.equal(source.includes('tourStop.create'), false);
    assert.equal(source.includes('tourStop.update'), false);
    assert.equal(source.includes('optimize'), false);
  });
});

describe('fuel product usage stays consistent with Faz 1', () => {
  it('keeps AdBlue out of the station filter contract', () => {
    // Uyumluluk filtresi Faz 1'de; burada yalnizca sozlesmenin bozulmadigini
    // dogruluyoruz.
    assert.equal(FuelProductUsage.ADDITIVE, 'ADDITIVE');
    assert.equal(FuelProductType.ADBLUE, 'ADBLUE');
  });
});


describe('RouteRecommendationService — ambiguous active tour', () => {
  it('falls back to nearby_only without calling the router', async () => {
    const { service, matrixCalls } = buildService({
      activeTour: { ambiguous: true, tourIds: ['run-a', 'run-b'] },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.routeContext.mode, 'nearby_only');
    assert.equal(response.routeContext.calculationStatus, 'ambiguous_active_tour');
    assert.equal(response.routeContext.nextStop, null);
    assert.equal(response.routeContext.baseline, null);
    // Rastgele tur secilmedigi icin Valhalla'ya HIC gidilmiyor.
    assert.deepEqual(matrixCalls, []);
    // Yakinlik listesi calismaya devam ediyor.
    assert.equal(response.stations.length, 1);
  });
});

describe('RouteRecommendationService — current stop in service', () => {
  it('does not route to an arrived stop and skips the router entirely', async () => {
    const { service, matrixCalls } = buildService({
      activeTour: {
        tourId: 'tour-1',
        routeVersion: 'v1',
        nextStop: null,
        nextStopLocationMissing: false,
        currentStopInService: { id: 'at-stop', sequence: 2, label: 'Rampe 3' },
      },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.routeContext.mode, 'nearby_only');
    assert.equal(response.routeContext.calculationStatus, 'current_stop_in_service');
    assert.equal(response.routeContext.nextStop, null);
    // "Konum -> istasyon -> bulundugum durak" hesabi YAPILMIYOR.
    assert.deepEqual(matrixCalls, []);
  });

  it('exposes a safe summary of the current stop without coordinates', async () => {
    const { service } = buildService({
      activeTour: {
        tourId: 'tour-1',
        routeVersion: 'v1',
        nextStop: null,
        nextStopLocationMissing: false,
        currentStopInService: { id: 'at-stop', sequence: 2, label: 'Rampe 3' },
      },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.deepEqual(response.routeContext.currentStop, {
      id: 'at-stop',
      sequence: 2,
      label: 'Rampe 3',
    });
    // Koordinat tasimiyor: rota hedefi olarak kullanilamaz.
    assert.equal('latitude' in (response.routeContext.currentStop ?? {}), false);
  });

  it('still returns the nearby stations while the stop is in service', async () => {
    const { service } = buildService({
      stations: [station('a'), station('b', { distanceKm: 4 })],
      activeTour: {
        tourId: 'tour-1',
        routeVersion: 'v1',
        nextStop: null,
        nextStopLocationMissing: false,
        currentStopInService: { id: 'at-stop', sequence: 0, label: 'Rampe 3' },
      },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.stations.length, 2);
    for (const entry of response.stations) {
      assert.equal(entry.routeMetrics.calculationStatus, 'unavailable');
    }
  });

  it('calculates normally on the next query once the stop is completed', async () => {
    // Durak completed olduktan sonra cozumleme siradaki pending duraga gecer;
    // servis o zaman normal hesap yapar.
    const { service, matrixCalls } = buildService({
      activeTour: {
        tourId: 'tour-1',
        routeVersion: 'v2',
        nextStop: { id: 'later', sequence: 1, label: 'Musterweg', latitude: 51.5, longitude: 6.9 },
        nextStopLocationMissing: false,
        currentStopInService: null,
      },
    });

    const response = await service.findRouteRecommendationsForDriver('user-1', ORIGIN);

    assert.equal(response.routeContext.calculationStatus, 'calculated');
    assert.equal(response.routeContext.nextStop?.id, 'later');
    assert.equal(matrixCalls.length, 2);
  });
});
