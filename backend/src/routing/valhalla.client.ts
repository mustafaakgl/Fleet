import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_TRUCK_PROFILE,
  type ElevationProfile,
  type GeoPoint,
  type MatrixCell,
  type RouteSummary,
  type RoutingResult,
  type TruckAccessCheck,
  type TruckProfile,
} from './core/routing.types';

/** Valhalla /route yanitinin kullandigimiz alanlari. */
interface ValhallaRouteResponse {
  trip?: {
    summary?: {
      length?: number;
      time?: number;
      has_toll?: boolean;
      has_ferry?: boolean;
      has_highway?: boolean;
    };
    legs?: Array<{ shape?: string }>;
  };
  error_code?: number;
  error?: string;
}

interface ValhallaMatrixResponse {
  sources_to_targets?: Array<Array<{ distance?: number | null; time?: number | null }>>;
  error?: string;
}

interface ValhallaLocateResponse
  extends Array<{
    edges?: Array<{ distance?: number; edge_info?: unknown }>;
    node?: unknown;
  }> {}

interface ValhallaHeightResponse {
  range_height?: Array<[number, number | null]>;
  error?: string;
}

/**
 * Valhalla HTTP istemcisi. Tek sorumlulugu: istek kurmak, zaman asimi uygulamak,
 * yaniti tiplenmis sonuca cevirmek. Onbellek ve is kurallari RoutingService'te.
 *
 * Hicbir metot istisna firlatmaz — Valhalla erisilemez oldugunda cagiran akis
 * durmamali. Bkz. docs/route-optimization-plan.md.
 */
@Injectable()
export class ValhallaClient {
  private readonly logger = new Logger(ValhallaClient.name);

  private get baseUrl(): string {
    return (process.env.VALHALLA_URL?.trim() || 'http://localhost:8002').replace(/\/+$/, '');
  }

