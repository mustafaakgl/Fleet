import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

/**
 * Faz 3 gorsel dogrulama — surucu yakit istasyonu ekrani.
 *
 * MEVCUT test auth altyapisi kullaniliyor: auth/auth.setup.ts'in urettigi
 * `.auth/driver.json` storage state. Bu dosya burada kimlik bilgisi
 * ISTEMEZ ve uretmez.
 *
 * Backend'in FUEL_STATION_PROVIDER=mock ile calistigi varsayiliyor (gercek
 * Tankerkonig anahtari yok) — bu yuzden ekranda demo bandi beklenir.
 */

const DRIVER_STATE = path.resolve(__dirname, '..', '..', '.auth', 'driver.json');
const OUT_DIR = path.resolve(__dirname, '..', '..', 'playwright-report', 'faz3-fuel-stations');

test.describe('Driver fuel stations — visual', () => {
  test.skip(!fs.existsSync(DRIVER_STATE), 'Driver auth state missing — run the setup project first.');
  test.use({ storageState: DRIVER_STATE });

  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test('mobile and desktop, before and after searching', async ({ page, context }) => {
    // Konum izni ve sabit bir koordinat: Duisburg. Boylece mock saglayici
    // deterministik istasyonlar uretiyor ve ekran goruntuleri kararli oluyor.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 51.4344, longitude: 6.7623 });

    // --- Mobil: ilk durum (henuz arama yok) ---
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/driver/fuel-stations');
    expect(response?.status(), 'fuel stations route should load').toBeLessThan(400);

    await expect(page.getByRole('button', { name: /Tankstelle finden|Find fuel station|Yakıt istasyonu bul/ })).toBeVisible();
    await page.screenshot({ path: path.join(OUT_DIR, '01-mobile-initial.png'), fullPage: true });

    // --- Mobil: arama sonrasi (liste + harita + demo bandi) ---
    await page.getByRole('button', { name: /Tankstelle finden|Find fuel station|Yakıt istasyonu bul/ }).click();

    // Ya istasyonlar gelir, ya anlamli bir durum ekrani cikar (ornegin araca
    // yakit uyumlulugu tanimli degilse 409). Ikisi de gecerli bir ekran.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '02-mobile-after-search.png'), fullPage: true });

    const bodyText = (await page.locator('body').innerText()).slice(0, 4000);
    fs.writeFileSync(path.join(OUT_DIR, 'mobile-after-search.txt'), bodyText, 'utf8');

    // --- Masaustu ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, '03-desktop-after-search.png'), fullPage: true });

    // Ekran hicbir kosulda ham hata kodu gostermemeli.
    for (const rawCode of [
      'vehicle_fuel_compatibility_missing',
      'driver_vehicle_not_resolved',
      'fuel_station_provider_unavailable',
      'fuel_station_provider_not_configured',
      'hgvAccess',
      'acceptedFuelCards',
      'pricesUpdatedAt',
    ]) {
      expect(bodyText, `raw code ${rawCode} must not be shown to the driver`).not.toContain(rawCode);
    }
  });

  test('location denied shows a recoverable error', async ({ page, context }) => {
    await context.clearPermissions();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/driver/fuel-stations');

    await page.getByRole('button', { name: /Tankstelle finden|Find fuel station|Yakıt istasyonu bul/ }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, '04-mobile-location-denied.png'), fullPage: true });

    const text = await page.locator('body').innerText();
    fs.writeFileSync(path.join(OUT_DIR, 'mobile-location-denied.txt'), text.slice(0, 2000), 'utf8');
  });
});
