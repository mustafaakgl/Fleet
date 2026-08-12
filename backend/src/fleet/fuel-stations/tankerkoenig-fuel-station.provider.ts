import { Injectable, Logger } from '@nestjs/common';
import { FuelProductType } from '@prisma/client';
import { FuelStationCacheService } from './fuel-station-cache.service';
import type {
  FuelStationOffering,
  FuelStationProvider,
  FuelStationResult,
  FuelStationSearchQuery,
  NormalizedFuelStation,
} from './fuel-station.types';

/** Tankerkonig list.php'nin kullandigimiz alanlari. */
interface TankerkoenigStation {
  id?: unknown;
  name?: unknown;
  brand?: unknown;
  street?: unknown;
  houseNumber?: unknown;
  /** Sozlesmede integer; string gelen kurulumlara karsi unknown alinip suzuluyor. */
  postCode?: unknown;
  place?: unknown;
  lat?: unknown;
  lng?: unknown;
  dist?: unknown;
  isOpen?: unknown;
  /**
   * Fiyatlar. Sozlesme "float" diyor ama pratikte fiyati olmayan urun `false`
   * ya da eksik geliyor — bu yuzden unknown olarak alinip tek yerde suzuluyor.
   */
  diesel?: unknown;
  e5?: unknown;
  e10?: unknown;
}

interface TankerkoenigListResponse {
  ok?: unknown;
  status?: unknown;
  message?: unknown;
  stations?: unknown;
}

/**
 * Tankerkonig (creativecommons.tankerkoenig.de) adaptoru.
 *
 * DOGRULANMIS SOZLESME (list.php):
 *   - parametreler: lat, lng, rad (km, EN FAZLA 25), sort, type, apikey
 *   - type=all -> istasyon basina diesel/e5/e10 fiyatlari, siralama mesafeye gore
 *   - yanitta FIYAT ZAMAN DAMGASI YOK
 *   - kamyon erisimi, yakit karti, SuperPlus/HVO/AdBlue bilgisi YOK
 *
 * Bu yuzden yalnizca DIESEL, SUPER_E5, SUPER_E10 destekleniyor. Saglayicinin
 * vermedigi hicbir alan uydurulmuyor: hgvAccess 'unknown', acceptedFuelCards
 * null, zaman damgalari null kalir.
 *
 * API ANAHTARI: yalnizca giden istegin query string'inde kullanilir. Loglara,
 * hata mesajlarina ve dondurulen tipe hicbir kosulda girmez — bu yuzden hata
 * mesajlari elle kuruluyor, saglayicinin/fetch'in ham metni URL icerebilecegi
 * icin oldugu gibi tasinmiyor.
 */
@Injectable()
export class TankerkoenigFuelStationProvider implements FuelStationProvider {
  readonly name = 'tankerkoenig';

  readonly dataMode = 'live' as const;

  /**
   * CC BY 4.0 atfi ZORUNLU: veri MTS-K'dan Tankerkonig uzerinden geliyor ve
   * lisans kaynak gosterimini sart kosuyor. Metin burada duruyor, arayuzde
   * cevrilmiyor — lisans atfi cevrilecek bir kullanici metni degil.
   */
  readonly attribution = {
    label: 'Tankstellen- und Preisdaten: Tankerkönig / MTS-K — CC BY 4.0',
    url: 'https://creativecommons.tankerkoenig.de',
  } as const;

  private readonly logger = new Logger(TankerkoenigFuelStationProvider.name);

  /** Saglayicinin izin verdigi en buyuk yaricap (km) — sozlesme siniri. */
  static readonly MAX_RADIUS_KM = 25;

  constructor(private readonly cache: FuelStationCacheService) {}

  private get apiKey(): string | undefined {
    return process.env.TANKERKOENIG_API_KEY?.trim() || undefined;
  }

  private get baseUrl(): string {
    return (
      process.env.TANKERKOENIG_BASE_URL?.trim() || 'https://creativecommons.tankerkoenig.de'
    ).replace(/\/+$/, '');
  }