  private get timeoutMs(): number {
    const raw = Number(process.env.VALHALLA_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 15000;
  }

  get configured(): boolean {
    return Boolean(process.env.VALHALLA_URL?.trim());
  }

  private toCostingOptions(profile: TruckProfile): Record<string, number | boolean> {
    return {
      height: profile.height,
      width: profile.width,
      length: profile.length,
      weight: profile.weight,
      axle_load: profile.axleLoad,
      hazmat: profile.hazmat,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<RoutingResult<T>> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const body = payload as { error?: string; error_code?: number } | null;
        const message = body?.error ?? `Valhalla responded ${response.status}`;

        if (response.status === 400) {
          // error_code ayrimi kritik ve olculdu:
          //   171 "No suitable edges near location" -> nokta tile kapsaminin
          //       DISINDA. Kamyon erisimi hakkinda hicbir sey soylemez.
          //   442 "No path could be found"          -> nokta kapsam icinde ama
          //       kamyon agindan kopuk, yani gercekten erisilemez.
          // Mesaj metnine gore siniflandirmak ikisini karistirir ve NRW disindaki
          // gecerli adresleri "kamyona kapali" diye yanlis isaretler.
          if (body?.error_code === 171) {
            return { ok: false, error: 'out_of_coverage', message };
          }
          if (body?.error_code === 442) {
            return { ok: false, error: 'no_route', message };
          }
          return { ok: false, error: 'invalid_input', message };
        }
        return { ok: false, error: 'unavailable', message };
      }

      if (payload === null) {
        return { ok: false, error: 'unavailable', message: 'Valhalla returned unparseable payload' };
      }

      return { ok: true, value: payload as T };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown transport failure';
      this.logger.warn(`Valhalla ${path} failed: ${message}`);
      return { ok: false, error: 'unavailable', message };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /** Iki veya daha fazla nokta arasinda kamyon rotasi. */
  async route(
    points: GeoPoint[],
    profile: TruckProfile = DEFAULT_TRUCK_PROFILE,
  ): Promise<RoutingResult<RouteSummary>> {
    if (points.length < 2) {
      return { ok: false, error: 'invalid_input', message: 'route requires at least two points' };
    }

    const result = await this.post<ValhallaRouteResponse>('/route', {
      locations: points.map((p) => ({ lat: p.latitude, lon: p.longitude })),
      costing: 'truck',
      costing_options: { truck: this.toCostingOptions(profile) },
      units: 'kilometers',
    });

    if (!result.ok) {
      return result;
    }

    const summary = result.value.trip?.summary;
    if (!summary || typeof summary.length !== 'number' || typeof summary.time !== 'number') {
      return { ok: false, error: 'no_route', message: 'Valhalla returned no trip summary' };
    }

    return {
      ok: true,
      value: {
        distanceKm: summary.length,
        durationMinutes: summary.time / 60,
        hasToll: Boolean(summary.has_toll),
        hasFerry: Boolean(summary.has_ferry),
        hasHighway: Boolean(summary.has_highway),
        shape: result.value.trip?.legs?.[0]?.shape ?? null,
      },
    };
  }

  /**
   * Mesafe matrisi. Olculen maliyet: 20x20 soguk 5,9 sn / sicak 0,64 sn,
   * 41x41 soguk 7,1 sn. Senkron istek icinde cagrilmamali.
   */
  async matrix(
    sources: GeoPoint[],
    targets: GeoPoint[],
    profile: TruckProfile = DEFAULT_TRUCK_PROFILE,
  ): Promise<RoutingResult<MatrixCell[]>> {
    if (sources.length === 0 || targets.length === 0) {
      return { ok: false, error: 'invalid_input', message: 'matrix requires sources and targets' };
    }

    const result = await this.post<ValhallaMatrixResponse>('/sources_to_targets', {
      sources: sources.map((p) => ({ lat: p.latitude, lon: p.longitude })),
      targets: targets.map((p) => ({ lat: p.latitude, lon: p.longitude })),
      costing: 'truck',
      costing_options: { truck: this.toCostingOptions(profile) },
      units: 'kilometers',
    });

    if (!result.ok) {
      return result;
    }

    const rows = result.value.sources_to_targets;
    if (!Array.isArray(rows)) {
      return { ok: false, error: 'no_route', message: 'Valhalla returned no matrix' };
    }

    const cells: MatrixCell[] = [];
    rows.forEach((row, sourceIndex) => {
      row.forEach((cell, targetIndex) => {
        cells.push({
          sourceIndex,
          targetIndex,
          distanceKm: typeof cell.distance === 'number' ? cell.distance : null,
          durationMinutes: typeof cell.time === 'number' ? cell.time / 60 : null,
        });
      });
    });

    return { ok: true, value: cells };
  }

  /**
   * Koordinatin kamyonla ulasilabilir yola snap edilip edilemedigini kontrol eder.
   *
   * /locate tek basina yetmiyor: Bielefeld ornegi /locate'te 3 aday kenar dondurdu
   * ama gercek rotalama 400 verdi. Bu yuzden kisa bir dogrulama rotasi da denenir.
   */
  async checkTruckAccess(
    point: GeoPoint,
    referencePoint: GeoPoint,
    profile: TruckProfile = DEFAULT_TRUCK_PROFILE,
  ): Promise<RoutingResult<TruckAccessCheck>> {
    const locateResult = await this.post<ValhallaLocateResponse>('/locate', {
      locations: [{ lat: point.latitude, lon: point.longitude }],
      costing: 'truck',
      costing_options: { truck: this.toCostingOptions(profile) },
      // verbose olmadan kenar nesnesi `distance` tasimiyor — snap mesafesi
      // geocode kalitesinin gostergesi oldugu icin gerekli
      verbose: true,
    });

    if (!locateResult.ok) {
      return locateResult;
    }

    const edges = locateResult.value?.[0]?.edges ?? [];
    const snapDistanceM =
      edges.length > 0 && typeof edges[0]?.distance === 'number' ? edges[0].distance : null;

    if (edges.length === 0) {
      // Olculdu: kapsam disi bir nokta (ornegin NRW tile'lariyla Hamburg) /locate'ten
      // 200 ama bos kenar listesi doner. Bunu "kamyona kapali" saymak, gecerli bir
      // adresi yanlislikla sorunlu isaretler. Erisim hakkinda karar veremiyoruz.
      return {
        ok: false,
        error: 'out_of_coverage',
        message: 'Koordinat yol agi kapsaminin disinda (tile bolgesi yetersiz olabilir)',
      };
    }

    // Snap edilebilmek yetmiyor — snap edilen kenar kamyon agindan kopuk olabilir.
    // Referans noktasindan gercek bir rota denenir.
    const probe = await this.route([referencePoint, point], profile);
    if (!probe.ok && probe.error === 'no_route') {
      return {
        ok: true,
        value: {
          reachable: false,
          snapDistanceM,
          note: 'Koordinat kamyona kapali bir yola dusuyor (otomobille ulasilabilir olabilir)',
        },
      };
    }
    if (!probe.ok) {
      return probe;
    }

    return { ok: true, value: { reachable: true, snapDistanceM, note: null } };
  }

  /**
   * Rota govdesi uzerindeki rakim profili. Yakit tuketimi modelinin girdisi:
   * olculen ayrim Sauerland 20,2 m/km, duz Ruhr 15,5 m/km.
   */
  async elevationProfile(
    encodedShape: string,
    distanceKm: number,
  ): Promise<RoutingResult<ElevationProfile>> {
    if (!encodedShape) {
      return { ok: false, error: 'invalid_input', message: 'elevation requires a route shape' };
    }

    const result = await this.post<ValhallaHeightResponse>('/height', {
      encoded_polyline: encodedShape,
      range: true,
      shape_format: 'polyline6',
    });

    if (!result.ok) {
      return result;
    }

    const samples = result.value.range_height;
    if (!Array.isArray(samples) || samples.length < 2) {
      return { ok: false, error: 'no_route', message: 'Valhalla returned no elevation samples' };
    }

    let ascentM = 0;
    let descentM = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1]?.[1];
      const current = samples[i]?.[1];
      if (typeof previous !== 'number' || typeof current !== 'number') {
        continue;
      }
      const delta = current - previous;
      if (delta > 0) {
        ascentM += delta;
      } else {
        descentM -= delta;
      }
    }

    return {
      ok: true,
      value: {
        ascentM,
        descentM,
        ascentPerKm: distanceKm > 0 ? ascentM / distanceKm : 0,
      },
    };
  }

  /** Servisin ayakta olup olmadigi — saglik ucu ve tanilama icin. */
  async status(): Promise<RoutingResult<{ version: string }>> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/status`, { signal: controller.signal });
      if (!response.ok) {
        return { ok: false, error: 'unavailable', message: `status responded ${response.status}` };
      }
      const payload = (await response.json()) as { version?: string };
      return { ok: true, value: { version: payload.version ?? 'unknown' } };
    } catch (error) {
      return {
        ok: false,
        error: 'unavailable',
        message: error instanceof Error ? error.message : 'status failed',
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
