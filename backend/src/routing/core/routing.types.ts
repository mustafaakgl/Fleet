/** Valhalla'ya gonderilen arac profili. Birimler Valhalla sozlesmesi geregi metrik. */
export interface TruckProfile {
  /** metre */
  height: number;
  /** metre */
  width: number;
  /** metre */
  length: number;
  /** ton */
  weight: number;
  /** ton */
  axleLoad: number;
  /** ADR tehlikeli madde tasimasi */
  hazmat: boolean;
}

/**
 * Standart Alman cekici-dorse kombinasyonu (40 t, 4,0 m yukseklik).
 * Arac kaydinda deger yoksa bu varsayilir — kisitsiz varsaymaktan guvenli,
 * cunku fazla kisitli profil daha uzun ama gecerli rota uretir; eksik kisitli
 * profil aracin fiziksel olarak giremeyecegi rota uretir.
 */
export const DEFAULT_TRUCK_PROFILE: TruckProfile = {
  height: 4.0,
  width: 2.55,
  length: 16.5,
  weight: 40.0,
  axleLoad: 11.5,
  hazmat: false,
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Basarili/basarisiz ayrimini istisna yerine tip uzerinden tasiyoruz.
 * Valhalla erisilemez oldugunda cagiran akis (ornegin gorev kaydetme)
 * calismaya devam etmeli — rota bilgisi eksik kalir, is durmaz.
 */
export type RoutingResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RoutingErrorCode; message: string };

export type RoutingErrorCode =
  /** Valhalla kapali, ag hatasi veya zaman asimi */
  | 'unavailable'
  /** Valhalla calisiyor ama bu girdi icin rota yok (kamyona kapali durak dahil) */
  | 'no_route'
  /** Koordinat tile kapsaminin disinda */
  | 'out_of_coverage'
  /** Girdi gecersiz (bos adres, hatali koordinat) */
  | 'invalid_input';

export interface RouteSummary {
  distanceKm: number;
  durationMinutes: number;
  hasToll: boolean;
  hasFerry: boolean;
  hasHighway: boolean;
  /** Valhalla encoded polyline (precision 6) — harita ciziminde kullanilir */
  shape: string | null;
}

export interface MatrixCell {
  sourceIndex: number;
  targetIndex: number;
  distanceKm: number | null;
  durationMinutes: number | null;
}

/**
 * Bir koordinatin 40t kamyonla ulasilabilir yola snap edilip edilemedigi.
 *
 * Kalite testinde olculdu: Bielefeld merkez koordinati (52.0302, 8.5325) 4,4 m
 * mesafede kamyona kapali bir yola snap oluyor; otomobille ayni hedef sorunsuz.
 * Tek bir boyle durak tum tur optimizasyonunu opak bir 400 ile cokertiyor.
 * Bu yuzden erisilebilirlik adres kaydedilirken dogrulanir.
 */
export interface TruckAccessCheck {
  reachable: boolean;
  /** Koordinatin snap edildigi kamyon yoluna mesafe (m). Buyukse geocode supheli. */
  snapDistanceM: number | null;
  /** Kullaniciya gosterilecek kisa aciklama; null ise sorun yok */
  note: string | null;
}

export interface ElevationProfile {
  /** Toplam tirmanis (m) — yakit tuketimi modelinin ana girdisi */
  ascentM: number;
  /** Toplam inis (m) */
  descentM: number;
  /** Kilometre basina tirmanis; rota zorlugunun normalize olcusu */
  ascentPerKm: number;
}