  private get timeoutMs(): number {
    const raw = Number(process.env.TANKERKOENIG_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 5000;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  supportedProducts(): readonly FuelProductType[] {
    return [FuelProductType.DIESEL, FuelProductType.SUPER_E5, FuelProductType.SUPER_E10];
  }

  /**
   * Onbellek anahtari. Koordinat 3 ondaliga (~110 m) yuvarlanir: metre
   * hassasiyetinde anahtar uretmek her istegi isabetsiz yapardi, daha kaba
   * yuvarlama ise komsu ilcenin fiyatini gosterirdi.
   */
  private cacheKey(query: FuelStationSearchQuery): string {
    const lat = query.latitude.toFixed(3);
    const lng = query.longitude.toFixed(3);
    return `${this.name}:${lat}:${lng}:${query.radiusKm.toFixed(1)}`;
  }

  private toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toTrimmedString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  /**
   * Posta kodu. Sayi olarak geldiginde 5 haneye SIFIRLA tamamlanir.
   *
   * Olmasa: 01067 (Dresden) JSON'da 1067 olarak geliyor ve dogrudan string'e
   * cevrilirse surucuye gecersiz bir posta kodu gosterilir.
   */
  private toPostalCode(value: unknown): string | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return String(value).padStart(5, '0');
    }
    return this.toTrimmedString(value);
  }

  /**
   * Fiyat suzgeci. `false`, null, 0 ve sayi olmayan her sey null'a dusuyor.
   *
   * 0 ozellikle ayiklaniyor: saglayici kapali istasyonda 0 dondurebiliyor ve
   * 0 EUR "en ucuz istasyon" olarak siralamanin basina otururdu.
   */
  private toPrice(value: unknown): number | null {
    const parsed = this.toFiniteNumber(value);
    if (parsed === null || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private toOfferings(station: TankerkoenigStation): FuelStationOffering[] {
    const candidates: Array<{ productType: FuelProductType; raw: unknown }> = [
      { productType: FuelProductType.DIESEL, raw: station.diesel },
      { productType: FuelProductType.SUPER_E5, raw: station.e5 },
      { productType: FuelProductType.SUPER_E10, raw: station.e10 },
    ];

    const offerings: FuelStationOffering[] = [];
    for (const candidate of candidates) {
      const price = this.toPrice(candidate.raw);
      // Alan hic gelmediyse istasyon o urunu satmiyor demektir; fiyati
      // bilinmeyen bir teklif uretmek yerine teklifi hic kurmuyoruz.
      if (candidate.raw === undefined || candidate.raw === null) {
        continue;
      }
      offerings.push({
        productType: candidate.productType,
        pricePerUnit: price,
        unit: 'liter',
        currency: 'EUR',
        // Saglayici fiyat zamani vermiyor — bkz. sinif yorumu.
        updatedAt: null,
      });
    }

    return offerings;
  }

  private normalize(payload: unknown, retrievedAt: string): NormalizedFuelStation[] {
    const response = payload as TankerkoenigListResponse | null;
    const rawStations = response?.stations;
    if (!Array.isArray(rawStations)) {
      return [];
    }

    const stations: NormalizedFuelStation[] = [];
    for (const raw of rawStations as TankerkoenigStation[]) {
      const id = typeof raw.id === 'string' ? raw.id : null;
      const latitude = this.toFiniteNumber(raw.lat);
      const longitude = this.toFiniteNumber(raw.lng);
      // Kimligi ya da konumu olmayan istasyon haritada gosterilemez ve
      // tekrar sorgulanamaz; tahmini konumla eklemek yerine atlanir.
      if (!id || latitude === null || longitude === null) {
        continue;
      }

      const brand = typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim() : null;
      stations.push({
        id,
        provider: this.name,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : (brand ?? 'Tankstelle'),
        brand,
        address: {
          street: this.toTrimmedString(raw.street),
          houseNumber: this.toTrimmedString(raw.houseNumber),
          // postCode sozlesmede sayi; string'e cevrilirken basindaki sifir
          // korunmali (ornegin 01067 Dresden) — bu yuzden sayiysa oldugu gibi
          // degil, 5 haneye tamamlanarak yaziliyor.
          postalCode: this.toPostalCode(raw.postCode),
          city: this.toTrimmedString(raw.place),
        },
        latitude,
        longitude,
        distanceKm: this.toFiniteNumber(raw.dist),
        isOpen: typeof raw.isOpen === 'boolean' ? raw.isOpen : null,
        pricesUpdatedAt: null,
        retrievedAt,
        hgvAccess: 'unknown',
        acceptedFuelCards: null,
        offerings: this.toOfferings(raw),
      });
    }

    return stations;
  }

  /**
   * Tek HTTP denemesi. Zaman asimi AbortController ile; hicbir dalda anahtar
   * ya da tam URL mesaja yazilmiyor.
   */
  private async fetchOnce(
    url: string,
  ): Promise<FuelStationResult<unknown> & { retryable?: boolean }> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        // 4xx yeniden denenmez: gecersiz anahtar ya da kota asimi tekrarla
        // duzelmez, sadece kotayi daha hizli tuketir.
        if (response.status >= 400 && response.status < 500) {
          return {
            ok: false,
            error: 'provider_rejected',
            message: `Tankerkoenig rejected the request (HTTP ${response.status})`,
          };
        }
        return {
          ok: false,
          error: 'provider_unavailable',
          message: `Tankerkoenig responded HTTP ${response.status}`,
          retryable: true,
        };
      }

      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        return {
          ok: false,
          error: 'provider_unreadable',
          message: 'Tankerkoenig returned unparseable JSON',
        };
      }

