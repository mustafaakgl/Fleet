import type { GeolocationFailureReason } from './fuel-station-view';

/**
 * Surucunun konumunu cozer.
 *
 * NEDEN BURADA BIR ONBELLEK VAR: depoda surucunun KENDI son konumunu okuyabildigi
 * bir uc yok. `POST /driver/location` konumu YAZAR, `DriverLocationLatest` tablosu
 * ofis tarafi (`/tracking/live`, operasyonel roller) icin. `useDriverWebLocation`
 * da konumu yukleyip elinde tutmuyor. Yani "zaten mevcut, tarih damgali bir
 * konum" olarak yeniden kullanilabilecek tek guvenilir kaynak, bu oturum icinde
 * ZATEN ALINMIS taze bir fix.
 *
 * Bu yuzden: taze bir fix varsa (varsayilan 2 dk) tekrar sorulmuyor — surucu her
 * "Yeniden ara" dokunusunda yeni bir GPS beklemesin ve izin diyalogu tekrar
 * tetiklenmesin. Taze fix yoksa tarayici Geolocation API'sine gidiliyor.
 *
 * YAKLASIK KONUMA DUSULMEZ: hata halinde sebep dondurulur, "sehir merkezi" gibi
 * bir tahmin uretilmez — surucuyu 30 km uzaktaki bir istasyona yonlendirmek
 * hicbir sey gostermemekten kotudur.
 */

export interface DriverPosition {
  latitude: number;
  longitude: number;
  /** Fix'in alindigi an — tazelik kararinin dayanagi. */
  recordedAt: string;
  accuracyM: number | null;
}

export type DriverPositionResult =
  | { ok: true; position: DriverPosition; reused: boolean }
  | { ok: false; reason: GeolocationFailureReason };

/** Taze sayilan en buyuk yas. Sehir icinde 2 dk'da kayda deger yol alinmaz. */
export const POSITION_MAX_AGE_MS = 2 * 60 * 1000;

const GEOLOCATION_OPTIONS: PositionOptions = {
  // Yakit istasyonu secimi icin sokak duzeyinde dogruluk gerekiyor.
  enableHighAccuracy: true,
  // Kabinde ilk fix yavas olabilir; 15 sn beklemek 4 sn'de vazgecmekten iyi.
  timeout: 15000,
  // Tarayicinin kendi onbellegi de kabul ediliyor, bizim esigimizle ayni.
  maximumAge: POSITION_MAX_AGE_MS,
};

let cachedPosition: DriverPosition | null = null;
/** Ayni anda ikinci bir GPS istegi baslatilmasini engeller. */
let inFlight: Promise<DriverPositionResult> | null = null;

export function isPositionFresh(
  position: DriverPosition | null,
  now = Date.now(),
  maxAgeMs = POSITION_MAX_AGE_MS,
): boolean {
  if (!position) return false;
  const recorded = new Date(position.recordedAt).getTime();
  if (Number.isNaN(recorded)) return false;
  // Gelecek tarihli bir fix (cihaz saati kaymis) taze SAYILMAZ.
  return recorded <= now && now - recorded <= maxAgeMs;
}

/** Testler ve ekran degisimleri icin — oturum onbellegini bosaltir. */
export function resetDriverPositionCache(): void {
  cachedPosition = null;
  inFlight = null;
}

/** Baska bir akis konum aldiysa buraya birakabilir (ornegin canli paylasim). */
export function rememberDriverPosition(position: DriverPosition): void {
  cachedPosition = position;
}

export function peekDriverPosition(): DriverPosition | null {
  return cachedPosition;
}

function toReason(error: GeolocationPositionError): GeolocationFailureReason {
  if (error.code === error.PERMISSION_DENIED) return 'denied';
  if (error.code === error.TIMEOUT) return 'timeout';
  return 'unavailable';
}

function requestBrowserPosition(): Promise<DriverPositionResult> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        const position: DriverPosition = {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          recordedAt: new Date(fix.timestamp || Date.now()).toISOString(),
          accuracyM: Number.isFinite(fix.coords.accuracy) ? fix.coords.accuracy : null,
        };
        cachedPosition = position;
        resolve({ ok: true, position, reused: false });
      },
      (error) => resolve({ ok: false, reason: toReason(error) }),
      GEOLOCATION_OPTIONS,
    );
  });
}

/**
 * Konumu cozer. YALNIZCA surucunun acik aksiyonu sonucunda cagrilmali —
 * sayfa acilisinda cagrilmasi izin diyalogunu istenmeden tetikler.
 */
export async function resolveDriverPosition(options?: {
  /** true ise taze onbellek yok sayilir ("Yeniden ara" tazelik istiyorsa). */
  forceFresh?: boolean;
}): Promise<DriverPositionResult> {
  if (!options?.forceFresh && isPositionFresh(cachedPosition)) {
    return { ok: true, position: cachedPosition!, reused: true };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: 'unsupported' };
  }

  // Tek ucus: iki hizli dokunus iki GPS istegi (ve iki izin diyalogu) acmasin.
  if (inFlight) {
    return inFlight;
  }

  inFlight = requestBrowserPosition().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
