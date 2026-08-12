import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

/**
 * Faz 4 gorsel dogrulama — rota bazli istasyon onerileri.
 *
 * MEVCUT test auth altyapisi kullaniliyor (auth/auth.setup.ts'in urettigi
 * `.auth/driver.json`); bu dosya kimlik bilgisi istemez.
 *
 * Aktif tur ve rota metrikleri icin ortamda (a) FUEL_STATION_PROVIDER=mock ve
 * (b) localhost:8002'de Valhalla sozlesmesine uyan bir servis calisiyor olmali.
 * Ikisi de yoksa test yine gecer: ekran o zaman nearby_only ya da
 * routing_unavailable durumunu gostermeli ve HAM HATA KODU sizdirmamali —
 * asil iddia budur.
 */

const DRIVER_STATE = path.resolve(__dirname, '..', '..', '.auth', 'driver.json');
const OUT_DIR = path.resolve(__dirname, '..', '..', 'playwright-report', 'faz4-route-recommendations');

const FIND_ACTION = /Tankstelle finden|Find fuel station|Yakıt istasyonu bul/;
const LITRES_LABEL = /Geplante Tankmenge|Planned fuel amount|Alınacak tahmini yakıt/;

test.describe('Driver route-based fuel recommendations — visual', () => {
  test.skip(!fs.existsSync(DRIVER_STATE), 'Driver auth state missing — run the setup project first.');
  test.use({ storageState: DRIVER_STATE });

  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test('mobile: active tour, route metrics, planned litres', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 51.4344, longitude: 6.7623 });
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto('/driver/fuel-stations');
    expect(response?.status()).toBeLessThan(400);

    await page.getByRole('button', { name: FIND_ACTION }).click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-mobile-active-tour.png'), fullPage: true });

    const afterSearch = await page.locator('body').innerText();
    fs.writeFileSync(path.join(OUT_DIR, 'mobile-active-tour.txt'), afterSearch.slice(0, 6000), 'utf8');

    // Planlanan litre: alan BOS baslamali.
    const litres = page.getByLabel(LITRES_LABEL);
    if (await litres.count()) {
      await expect(litres).toHaveValue('');
      await litres.fill('400');
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(OUT_DIR, '02-mobile-planned-litres.png'),
        fullPage: true,
      });
      const withLitres = await page.locator('body').innerText();
      fs.writeFileSync(path.join(OUT_DIR, 'mobile-planned-litres.txt'), withLitres.slice(0, 6000), 'utf8');
    }

    // Masaustu.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, '03-desktop-active-tour.png'), fullPage: true });

    // Hicbir kosulda ham kod / teknik ayrinti gosterilmiyor.
    for (const forbidden of [
      'routing_unavailable',
      'no_active_tour',
      'next_stop_location_missing',
      'vehicle_fuel_compatibility_missing',
      'driver_vehicle_not_resolved',
      'sources_to_targets',
      'Valhalla',
      'valhalla',
      'hgvAccess',
      'acceptedFuelCards',
      'pricesUpdatedAt',
      'NaN',
      'Infinity',
    ]) {
      expect(afterSearch, `${forbidden} must not be shown to the driver`).not.toContain(forbidden);
    }
  });

  test('mobile: sorting stays local — no new request', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 51.4344, longitude: 6.7623 });
    await page.setViewportSize({ width: 390, height: 844 });

    const apiCalls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/fuel-stations/')) apiCalls.push(url);
    });

    await page.goto('/driver/fuel-stations');
    await page.getByRole('button', { name: FIND_ACTION }).click();
    await page.waitForTimeout(3000);

    const afterFirstSearch = apiCalls.length;
    expect(afterFirstSearch).toBeGreaterThan(0);

    // Siralama dugmelerine basmak YENI ISTEK acmamali.
    for (const label of [/Fahrzeit zur Tankstelle|Drive time to station|İstasyona sürüş süresi/, /Entfernung|Distance|Mesafe/]) {
      const button = page.getByRole('button', { name: label });
      if ((await button.count()) && (await button.first().isEnabled())) {
        await button.first().click();
        await page.waitForTimeout(300);
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, '04-mobile-sorted.png'), fullPage: true });
    expect(apiCalls.length, 'sorting must not trigger a network request').toBe(afterFirstSearch);
  });
});
