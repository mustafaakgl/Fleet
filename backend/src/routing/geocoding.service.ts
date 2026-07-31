import { Injectable, Logger } from '@nestjs/common';
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

  async geocode(rawAddress: string): Promise<RoutingResult<GeocodeHit>> {
    const query = rawAddress.trim();
    if (!query) {
      return { ok: false, error: 'invalid_input', message: 'address is empty' };
    }

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
