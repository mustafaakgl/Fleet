import { storage } from '@/lib/storage';
import { NAVIGATION_APP_KEY, isNavigationApp } from '@/lib/navigation-preference';
import type { NavigationApp } from '@/lib/navigation-links';

/**
 * Tercihin kalici okunmasi/yazilmasi.
 *
 * Saf mantiktan AYRI dosyada: storage react-native'e bagli ve onu import eden
 * her sey duz node testinde cozulemiyor. Karar mantigi test edilebilir kalsin.
 */
export async function loadNavigationApp(): Promise<NavigationApp> {
  const stored = await storage.getItem(NAVIGATION_APP_KEY);
  return isNavigationApp(stored) ? stored : 'default';
}

export async function saveNavigationApp(app: NavigationApp): Promise<void> {
  await storage.setItem(NAVIGATION_APP_KEY, app);
}
