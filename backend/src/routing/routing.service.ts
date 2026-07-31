import { Injectable, Logger } from '@nestjs/common';
import { GeocodeSource, type Location, TruckAccessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addressHash } from './core/address-normalize.util';
import {
  DEFAULT_TRUCK_PROFILE,
  type ElevationProfile,
  type GeoPoint,
  type MatrixCell,
  type RouteSummary,
  type RoutingResult,
  type TruckProfile,
} from './core/routing.types';
import { GeocodingService } from './geocoding.service';
import { RoutingCacheService } from './routing-cache.service';
import { ValhallaClient } from './valhalla.client';

/**
 * Kamyon erisilebilirligi dogrulanirken hedefe rota denenen referans nokta.
 *
 * Neden gerekli: /locate verbose kontrolu YETMIYOR. Olculdu — Bielefeld'in
 * kamyona kapali koordinati da, saglam bir liman koordinati da `access.truck: true`
 * donduruyor. Sorun kenarin erisim bayragi degil, kenarin kamyon agindan kopuk
 * olmasi. Tek guvenilir kontrol gercek bir rota denemesi.
 *
 * Maliyeti kabul edilebilir: Location basina bir kez calisir, sonuc kayda yazilir.
 */
function accessProbePoint(): GeoPoint {
  const latitude = Number(process.env.ROUTING_ACCESS_PROBE_LAT);
  const longitude = Number(process.env.ROUTING_ACCESS_PROBE_LON);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude };
  }
  // Duisburg Hafen — Almanya'nin en buyuk ic liman dugumu, kamyon aginda
  // guvenli sekilde bagli ve NRW gelistirme tile'lari icinde.
  return { latitude: 51.4408, longitude: 6.7069 };
}

