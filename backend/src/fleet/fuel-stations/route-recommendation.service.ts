import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutingCacheService } from '../../routing/routing-cache.service';
import { RoutingService } from '../../routing/routing.service';
import { DEFAULT_TRUCK_PROFILE, type GeoPoint, type MatrixCell } from '../../routing/core/routing.types';
import { DriverVehicleService } from '../driver-vehicle.service';
import {
  MAX_ROUTE_CANDIDATES,
  UNAVAILABLE_ROUTE_METRICS,
  computeStationRouteMetrics,
  isUsableMetric,
  selectRouteCandidates,
  type StationRouteMetrics,
} from './core/route-recommendation.util';
import { FuelStationService, type NearbyFuelStationsResponse } from './fuel-station.service';
import type { NormalizedFuelStation } from './fuel-station.types';

/** Sapma onbelleginin TTL'i. Kisa: konum ve tur icinde degisiyor. */
const ROUTE_METRICS_TTL_SECONDS = 120;

export type RouteCalculationStatus =
  | 'calculated'
  | 'no_active_tour'
  | 'next_stop_location_missing'
  | 'routing_unavailable';

export interface RouteContext {
  mode: 'active_tour' | 'nearby_only';
  calculatedAt: string;
  nextStop: {
    id: string;
    sequence: number;
    label: string;
    latitude: number;
    longitude: number;
  } | null;
  baseline: { distanceKm: number; durationMin: number } | null;
  calculationStatus: RouteCalculationStatus;
}

export type RouteRecommendationStation = NormalizedFuelStation & {
  routeMetrics: StationRouteMetrics;
};

export interface RouteRecommendationsResponse
  extends Omit<NearbyFuelStationsResponse, 'stations' | 'search' | 'vehicle'> {
  vehicle: NearbyFuelStationsResponse['vehicle'] & {
    /**
     * Aracin ortalama tuketimi (L/100 km) — ekonomik karsilastirmanin tek
     * guvenilir girdisi. null ise arayuz ekonomik toplami GOSTERMEZ; uydurma
     * bir tuketim degeri kullanilmaz.
     */
    avgConsumptionLPer100Km: number | null;
  };
  search: NearbyFuelStationsResponse['search'] & { retrievedAt: string };
  routeContext: RouteContext;
  stations: RouteRecommendationStation[];
}

/** Onbellege yazilan sadeleseik metrik kaydi. */
type CachedMetrics = Record<string, StationRouteMetrics>;

/**
 * Istasyonlari kus ucusu mesafe yerine AKTIF TURA olan gercek yol sapmasina
 * gore degerlendirir.
 *
 * Istasyon bu fazda surucunun bir SONRAKI ugrayacagi nokta kabul edilir;
 * tamamlanmamis musteri duraklarinin sirasi DEGISTIRILMEZ ve hicbir sey
 * kalici olarak yazilmaz (TourStop, yeniden optimizasyon, plan degisikligi YOK).
 *
 * Faz 3 davranisi korunuyor: istasyonlar FuelStationService'ten BIR KEZ
 * aliniyor (arac cozumlemesi, yakit uyumlulugu filtresi ve saglayici hatasi
 * davranisi oradan gelir). Valhalla calismazsa istek 503 OLMAZ — istasyonlar
 * rota metrigi olmadan doner.
 */
@Injectable()
export class RouteRecommendationService {
  private readonly logger = new Logger(RouteRecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fuelStations: FuelStationService,
    private readonly driverVehicle: DriverVehicleService,
    private readonly routing: RoutingService,
    private readonly cache: RoutingCacheService,
  ) {}

