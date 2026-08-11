import type { MobilePlatform, NavigationApp } from '@/lib/navigation-links';

export const NAVIGATION_APP_KEY = 'driver.navigationApp';

export const NAVIGATION_APPS: NavigationApp[] = ['default', 'google', 'apple', 'waze'];

/**
 * Surucunun hangi harita uygulamasini kullanmak istedigi.
 *
 * Kalici saklanmasinin sebebi sıradan: bu tercih gunde dokuz kez isliyor.
 * Her seferinde yanlis uygulamanin acilmasi kucuk ama surekli bir sinir.
 */
export function isNavigationApp(value: string | null): value is NavigationApp {
  return value !== null && (NAVIGATION_APPS as string[]).includes(value);
}

/**
 * Platformda gercekten kullanilabilir secenekler.
 *
 * Apple Maps yalnizca iOS'ta var; Android'de listelemek sonu "uygulama
 * bulunamadi" ile biten bir secenek sunmak olurdu.
 */
export function availableNavigationApps(platform: MobilePlatform): NavigationApp[] {
  if (platform === 'ios') {
    return ['default', 'apple', 'google', 'waze'];
  }
  if (platform === 'android') {
    return ['default', 'google', 'waze'];
  }
  return ['default', 'google'];
}

/**
 * Cok duraklı baglanti yalnizca Google Maps'te calisiyor.
 *
 * Apple Maps'in URL semasi ara noktalari guvenilir tasimiyor, Waze hic
 * desteklemiyor. Surucu bunlardan birini sectiyse "tum rotayi ac" dugmesi
 * yine Google acar — bu yuzden dugmenin bunu SOYLEMESI gerekiyor; sessizce
 * baska uygulama acmak guven kaybettirir.
 */
export function fullRouteOpensGoogle(app: NavigationApp, platform: MobilePlatform): boolean {
  if (app === 'google') return false;
  if (app === 'default' && platform === 'android') return false;
  return true;
}