export interface ResolveLocationParams {
  rawAddress: string;
  /** Musteri adresiyse Location o firmaya baglanir */
  companyId?: string | null;
  label?: string | null;
  /** Kamyon erisim kontrolunu atlar — toplu backfill'de tek tek kontrol pahali olur */
  skipTruckAccessCheck?: boolean;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly valhalla: ValhallaClient,
    private readonly geocoding: GeocodingService,
    private readonly cache: RoutingCacheService,
  ) {}

  /** Onbellek anahtari icin koordinat sadelestirmesi (~11 m cozunurluk). */
  private coordKey(point: GeoPoint): string {
    return `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
  }

  private profileKey(profile: TruckProfile): string {
    return [
      profile.height,
      profile.width,
      profile.length,
      profile.weight,
      profile.axleLoad,
      profile.hazmat ? 1 : 0,
    ].join('|');
  }

  /**
   * Adresi Location kaydina cevirir. Ayni adres tenant icinde ikinci kez
   * geocode edilmez — normalizedHash uzerinden mevcut kayit paylasilir.
   *
   * Geocode veya erisim kontrolu basarisiz olsa bile kayit olusur: adres metni
   * korunur, koordinat alanlari bos kalir ve sonradan yeniden denenebilir.
   * Gorev kaydetme akisi geocoder arizasi yuzunden durmamali.
   */
  async resolveLocation(params: ResolveLocationParams): Promise<Location | null> {
    const rawAddress = params.rawAddress?.trim() ?? '';
    if (!rawAddress) {
      return null;
    }

    const normalizedHash = addressHash(rawAddress);
    const existing = await this.prisma.location.findFirst({ where: { normalizedHash } });
    if (existing) {
      return existing;
    }

    const geocoded = await this.geocoding.geocode(rawAddress);

    if (!geocoded.ok) {
      this.logger.warn(`Geocoding failed for "${rawAddress}": ${geocoded.message}`);
      return this.prisma.location.create({
        data: {
          rawAddress,
          normalizedHash,
          label: params.label ?? null,
          companyId: params.companyId ?? null,
        },
      });
    }

    const hit = geocoded.value;
    let truckAccess: TruckAccessStatus = TruckAccessStatus.unknown;
    let truckAccessCheckedAt: Date | null = null;
    let truckSnapDistanceM: number | null = null;
    let truckAccessNote: string | null = null;

    if (!params.skipTruckAccessCheck) {
      const check = await this.valhalla.checkTruckAccess(
        { latitude: hit.latitude, longitude: hit.longitude },
        accessProbePoint(),
      );

      if (check.ok) {
        truckAccess = check.value.reachable
          ? TruckAccessStatus.reachable
          : TruckAccessStatus.unreachable;
        truckAccessCheckedAt = new Date();
        truckSnapDistanceM = check.value.snapDistanceM;
        truckAccessNote = check.value.note;
      } else {
        truckAccess = TruckAccessStatus.check_failed;
        truckAccessCheckedAt = new Date();
        truckAccessNote = check.message;
      }
    }

    return this.prisma.location.create({
      data: {
        rawAddress,
        normalizedHash,
        label: params.label ?? null,
        companyId: params.companyId ?? null,
        street: hit.street,
        houseNumber: hit.houseNumber,
        postalCode: hit.postalCode,
        city: hit.city,
        countryCode: hit.countryCode,
        latitude: hit.latitude,
        longitude: hit.longitude,
        // Self-host ile public Photon ayni saglayici — ayrim URL'de, kaynak tipinde degil
        geocodeSource: GeocodeSource.photon,
        geocodeConfidence: hit.confidence,
        geocodedAt: new Date(),
        truckAccess,
        truckAccessCheckedAt,
        truckSnapDistanceM,
        truckAccessNote,
      },
    });
  }

  /**
   * Daha once atlanmis veya basarisiz olmus erisim kontrolunu tekrar dener.
   * Backfill sonrasi toplu dogrulama icin.
   */
  async recheckTruckAccess(locationId: string): Promise<Location | null> {
    const location = await this.prisma.location.findFirst({ where: { id: locationId } });
    if (!location || location.latitude === null || location.longitude === null) {
      return location;
    }

    const check = await this.valhalla.checkTruckAccess(
      { latitude: Number(location.latitude), longitude: Number(location.longitude) },
      accessProbePoint(),
    );

    if (!check.ok) {
      return this.prisma.location.update({
        where: { id: location.id },
        data: {
          truckAccess: TruckAccessStatus.check_failed,
          truckAccessCheckedAt: new Date(),
          truckAccessNote: check.message,
        },
      });
    }

    return this.prisma.location.update({
      where: { id: location.id },
      data: {
        truckAccess: check.value.reachable
          ? TruckAccessStatus.reachable
          : TruckAccessStatus.unreachable,
        truckAccessCheckedAt: new Date(),
        truckSnapDistanceM: check.value.snapDistanceM,
        truckAccessNote: check.value.note,
      },
    });
  }

  /** Onbellekli nokta-nokta kamyon rotasi. */
  async routeBetween(
    from: GeoPoint,
    to: GeoPoint,
    profile: TruckProfile = DEFAULT_TRUCK_PROFILE,
  ): Promise<RoutingResult<RouteSummary>> {
    const key = `route:${this.coordKey(from)}:${this.coordKey(to)}:${this.profileKey(profile)}`;
    const cached = await this.cache.get<RouteSummary>(key);
    if (cached) {
      return { ok: true, value: cached };
    }

    const result = await this.valhalla.route([from, to], profile);
    if (result.ok) {
      await this.cache.set(key, result.value);
    }
    return result;
  }

  /**
   * Onbellekli mesafe matrisi. Olculen maliyet nedeniyle (41x41 soguk 7,1 sn)
   * senkron istek icinde degil, arka plan job'unda cagrilmali.
   */
  async matrix(
    points: GeoPoint[],
    profile: TruckProfile = DEFAULT_TRUCK_PROFILE,
  ): Promise<RoutingResult<MatrixCell[]>> {
    const key = `matrix:${points.map((p) => this.coordKey(p)).join(';')}:${this.profileKey(profile)}`;
    const cached = await this.cache.get<MatrixCell[]>(key);
    if (cached) {
      return { ok: true, value: cached };
    }

    const result = await this.valhalla.matrix(points, points, profile);
    if (result.ok) {
      await this.cache.set(key, result.value);
    }
    return result;
  }

  /** Rota govdesi uzerindeki rakim profili — yakit modeli girdisi. */
  async elevationFor(
    shape: string,
    distanceKm: number,
  ): Promise<RoutingResult<ElevationProfile>> {
    const key = `elevation:${shape.length}:${shape.slice(0, 64)}`;
    const cached = await this.cache.get<ElevationProfile>(key);
    if (cached) {
      return { ok: true, value: cached };
    }

    const result = await this.valhalla.elevationProfile(shape, distanceKm);
    if (result.ok) {
      await this.cache.set(key, result.value);
    }
    return result;
  }

  /** Rota motorunun ayakta olup olmadigi. */
  async health(): Promise<{ available: boolean; version: string | null; message?: string }> {
    const status = await this.valhalla.status();
    return status.ok
      ? { available: true, version: status.value.version }
      : { available: false, version: null, message: status.message };
  }
}
