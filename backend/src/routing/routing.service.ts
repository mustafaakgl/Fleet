import { Injectable, Logger } from '@nestjs/common';
import { GeocodeSource, type Location, Prisma, TruckAccessStatus } from '@prisma/client';
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
import { type AddressSuggestion, GeocodingService } from './geocoding.service';
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

  /**
   * Location olusturur; ayni normalizedHash baskasi tarafindan araya girip
   * yazildiysa o kaydi doner.
   *
   * Gerekli: bir gorevin alis ve teslim adresi paralel cozumleniyor ve ikisi ayni
   * olabiliyor; ayrica ayni anda birden fazla gorev islenebiliyor. "Once bak,
   * yoksa yaz" deseni bu durumda @@unique([tenantId, normalizedHash]) kisitini
   * ihlal ediyor. Toplu backfill'de 1021 gorevin 1'inde gozlendi.
   */
  private async createLocationIdempotent(
    // Unchecked varyant: tenant uzantisi `tenantId` skalerini data'ya enjekte
    // ediyor; iliski bicimli (checked) girdiyle karistirilamaz.
    data: Prisma.LocationUncheckedCreateInput,
    normalizedHash: string,
  ): Promise<Location | null> {
    try {
      return await this.prisma.location.create({ data });
    } catch (error) {
      // instanceof yerine kod kontrolu: ts-node/tsx altinda birden fazla
      // @prisma/client ornegi yuklenebiliyor ve instanceof yaniltici oluyor.
      const code = (error as { code?: unknown } | null)?.code;
      if (code !== 'P2002') {
        throw error;
      }
      return this.prisma.location.findFirst({ where: { normalizedHash } });
    }
  }

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
    return (await this.resolveLocationDetailed(params)).location;
  }

  /**
   * resolveLocation ile ayni, ama geocoder'a gercekten gidilip gidilmedigini de
   * bildirir. Toplu islemde hiz sinirlamasi buna gore uygulanir: mevcut bir
   * Location paylasildiginde bekleme gereksizdir. Olcum: 1029 gorevde yalnizca
   * 31 benzersiz adres var, yani cagrilarin %97'si onbellekten karsilaniyor.
   */
  async resolveLocationDetailed(
    params: ResolveLocationParams,
  ): Promise<{ location: Location | null; geocoded: boolean }> {
    const rawAddress = params.rawAddress?.trim() ?? '';
    if (!rawAddress) {
      return { location: null, geocoded: false };
    }

    const normalizedHash = addressHash(rawAddress);
    const existing = await this.prisma.location.findFirst({ where: { normalizedHash } });
    if (existing) {
      return { location: existing, geocoded: false };
    }

    const geocoded = await this.geocoding.geocode(rawAddress);

    if (!geocoded.ok) {
      this.logger.warn(`Geocoding failed for "${rawAddress}": ${geocoded.message}`);
      const location = await this.createLocationIdempotent(
        {
          rawAddress,
          normalizedHash,
          label: params.label ?? null,
          companyId: params.companyId ?? null,
        },
        normalizedHash,
      );
      return { location, geocoded: true };
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
        // out_of_coverage dahil tum basarisizliklar check_failed olur — asla
        // unreachable degil. Kapsam disi bir adresi "kamyona kapali" isaretlemek
        // operasyona yanlis alarm verir; bilmiyoruz, bilmedigimizi kaydediyoruz.
        truckAccess = TruckAccessStatus.check_failed;
        truckAccessCheckedAt = new Date();
        truckAccessNote =
          check.error === 'out_of_coverage'
            ? 'Adres mevcut harita kapsaminin disinda — erisim dogrulanamadi'
            : check.message;
      }
    }

    const location = await this.createLocationIdempotent(
      {
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
      normalizedHash,
    );

    return { location, geocoded: true };
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
          truckAccessNote:
            check.error === 'out_of_coverage'
              ? 'Adres mevcut harita kapsaminin disinda — erisim dogrulanamadi'
              : check.message,
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

  /**
   * Gorevin adres metinlerini Location kayitlarina baglar.
   *
   * Transaction ICINDE cagrilmamali: geocoding ve kamyon erisim kontrolu ag
   * cagrisi, birlikte saniyeler surebilir ve acik transaction kilitleri tutar.
   * Commit sonrasi calistirilir.
   */
  async linkAssignmentLocations(
    assignmentId: string,
    options: { skipTruckAccessCheck?: boolean } = {},
  ): Promise<{ geocodeCalls: number }> {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId },
      select: {
        id: true,
        companyId: true,
        pickupAddress: true,
        deliveryAddress: true,
        pickupLocationId: true,
        deliveryLocationId: true,
      },
    });

    if (!assignment) {
      return { geocodeCalls: 0 };
    }

    const empty = { location: null, geocoded: false };
    const [pickup, delivery] = await Promise.all([
      assignment.pickupLocationId
        ? empty
        : this.resolveLocationDetailed({
            rawAddress: assignment.pickupAddress,
            companyId: assignment.companyId,
            skipTruckAccessCheck: options.skipTruckAccessCheck,
          }),
      assignment.deliveryLocationId
        ? empty
        : this.resolveLocationDetailed({
            rawAddress: assignment.deliveryAddress,
            companyId: assignment.companyId,
            skipTruckAccessCheck: options.skipTruckAccessCheck,
          }),
    ]);

    const geocodeCalls = (pickup.geocoded ? 1 : 0) + (delivery.geocoded ? 1 : 0);

    if (!pickup.location && !delivery.location) {
      return { geocodeCalls };
    }

    await this.prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        ...(pickup.location ? { pickupLocationId: pickup.location.id } : {}),
        ...(delivery.location ? { deliveryLocationId: delivery.location.id } : {}),
      },
    });

    return { geocodeCalls };
  }

  /**
   * Bekletmeden baglama. Gorev kaydetme yanitini geciktirmemeli — geocoder
   * yavas ya da kapali olsa bile gorev olusmus sayilir, baglama sonra
   * backfill ile tamamlanir. driver-notify'daki notifyUserSafely deseni.
   */
  linkAssignmentLocationsSafely(assignmentId: string): void {
    void this.linkAssignmentLocations(assignmentId).catch((error: unknown) => {
      this.logger.warn(
        `Failed to link locations for assignment ${assignmentId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    });
  }

  /**
   * Adres degistiginde eski baglantiyi dusurur ki yeniden cozumlensin.
   * Location kayitlari paylasildigi icin silinmez, sadece bagi kopariliyor.
   */
  async unlinkAssignmentLocations(
    assignmentId: string,
    fields: { pickup: boolean; delivery: boolean },
  ): Promise<void> {
    if (!fields.pickup && !fields.delivery) {
      return;
    }
    await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        ...(fields.pickup ? { pickupLocationId: null } : {}),
        ...(fields.delivery ? { deliveryLocationId: null } : {}),
      },
    });
  }

  /**
   * Yazarken gosterilecek adres onerileri, Redis onbellekli.
   *
   * Onbellek burada zorunlu: bu uc tus basina cagriliyor. Gelistirmede public
   * Photon kullaniliyor ve ayni on ekler surekli tekrar ediyor ("Duis", "Duisb",
   * "Duisbu"...), isabet orani cok yuksek oluyor.
   */
  async suggestAddresses(params: {
    query: string;
    kind: 'city' | 'street';
    city?: string | null;
    limit?: number;
  }): Promise<RoutingResult<AddressSuggestion[]>> {
    const key = `suggest:${params.kind}:${(params.city ?? '').toLowerCase()}:${params.query
      .trim()
      .toLowerCase()}:${params.limit ?? 8}`;

    const cached = await this.cache.get<AddressSuggestion[]>(key);
    if (cached) {
      return { ok: true, value: cached };
    }

    const result = await this.geocoding.suggest(params);
    if (result.ok) {
      await this.cache.set(key, result.value);
    }
    return result;
  }

  /**
   * Kullanicinin oneri listesinden sectigi adresi Location'a cevirir.
   *
   * resolveLocation'dan farki: geocoder'a HIC gidilmez. Koordinat kullanicinin
   * sectigi adaydan gelir, tahmin yoktur — Dresden/Bremen sinifindaki hatalar
   * bu yolda olusamaz. Kamyon erisim kontrolu yine calisir ve sonuc hemen
   * dondurulur ki arayuz uyariyi aninda gosterebilsin.
   */
  async resolvePickedLocation(params: {
    latitude: number;
    longitude: number;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
    countryCode?: string | null;
    label?: string | null;
    companyId?: string | null;
  }): Promise<Location | null> {
    const rawAddress = [
      [params.street, params.houseNumber].filter(Boolean).join(' '),
      [params.postalCode, params.city].filter(Boolean).join(' '),
    ]
      .filter((segment) => segment.length > 0)
      .join(', ');

    if (!rawAddress) {
      return null;
    }

    const normalizedHash = addressHash(rawAddress);
    const existing = await this.prisma.location.findFirst({ where: { normalizedHash } });
    if (existing) {
      return existing;
    }

    const check = await this.valhalla.checkTruckAccess(
      { latitude: params.latitude, longitude: params.longitude },
      accessProbePoint(),
    );

    const accessFields = check.ok
      ? {
          truckAccess: check.value.reachable
            ? TruckAccessStatus.reachable
            : TruckAccessStatus.unreachable,
          truckAccessCheckedAt: new Date(),
          truckSnapDistanceM: check.value.snapDistanceM,
          truckAccessNote: check.value.note,
        }
      : {
          truckAccess: TruckAccessStatus.check_failed,
          truckAccessCheckedAt: new Date(),
          truckAccessNote:
            check.error === 'out_of_coverage'
              ? 'Adres mevcut harita kapsaminin disinda — erisim dogrulanamadi'
              : check.message,
        };

    return this.createLocationIdempotent(
      {
        rawAddress,
        normalizedHash,
        label: params.label ?? null,
        companyId: params.companyId ?? null,
        street: params.street ?? null,
        houseNumber: params.houseNumber ?? null,
        postalCode: params.postalCode ?? null,
        city: params.city ?? null,
        countryCode: (params.countryCode ?? 'DE').toUpperCase(),
        latitude: params.latitude,
        longitude: params.longitude,
        // Kullanici listeden sectigi icin kaynak manual, guven tam
        geocodeSource: GeocodeSource.manual,
        geocodeConfidence: 1,
        geocodedAt: new Date(),
        ...accessFields,
      },
      normalizedHash,
    );
  }

  /**
   * Iki Location arasinda kamyon rotasi onizlemesi — form doldurulurken
   * km/sure gostermek ve haritayi cizmek icin.
   */
  async routePreviewBetweenLocations(
    fromLocationId: string,
    toLocationId: string,
  ): Promise<RoutingResult<RouteSummary>> {
    const [from, to] = await Promise.all([
      this.prisma.location.findFirst({ where: { id: fromLocationId } }),
      this.prisma.location.findFirst({ where: { id: toLocationId } }),
    ]);

    if (!from || !to) {
      return { ok: false, error: 'invalid_input', message: 'location_not_found' };
    }
    if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) {
      return { ok: false, error: 'invalid_input', message: 'location_without_coordinates' };
    }

    return this.routeBetween(
      { latitude: Number(from.latitude), longitude: Number(from.longitude) },
      { latitude: Number(to.latitude), longitude: Number(to.longitude) },
    );
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
