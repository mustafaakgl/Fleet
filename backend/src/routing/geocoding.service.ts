import { Injectable, Logger } from '@nestjs/common';
import { isGeocodeFallbackConsistent } from './core/geocode-consistency.util';
import type { RoutingResult } from './core/routing.types';

/** Photon (Komoot) GeoJSON yaniti — kullandigimiz alanlar. */
interface PhotonResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: {
      name?: string;
      street?: string;
      housenumber?: string;
      postcode?: string;
      city?: string;
      district?: string;
      countrycode?: string;
      osm_key?: string;
      osm_value?: string;
    };
  }>;
}

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  /**
   * 0-1 arasi guven. Photon skor dondurmedigi icin alan doluluguna gore
   * turetilir: ev numarasi + posta kodu + sehir olan bir sonuc, sadece sehir
   * donen sonuctan belirgin sekilde guvenilirdir.
   */
  confidence: number;
}

/** Almanya sinirlayici kutusu — komsu ulkelerdeki benzer sokak adlarini eler. */
const GERMANY_BBOX = '5.87,47.27,15.04,55.06';

/**
 * Adres -> koordinat cevirisi.
 *
 * Gelistirme varsayilani public Photon (photon.komoot.io). Uretimde self-host
 * sart: public servisin adil kullanim kosullari toplu isleme izin vermez,
 * gecikme kontrol disidir ve musteri adresleri uclu tarafa gider (GDPR).
 * Self-host icin PHOTON_URL ayarlanir; Almanya indeksi ~3 GB.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  private get baseUrl(): string {
    return (process.env.PHOTON_URL?.trim() || 'https://photon.komoot.io').replace(/\/+$/, '');
  }

  private get timeoutMs(): number {
    const raw = Number(process.env.GEOCODING_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 10000;
  }

  get selfHosted(): boolean {
    return Boolean(process.env.PHOTON_URL?.trim());
  }

  /**
   * Alan dolulugundan guven turetir. Bilincli olarak muhafazakar: ev numarasi
   * yoksa sonuc sokagin ortasina duser ve kamyon snap kontrolu yaniltici olur.
   */
  private deriveConfidence(properties: NonNullable<PhotonResponse['features']>[number]['properties']): number {
    let score = 0.4;
    if (properties?.street) score += 0.2;
    if (properties?.housenumber) score += 0.2;
    if (properties?.postcode) score += 0.1;
    if (properties?.city) score += 0.1;
    return Math.min(1, Number(score.toFixed(3)));
  }

  /**
   * Adresi koordinata cevirir; dogrudan sorgu bos donerse basindaki tesis/firma
   * adini atarak bir kez daha dener.
   *
   * Gercek veride yaygin bicim: "DHL Hub Hamburg-Billbrook, Halskestraße 48".
   * Photon bu bicimi cozemiyor; virgul sonrasi tek basina cozuluyor. Olculdu:
   * demo verideki 4 basarisiz adresin 3'u bu yolla kurtariliyor.
   *
   * Fallback ham haliyle tehlikeli olurdu — on ek atilinca sehir baglami da
   * kayboluyor: "DB Schenker Terminal Dresden, Hamburger Straße 19" on eksiz
   * sorguda BREMEN'deki bir Hamburger Straße'yi donduruyor. Sessizce yanlis
   * sehre geocode etmek hic etmemekten kotu; sapma raporu yuzlerce km'lik
   * hayali fark uretir. Bu yuzden sonuc isGeocodeFallbackConsistent'ten
   * gecmek zorunda ve gecse bile guveni 0.7'ye cekiliyor.
   */
  async geocode(rawAddress: string): Promise<RoutingResult<GeocodeHit>> {
    const query = rawAddress.trim();
    if (!query) {
      return { ok: false, error: 'invalid_input', message: 'address is empty' };
    }

    const direct = await this.geocodeQuery(query);
    if (direct.ok) {
      return direct;
    }

    const commaIndex = query.indexOf(',');
    if (direct.error !== 'no_route' || commaIndex < 0) {
      return direct;
    }

    const stripped = query.slice(commaIndex + 1).trim();
    if (!stripped) {
      return direct;
    }

    const fallback = await this.geocodeQuery(stripped);
    if (!fallback.ok) {
      return direct;
    }

    if (!isGeocodeFallbackConsistent(fallback.value.city, query)) {
      this.logger.warn(
        `Geocode fallback rejected for "${query}": returned city ` +
          `"${fallback.value.city ?? '?'}" does not appear in the original address`,
      );
      return direct;
    }

    return {
      ok: true,
      // On ek atilarak bulundugu icin guveni dusur — tam eslesme kadar kesin degil
      value: { ...fallback.value, confidence: Math.min(fallback.value.confidence, 0.7) },
    };
  }

  private async geocodeQuery(query: string): Promise<RoutingResult<GeocodeHit>> {
    const params = new URLSearchParams({
      q: query,
      limit: '1',
      lang: 'de',
      bbox: GERMANY_BBOX,
    });

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Fleet/1.0 (geocoding)' },
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          error: 'unavailable',
          message: `Photon responded ${response.status}`,
        };
      }

      const payload = (await response.json()) as PhotonResponse;
      const hit = payload.features?.[0];
      const coordinates = hit?.geometry?.coordinates;

      if (!hit || !Array.isArray(coordinates) || coordinates.length !== 2) {
        return { ok: false, error: 'no_route', message: 'address not found' };
      }

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return { ok: false, error: 'no_route', message: 'geocoder returned invalid coordinates' };
      }

      const properties = hit.properties;
      return {
        ok: true,
        value: {
          latitude,
          longitude,
          street: properties?.street ?? properties?.name ?? null,
          houseNumber: properties?.housenumber ?? null,
          postalCode: properties?.postcode ?? null,
          city: properties?.city ?? properties?.district ?? null,
          countryCode: (properties?.countrycode ?? 'DE').toUpperCase(),
          confidence: this.deriveConfidence(properties),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown transport failure';
      this.logger.warn(`Photon geocode failed: ${message}`);
      return { ok: false, error: 'unavailable', message };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