  /** Loglarda koordinat hassasiyeti dusuruluyor (~1 km) — takip verisi sizmasin. */
  private coarse(point: GeoPoint): string {
    return `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;
  }

  private cacheKey(params: {
    tenantId: string;
    vehicleId: string;
    origin: GeoPoint;
    nextStop: GeoPoint;
    routeVersion: string;
    stationIds: readonly string[];
  }): string {
    // Anahtar bilincli olarak KIRACI + ARAC + tur surumu iceriyor: baska
    // kiracinin ya da degistirilmis bir turun sonucu yeniden kullanilamaz.
    return [
      'fuelroute',
      params.tenantId,
      params.vehicleId,
      `${params.origin.latitude.toFixed(4)},${params.origin.longitude.toFixed(4)}`,
      `${params.nextStop.latitude.toFixed(5)},${params.nextStop.longitude.toFixed(5)}`,
      params.routeVersion,
      // Profil anahtarda: profil degisirse eski sapma kullanilmaz.
      `truck:${DEFAULT_TRUCK_PROFILE.weight}:${DEFAULT_TRUCK_PROFILE.height}`,
      [...params.stationIds].sort().join(','),
    ].join('|');
  }

  private cellFor(
    cells: readonly MatrixCell[],
    sourceIndex: number,
    targetIndex: number,
  ): { distanceKm: number | null; durationMin: number | null } {
    const cell = cells.find(
      (entry) => entry.sourceIndex === sourceIndex && entry.targetIndex === targetIndex,
    );
    return {
      distanceKm: cell && isUsableMetric(cell.distanceKm) ? cell.distanceKm : null,
      durationMin: cell && isUsableMetric(cell.durationMinutes) ? cell.durationMinutes : null,
    };
  }

  async findRouteRecommendationsForDriver(
    userId: string,
    query: { latitude: number; longitude: number; radiusKm: number },
  ): Promise<RouteRecommendationsResponse> {
    // 1) Faz 3 servisi: arac cozumlemesi + uyumluluk filtresi + saglayici.
    //    Saglayici/uyumluluk hatalari (503/409) buradan AYNEN yukselir.
    const nearby = await this.fuelStations.findNearbyForDriver(userId, query);

    const retrievedAt =
      nearby.stations[0]?.retrievedAt ?? new Date().toISOString();
    const calculatedAt = new Date().toISOString();
    const origin: GeoPoint = { latitude: query.latitude, longitude: query.longitude };
    const meta = await this.vehicleMeta(nearby.vehicle.id);
    const vehicle = {
      ...nearby.vehicle,
      avgConsumptionLPer100Km: meta.avgConsumptionLPer100Km,
    };

    const withoutMetrics = (status: RouteCalculationStatus): RouteRecommendationsResponse => ({
      ...nearby,
      vehicle,
      search: { ...nearby.search, retrievedAt },
      routeContext: {
        mode: status === 'calculated' ? 'active_tour' : 'nearby_only',
        calculatedAt,
        nextStop: null,
        baseline: null,
        calculationStatus: status,
      },
      stations: nearby.stations.map((station) => ({
        ...station,
        routeMetrics: UNAVAILABLE_ROUTE_METRICS,
      })),
    });

    // 2) Aktif tur ve siradaki durak — SUNUCUDA cozuluyor.
    const driver = await this.driverVehicle.requireDriverForUser(userId);
    const active = await this.driverVehicle.resolveActiveTourNextStop(driver.id);

    // Aktif tur yok ya da koordinatli durak yok: HATA DEGIL, Faz 3 yakinlik
    // davranisi korunuyor.
    if (!active) {
      return withoutMetrics('no_active_tour');
    }
    if (!active.nextStop) {
      return withoutMetrics(
        active.nextStopLocationMissing ? 'next_stop_location_missing' : 'no_active_tour',
      );
    }

    const nextStop = active.nextStop;
    const nextStopPoint: GeoPoint = {
      latitude: nextStop.latitude,
      longitude: nextStop.longitude,
    };

    if (nearby.stations.length === 0) {
      return {
        ...nearby,
        vehicle,
        search: { ...nearby.search, retrievedAt },
        routeContext: {
          mode: 'active_tour',
          calculatedAt,
          nextStop,
          baseline: null,
          calculationStatus: 'calculated',
        },
        stations: [],
      };
    }

    // 3) Aday secimi: kontrolsuz hesaplama yok, en fazla MAX_ROUTE_CANDIDATES.
    const candidates = selectRouteCandidates(nearby.stations, MAX_ROUTE_CANDIDATES);
    const candidateIds = candidates.map((station) => station.id);

    const key = this.cacheKey({
      tenantId: meta.tenantId ?? 'unknown',
      vehicleId: nearby.vehicle.id,
      origin,
      nextStop: nextStopPoint,
      routeVersion: active.routeVersion,
      stationIds: candidateIds,
    });

    const cached = await this.cache.get<{ baseline: RouteContext['baseline']; metrics: CachedMetrics }>(key);
    if (cached) {
      return this.assemble(nearby, vehicle, retrievedAt, calculatedAt, nextStop, cached.baseline, cached.metrics);
    }

    // 4) Valhalla: IKI matris cagrisi, istasyon basina ardisik cagri YOK.
    //    Butun segmentler ayni truck profili ve ayni birimlerle — profil
    //    karistirilirsa toplanan sapma anlamsiz olur. `auto` profiline
    //    DUSULMUYOR (repo genelinde costing 'truck').
    const stationPoints: GeoPoint[] = candidates.map((station) => ({
      latitude: station.latitude,
      longitude: station.longitude,
    }));

    const [fromOrigin, toNextStop] = await Promise.all([
      // kaynak: konum -> hedefler: [sonraki durak, ...istasyonlar]
      this.routing.matrixBetween(
        [origin],
        [nextStopPoint, ...stationPoints],
        DEFAULT_TRUCK_PROFILE,
        ROUTE_METRICS_TTL_SECONDS,
      ),
      // kaynaklar: istasyonlar -> hedef: sonraki durak
      this.routing.matrixBetween(
        stationPoints,
        [nextStopPoint],
        DEFAULT_TRUCK_PROFILE,
        ROUTE_METRICS_TTL_SECONDS,
      ),
    ]);

    if (!fromOrigin.ok || !toNextStop.ok) {
      // Rota motoru calismiyor: istasyonlar YINE donuyor, yalnizca metrik yok.
      this.logger.warn(
        `Route metrics unavailable near ${this.coarse(origin)}: ` +
          `${fromOrigin.ok ? toNextStop.ok ? '' : toNextStop.error : fromOrigin.error}`,
      );
      return {
        ...nearby,
        vehicle,
        search: { ...nearby.search, retrievedAt },
        routeContext: {
          mode: 'active_tour',
          calculatedAt,
          nextStop,
          baseline: null,
          calculationStatus: 'routing_unavailable',
        },
        stations: nearby.stations.map((station) => ({
          ...station,
          routeMetrics: UNAVAILABLE_ROUTE_METRICS,
        })),
      };
    }

    const baselineCell = this.cellFor(fromOrigin.value, 0, 0);
    if (!isUsableMetric(baselineCell.distanceKm) || !isUsableMetric(baselineCell.durationMin)) {
      // Baseline yoksa sapma tanimsizdir; kus ucusu mesafeyi yol mesafesi gibi
      // sunmak yerine metrik verilmiyor.
      return {
        ...nearby,
        vehicle,
        search: { ...nearby.search, retrievedAt },
        routeContext: {
          mode: 'active_tour',
          calculatedAt,
          nextStop,
          baseline: null,
          calculationStatus: 'routing_unavailable',
        },
        stations: nearby.stations.map((station) => ({
          ...station,
          routeMetrics: UNAVAILABLE_ROUTE_METRICS,
        })),
      };
    }

    const baseline = {
      distanceKm: Number(baselineCell.distanceKm.toFixed(2)),
      durationMin: Number(baselineCell.durationMin.toFixed(1)),
    };
    const departureAt = new Date(calculatedAt);

    const metrics: CachedMetrics = {};
    for (const [index, station] of candidates.entries()) {
      // fromOrigin hedefleri: 0 = sonraki durak, 1..N = istasyonlar
      const toStation = this.cellFor(fromOrigin.value, 0, index + 1);
      const stationToNextStop = this.cellFor(toNextStop.value, index, 0);

      const { metrics: stationMetrics, suspiciousNegative } = computeStationRouteMetrics({
        baseline: { distanceKm: baseline.distanceKm, durationMin: baseline.durationMin },
        toStation,
        stationToNextStop,
        departureAt,
      });

      if (suspiciousNegative) {
        // Sessizce gizlenmiyor: isaretlenip unavailable donuyor.
        this.logger.warn(
          `Negative detour beyond tolerance for station ${station.id} near ${this.coarse(origin)} — reported as unavailable`,
        );
      }

      metrics[station.id] = stationMetrics;
    }

    await this.cache.set(key, { baseline, metrics }, ROUTE_METRICS_TTL_SECONDS);

    return this.assemble(nearby, vehicle, retrievedAt, calculatedAt, nextStop, baseline, metrics);
  }

  /**
   * Aracin onbellek/ekonomi meta verisi — TEK sorgu.
   *
   * tenantId onbellek anahtarinin kiraci bileseni; avgConsumptionLPer100Km
   * ekonomik karsilastirmanin kapisi (yoksa arayuz toplam gostermez).
   */
  private async vehicleMeta(
    vehicleId: string,
  ): Promise<{ tenantId: string | null; avgConsumptionLPer100Km: number | null }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { tenantId: true, avgConsumptionLPer100Km: true },
    });

    const raw = vehicle?.avgConsumptionLPer100Km;
    const consumption = raw === null || raw === undefined ? null : Number(raw);

    return {
      tenantId: vehicle?.tenantId ?? null,
      avgConsumptionLPer100Km:
        consumption !== null && Number.isFinite(consumption) && consumption > 0 ? consumption : null,
    };
  }

  private assemble(
    nearby: NearbyFuelStationsResponse,
    vehicle: RouteRecommendationsResponse['vehicle'],
    retrievedAt: string,
    calculatedAt: string,
    nextStop: NonNullable<RouteContext['nextStop']>,
    baseline: RouteContext['baseline'],
    metrics: CachedMetrics,
  ): RouteRecommendationsResponse {
    return {
      ...nearby,
      vehicle,
      search: { ...nearby.search, retrievedAt },
      routeContext: {
        mode: 'active_tour',
        calculatedAt,
        nextStop,
        baseline,
        // Baseline hesaplanabildiyse baglam 'calculated'. Tek tek istasyonlarin
        // basarisizligi kendi routeMetrics.calculationStatus'unda kaliyor.
        calculationStatus: baseline ? 'calculated' : 'routing_unavailable',
      },
      // Aday olmayan istasyonlar da listede KALIYOR (metrikleri unavailable):
      // liste ile harita tutarli olsun ve surucu yakinindaki her istasyonu
      // gormeye devam etsin.
      stations: nearby.stations.map((station) => ({
        ...station,
        routeMetrics: metrics[station.id] ?? UNAVAILABLE_ROUTE_METRICS,
      })),
    };
  }
}
