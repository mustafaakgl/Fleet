/**
 * Harita uygulamasina navigasyon baglantilari.
 *
 * Neden koordinat, adres degil: adres metni harita uygulamasinda yeniden
 * aranir ve baska bir noktaya dusebilir. Bizim koordinatimiz Photon'dan
 * secilmis ve Valhalla ile "kamyon buraya girebiliyor" diye dogrulanmis
 * durumda; onu birakip metne donmek o dogrulamayi cope atar.
 *
 * Neden tur degil TEK durak: Google Maps URL'inde ara nokta sayisi sinirli
 * (~9) ve Waze hic desteklemiyor. Daha onemlisi harita uygulamalari kamyon
 * profilini bilmez — yukseklik/agirlik kisitlarini yok sayip alcak koprulu
 * bir yol onerebilir. Turun tamami bizim uygulamamizda kamyon profiliyle
 * hesaplanmis haliyle gosterilir; harita uygulamasi yalnizca sonraki duraga
 * kadar surer.
 */

export type NavigationApp = 'default' | 'google' | 'apple' | 'waze';

export interface NavigationTarget {
  latitude: number;
  longitude: number;
  /** Harita uygulamasinda etiket olarak gosterilir; konumu belirlemez */
  label?: string | null;
}

export type MobilePlatform = 'ios' | 'android' | 'web';

function isValidCoordinate(target: NavigationTarget): boolean {
  return (
    Number.isFinite(target.latitude) &&
    Number.isFinite(target.longitude) &&
    Math.abs(target.latitude) <= 90 &&
    Math.abs(target.longitude) <= 180
  );
}

/** Koordinatlari sabit hassasiyete indirir; gereksiz uzun URL uretmemek icin. */
function coord(target: NavigationTarget): string {
  return `${target.latitude.toFixed(6)},${target.longitude.toFixed(6)}`;
}

/**
 * Sonraki duraga navigasyon baglantisi uretir.
 * Gecersiz koordinatta null doner — cagiran taraf butonu pasif tutmali.
 */
export function buildNavigationUrl(
  target: NavigationTarget,
  platform: MobilePlatform,
  app: NavigationApp = 'default',
): string | null {
  if (!isValidCoordinate(target)) {
    return null;
  }

  const destination = coord(target);
  const label = target.label?.trim() ? encodeURIComponent(target.label.trim()) : '';

  if (app === 'waze') {
    // Waze ara nokta desteklemiyor; navigate=yes dogrudan yol tarifini baslatir
    return `https://waze.com/ul?ll=${destination}&navigate=yes`;
  }

  if (app === 'apple' || (app === 'default' && platform === 'ios')) {
    // dirflg=d: araba ile yol tarifi
    const name = label ? `&q=${label}` : '';
    return `http://maps.apple.com/?daddr=${destination}&dirflg=d${name}`;
  }

  if (app === 'google' || (app === 'default' && platform === 'android')) {
    // google.navigation: adim adim navigasyonu DOGRUDAN baslatir; maps arama
    // URL'i yalnizca konumu gosterir, surucunun bir kez daha basmasi gerekir.
    return `google.navigation:q=${destination}&mode=d`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

/**
 * Turun tamamini tek baglantiya sigdirma denemesi.
 *
 * Bilerek sinirli: Google Maps URL'i pratikte ~9 ara nokta aliyor, ustune
 * cikilirsa baglanti sessizce kirpiliyor ve surucu eksik rota goruyor.
 * Sessiz kirpma yerine null donuluyor ki arayuz "tur cok uzun, durak durak
 * ilerleyin" diyebilsin.
 */
export const MAX_WAYPOINTS_IN_LINK = 9;

export function buildFullTourUrl(stops: NavigationTarget[]): string | null {
  const valid = stops.filter(isValidCoordinate);
  if (valid.length < 2 || valid.length > MAX_WAYPOINTS_IN_LINK + 1) {
    return null;
  }

  const origin = coord(valid[0]);
  const destination = coord(valid[valid.length - 1]);
  const waypoints = valid.slice(1, -1).map(coord).join('|');

  const params = [
    'api=1',
    `origin=${origin}`,
    `destination=${destination}`,
    'travelmode=driving',
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : '',
  ].filter(Boolean);

  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
