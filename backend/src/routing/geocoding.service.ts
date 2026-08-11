import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_GEOCODING_BBOX, readGeocodingBbox } from './core/geocode-bbox.util';
import { isGeocodeFallbackConsistent } from './core/geocode-consistency.util';
import { haversineMeters } from './core/geo-distance.util';
import { queryHasHouseNumber } from './core/house-number.util';
import { classifySuggestionKind, type SuggestionKind } from './core/suggestion-kind.util';
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

export type { SuggestionKind };

export interface AddressSuggestion {
  /** Listede React anahtari ve secim kimligi olarak kullanilir */
  id: string;
  /** Kullaniciya gosterilen tek satirlik metin */
  label: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  kind: SuggestionKind;
  /**
   * `history` = an address this tenant has used before, with coordinates and truck
   * access already verified. The UI marks these so the dispatcher can trust them
   * over a fresh geocoder guess.
   */
  source?: 'history' | 'geocoder';
}


/** Tek satirlik oneri etiketi. Gecmis kayitlari da ayni bicimi kullanmali. */
export function buildLabel(parts: {
  name?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const line1 = [parts.street ?? parts.name, parts.houseNumber].filter(Boolean).join(' ');
  const line2 = [parts.postalCode, parts.city].filter(Boolean).join(' ');
  return [line1, line2].filter((segment) => segment.length > 0).join(', ');
}

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
  /** Gecersiz GEOCODING_BBOX her tus vurusunda degil, bir kez loglanir */
  private invalidBboxWarned = false;

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
   * Aramanin sinirlandirilacagi kutu; `null` ise kisit gonderilmez.
   *
   * Photon'da bbox SERT filtre, yumusak tercih degil — kutu disinda hicbir aday
   * donmez. Bu yuzden gecersiz bir ayar istegi dusurmez, varsayilana doner:
   * yanlis yazilmis bir kutu yuzunden adres aramasini komple kaybetmek, biraz
   * genis aramaktan kotu.
   *
   * DIKKAT: kutu, indeksin kendisini genisletmez. Self-host Photon Almanya
   * indeksiyle kurulduysa (PHOTON_URL) kutuyu buyutmek NL/BE sonucu getirmez;
   * Avrupa indeksi gerekir.
   */
  private get searchBbox(): string | null {
    const setting = readGeocodingBbox();
    if (setting.kind === 'bbox') {
      return setting.value;
    }
    if (setting.kind === 'global') {
      return null;
    }

    if (!this.invalidBboxWarned) {
      this.invalidBboxWarned = true;
      this.logger.warn(
        `GEOCODING_BBOX="${setting.raw}" is not a valid "minLon,minLat,maxLon,maxLat" box — ` +
          `falling back to ${DEFAULT_GEOCODING_BBOX}`,
      );
    }
    return DEFAULT_GEOCODING_BBOX;
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

  /**
   * Yazarken gosterilecek adres onerileri.
   *
   * Tasarim kararlari olcume dayali:
   * - Sehir VERILIRSE sorgu metnine katilir; bu acik ara en iyi sonucu veriyor.
   *   "Bahnhofstraße Köln" dogru iki adayi donduruyor.
   * - Posta kodu sorguya katilmaz: "Hauptstraße 47059" Kranenburg/Rheurdt
   *   donduruyor, posta kodu bulanik metin gibi islem goruyor.
   * - Photon ayni caddeyi birden cok kez donduruyor; tekrarlar ayiklanir.
   * - osm_tag KATI filtre degil, yumusak tercih; istenen turle eslesmeyen
   *   sonuclar ayrica elenir.
   *
   * Sehirsiz sokak aramasi eskiden REDDEDILIYORDU, cunku "Bahnhofstr" sehirsiz
   * sorguda Zürich donduruyor ve Photon'un kendi `lat/lon` bias'i yetmiyor
   * (Duisburg'a bias'lanmis "Hauptstr" -> Odenhausen). Karar degisti: disponenti
   * once sehir yazmaya zorlamak her adreste iki alan doldurtuyordu. Belirsizligi
   * ONLEMEK yerine GORUNUR kiliyoruz — etiket posta kodu ve sehri tasidigi icin
   * "8001 Zürich, CH" satiri zaten secilmez.
   *
   * Sonuc duvarini onlemek icin iki onlem: cagiran taraf once kendi adres
   * gecmisini arar, ve sehirsiz sorguda sonuclari `bias` noktasina uzakliga gore
   * BIZ siralariz. Bu Photon'un siralamasina guvenmek degil — sonuc kumesini
   * aldiktan sonra kendi olcutumuzle diziyoruz.
   *
   * Ulke, sehir gibi sorgu metnine KATILMAZ; sonuc kumesi ISO koduna gore
   * elenir. Olculdu: Photon sorgudaki ulke adini kullanmiyor
   * ("Bahnhofstrasse Koeln Deutschland" ile "... Oesterreich" ayni Köln
   * sonuclarini donduruyor), ama tanimadigi bir kelime aramayi olduruyor
   * ("Hauptstrasse Freedonia" -> bos). Metne eklemek bu yuzden ya etkisiz ya
   * yikici; filtre ise deterministik.
   */
  async suggest(params: {
    query: string;
    kind: 'city' | 'street';
    /** Verilirse sorgu metnine katilir ve sonuc keskinlesir; zorunlu degil */
    city?: string | null;
    /** ISO 3166-1 alpha-2. Verilirse sonuclar bu ulkeye daraltilir. */
    countryCode?: string | null;
    limit?: number;
    /** Sehirsiz sokak sorgusunda siralama capasi (isletme bolgesi) */
    bias?: { latitude: number; longitude: number } | null;
  }): Promise<RoutingResult<AddressSuggestion[]>> {
    const trimmed = params.query.trim();
    if (trimmed.length < 2) {
      return { ok: true, value: [] };
    }

    const city = params.city?.trim() ?? '';
    const queryText = params.kind === 'street' && city ? `${trimmed} ${city}` : trimmed;
    const countryFilter = params.countryCode?.trim().toUpperCase() || null;

    const limit = Math.min(params.limit ?? 8, 20);
    // Ulke filtresi Photon'da yok, elemeyi biz yapiyoruz — istenen sayida aday
    // kalabilmesi icin fazladan cekiyoruz. Aksi halde "8 oneri" istegi, komsu
    // ulkelerden gelen adaylar elendikten sonra 2 satira dusebilir.
    const fetchLimit = countryFilter ? Math.min(limit * 3, 30) : limit;

    const search = new URLSearchParams({
      q: queryText,
      limit: String(fetchLimit),
      lang: 'de',
    });
    const bbox = this.searchBbox;
    if (bbox) {
      search.set('bbox', bbox);
    }
    // Sehir ararken yerlesime daralt. Sokakta `highway` yol CIZGISI demek ve ev
    // numarasi tasimaz — kullanici numara yazdiysa kisit kaldirilir, yoksa
    // "Stralauer Allee 24" numarasiz cadde olarak geri doner ve sofore caddenin
    // ortasindaki koordinat gider. Numarasiz sorguda kisit korunur: POI gurultusunu
    // azaltiyor ve zaten ev numarasi beklenmiyor.
    const wantsHouse = params.kind === 'street' && queryHasHouseNumber(queryText);
    if (params.kind === 'city') {
      search.set('osm_tag', 'place');
    } else if (!wantsHouse) {
      search.set('osm_tag', 'highway');
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api?${search.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Fleet/1.0 (address-suggest)' },
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: 'unavailable', message: `Photon responded ${response.status}` };
      }

      const payload = (await response.json()) as PhotonResponse;
      const seen = new Set<string>();
      const suggestions: AddressSuggestion[] = [];

      for (const feature of payload.features ?? []) {
        const coordinates = feature.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length !== 2) {
          continue;
        }
        const [longitude, latitude] = coordinates;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          continue;
        }

        const p = feature.properties ?? {};

        const featureCountry = (p.countrycode ?? 'DE').toUpperCase();
        if (countryFilter && featureCountry !== countryFilter) {
          continue;
        }

        // osm_tag Photon'da KATI filtre degil, yumusak tercih: `place` istenince
        // de POI donebiliyor ("Duisb" -> Trier'deki "Duisburger Hof"). Istenen
        // turle eslesmeyenler burada elenir.
        const kind = classifySuggestionKind(p.osm_key, p.osm_value);
        const kindMatches =
          params.kind === 'city' ? kind === 'city' : kind === 'street' || kind === 'address';
        if (!kindMatches) {
          continue;
        }

        // Sehir sonucunda Photon sehri `name` alaninda donduruyor. Bunu street'e
        // de yazmak listede "Duisburg, Duisburg" gibi bozuk etiket uretiyor.
        const street = kind === 'city' ? null : (p.street ?? p.name ?? null);
        const city = p.city ?? p.district ?? p.name ?? null;
        const postalCode = p.postcode ?? null;

        // Tekilleme anahtari: ayni cadde + EV NUMARASI + posta kodu + sehir tek
        // satir olmali. Koordinat dahil edilmez; Photon ayni caddenin farkli
        // parcalarini ayri kayit olarak donduruyor ve numarasiz sonuclarda hepsi
        // kullanici icin ayni adres. Ama ev numarasi anahtardan cikarilirsa 24 ve
        // 26 numara tek satira coker — sofor icin bunlar ayri adresler.
        const houseNumber = p.housenumber ?? null;
        const dedupeKey = [street, houseNumber, postalCode, city]
          .map((v) => (v ?? '').toLowerCase())
          .join('|');
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);

        suggestions.push({
          id: dedupeKey,
          label: buildLabel({
            // Sehirde `name` zaten sehrin kendisi; ikinci satirda gorunuyor.
            // Buraya da konursa etiket "Duisburg, Duisburg" olur.
            name: kind === 'city' ? null : p.name,
            street,
            houseNumber,
            postalCode,
            city,
          }),
          street,
          houseNumber,
          postalCode,
          city,
          countryCode: featureCountry,
          latitude,
          longitude,
          kind,
          source: 'geocoder',
        });
      }

      // Sadece sehirsiz sokak sorgusunda: sorgu metni ayirt edici olmadigi icin
      // Photon'un sirasi rastgeleye yakin. Sehir verilmisse sorgu zaten keskin,
      // karistirmiyoruz.
      if (params.kind === 'street' && !city && params.bias) {
        const anchor = params.bias;
        suggestions.sort(
          (left, right) => haversineMeters(anchor, left) - haversineMeters(anchor, right),
        );
      }

      // Ulke filtresi icin fazladan cektik; siralamadan SONRA kesiyoruz ki
      // capaya en yakin adaylar elenmesin.
      return { ok: true, value: suggestions.slice(0, limit) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown transport failure';
      this.logger.warn(`Photon suggest failed: ${message}`);
      return { ok: false, error: 'unavailable', message };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async geocodeQuery(query: string): Promise<RoutingResult<GeocodeHit>> {
    const params = new URLSearchParams({
      q: query,
      limit: '1',
      lang: 'de',
    });
    const bbox = this.searchBbox;
    if (bbox) {
      params.set('bbox', bbox);
    }

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