      const body = payload as TankerkoenigListResponse;
      if (body?.ok === false) {
        // Saglayici 200 ile mantiksal hata dondurebiliyor. `message` alani
        // saglayicidan gelen serbest metin — istegi ICERMEZ ama gene de
        // istemciye tasimiyoruz, yalnizca sabit bir kod bildiriyoruz.
        return {
          ok: false,
          error: 'provider_rejected',
          message: 'Tankerkoenig reported a request error',
        };
      }

      return { ok: true, value: payload };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        error: 'provider_unavailable',
        message: aborted
          ? `Tankerkoenig request timed out after ${this.timeoutMs} ms`
          : 'Tankerkoenig request failed (network error)',
        retryable: true,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async search(
    query: FuelStationSearchQuery,
  ): Promise<FuelStationResult<NormalizedFuelStation[]>> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return {
        ok: false,
        error: 'provider_not_configured',
        message: 'TANKERKOENIG_API_KEY is not set',
      };
    }

    const cacheKey = this.cacheKey(query);
    const cached = await this.cache.get<NormalizedFuelStation[]>(cacheKey);
    if (cached) {
      return { ok: true, value: cached };
    }

    // Saglayici 25 km'nin uzerini reddediyor; ust katman da siniri uyguluyor
    // ama adaptor kendi sozlesmesini korumali.
    const radiusKm = Math.min(query.radiusKm, TankerkoenigFuelStationProvider.MAX_RADIUS_KM);
    const params = new URLSearchParams({
      lat: query.latitude.toFixed(6),
      lng: query.longitude.toFixed(6),
      rad: radiusKm.toFixed(1),
      sort: 'dist',
      type: 'all',
      apikey: apiKey,
    });
    const url = `${this.baseUrl}/json/list.php?${params.toString()}`;

    // Tek yeniden deneme: gecici ag hatasi/5xx icin yeterli. Daha fazlasi
    // surucunun istegini timeout katlanarak bekletir ve kotayi tuketir.
    let attempt = await this.fetchOnce(url);
    if (!attempt.ok && attempt.retryable) {
      this.logger.warn(`Tankerkoenig attempt 1 failed: ${attempt.message} — retrying once`);
      attempt = await this.fetchOnce(url);
    }

    if (!attempt.ok) {
      this.logger.warn(`Tankerkoenig search failed: ${attempt.message}`);
      return { ok: false, error: attempt.error, message: attempt.message };
    }

    const stations = this.normalize(attempt.value, new Date().toISOString());
    // Bos sonuc da onbellege yaziliyor: kirsalda gercekten istasyon olmayan
    // bir noktada her yenilemede disariya cikmanin anlami yok.
    await this.cache.set(cacheKey, stations);
    return { ok: true, value: stations };
  }
}
