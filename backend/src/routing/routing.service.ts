import { Injectable, Logger } from '@nestjs/common';
import { GeocodeSource, type Location, Prisma, TruckAccessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addressHash } from './core/address-normalize.util';
import { toCountryCode } from './core/country-code.util';
import { readRegionAnchor } from './core/geo-distance.util';
import {
  DEFAULT_TRUCK_PROFILE,
  type ElevationProfile,
  type GeoPoint,
  type MatrixCell,
  type RouteSummary,
  type RoutingResult,
  type TruckProfile,
} from './core/routing.types';
import {
  type AddressSuggestion,
  buildLabel as formatSuggestionLabel,
  GeocodingService,
} from './geocoding.service';
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
  /**
   * Adresleri once bu kiracinin kendi gecmisinde, sonra geocoder'da arar.
   *
   * Neden gecmis once: bir filo ayni adreslere tekrar tekrar gidiyor. Gecmisten
   * gelen kayitta koordinat zaten secilmis ve kamyon erisimi dogrulanmis
   * durumda — geocoder'in en iyi tahmininden her zaman daha iyi.
   *
   * DIKKAT: onbellek anahtari kiraci icermiyor ve Redis tum kiracilar arasinda
   * paylasiliyor. Bu yuzden onbellege YALNIZCA geocoder sonucu yazilir; gecmis
   * sonuclari her istekte veritabanindan okunur. Aksi halde bir kiracinin musteri
   * adresleri digerinin oneri listesinde gorunurdu.
   */
  async suggestAddresses(params: {
    query: string;
    kind: 'city' | 'street';
    city?: string | null;
    /** Formdaki serbest metin ulke alani; taninmiyorsa yok sayilir */
    country?: string | null;
    limit?: number;
  }): Promise<RoutingResult<AddressSuggestion[]>> {
    const limit = params.limit ?? 8;
    const countryCode = toCountryCode(params.country);
    const history =
      params.kind === 'street'
        ? await this.suggestFromHistory(params.query, params.city, countryCode, limit)
        : [];

    // Ulke onbellek anahtarinda: aksi halde DE ile daraltilmis bir liste,
    // ayni caddeyi NL icin arayan bir sonraki istege servis edilirdi.
    const key = `suggest:${params.kind}:${(params.city ?? '').toLowerCase()}:${
      countryCode ?? '*'
    }:${params.query.trim().toLowerCase()}:${limit}`;

    let remote = await this.cache.get<AddressSuggestion[]>(key);
    if (!remote) {
      const result = await this.geocoding.suggest({
        query: params.query,
        kind: params.kind,
        city: params.city,
        countryCode,
        limit,
        bias: readRegionAnchor(),
      });
      if (!result.ok) {
        // Geocoder coktu ama gecmis calisiyor — elimizdekini vermek bos liste
        // dondurmekten iyi.
        return history.length > 0 ? { ok: true, value: history } : result;
      }
      remote = result.value;
      await this.cache.set(key, remote);
    }

    const seen = new Set(history.map((item) => item.id));
    const merged = [...history];
    for (const suggestion of remote) {
      if (seen.has(suggestion.id)) continue;
      seen.add(suggestion.id);
      merged.push(suggestion);
    }

    return { ok: true, value: merged.slice(0, limit) };
  }

  /**
   * Kiracinin daha once kullandigi adreslerde arar.
   *
   * Yalnizca koordinati olan kayitlar dondurulur: koordinatsiz bir gecmis kaydi
   * secilirse sunucu yine adres metninden cozumlemeye duser ve gecmisten
   * secmenin tek avantaji kaybolur.
   */
  private async suggestFromHistory(
    query: string,
    city: string | null | undefined,
    /** ISO 3166-1 alpha-2 veya null; geocoder tarafiyla ayni daraltma olmali */
    countryCode: string | null,
    limit: number,
  ): Promise<AddressSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const cityFilter = city?.trim();

    const rows = await this.prisma.location.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        ...(countryCode ? { countryCode } : {}),
        AND: [
          {
            OR: [
              { street: { contains: trimmed, mode: 'insensitive' } },
              { label: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
          ...(cityFilter ? [{ city: { contains: cityFilter, mode: 'insensitive' as const } }] : []),
        ],
      },
      // Son kullanilan once: tekrar eden musteriler listenin basinda kalir
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return rows.flatMap((row) => {
      if (row.latitude === null || row.longitude === null) return [];

      const street = row.street;
      // Ev numarasi anahtara dahil: ayni caddedeki 24 ve 26 numara sofor icin
      // ayri adresler ve tek satira cokmemeliler. Geocoder tarafiyla ayni anahtar
      // kullanilmali, yoksa iki kaynak birbirini tekilleyemez.
      const dedupeKey = [street, row.houseNumber, row.postalCode, row.city]
        .map((value) => (value ?? '').toLowerCase())
        .join('|');

      return [
        {
          id: dedupeKey,
          label: formatSuggestionLabel({
            name: row.label,
            street,
            houseNumber: row.houseNumber,
            postalCode: row.postalCode,
            city: row.city,
          }),
          street,
          houseNumber: row.houseNumber,
          postalCode: row.postalCode,
          city: row.city,
          countryCode: row.countryCode,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          kind: 'address' as const,
          source: 'history' as const,
        },
      ];
    });
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
   * Onbellekli DIKDORTGEN matris: kaynaklar x hedefler.
   *
   * Neden `matrix()` yetmiyor: o kare matris kuruyor (points x points). Bir
   * surucunun N istasyonu icin gereken hucreler yalnizca "konum -> her istasyon"
   * ve "her istasyon -> sonraki durak"; kare matris bunun icin N^2 hucre
   * hesaplatir. Olculen maliyet hucre sayisiyla artiyor (20x20 soguk 5,9 sn),
   * bu yuzden 10 istasyonda 144 hucre yerine 2 cagriyla 21 hucre isteniyor.
   *
   * ValhallaClient.matrix zaten kaynak/hedef ayrimini destekliyor; burada
   * yalnizca onbellek ve profil tutarliligi ekleniyor — paralel bir istemci
   * YOK.
   */
  async matrixBetween(
    sources: GeoPoint[],
    targets: GeoPoint[],
    profile: TruckProfile = DEFAULT_TRUCK_PROFILE,
    ttlSecondsOverride?: number,
  ): Promise<RoutingResult<MatrixCell[]>> {
    if (sources.length === 0 || targets.length === 0) {
      return { ok: false, error: 'invalid_input', message: 'matrix requires sources and targets' };
    }

    const key = [
      'matrix2',
      sources.map((p) => this.coordKey(p)).join(';'),
      '>',
      targets.map((p) => this.coordKey(p)).join(';'),
      this.profileKey(profile),
    ].join(':');

    const cached = await this.cache.get<MatrixCell[]>(key);
    if (cached) {
      return { ok: true, value: cached };
    }

    const result = await this.valhalla.matrix(sources, targets, profile);
    if (result.ok) {
      await this.cache.set(key, result.value, ttlSecondsOverride);
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
