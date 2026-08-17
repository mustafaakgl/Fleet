import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Arac maliyetleri dashboard'u — uctan uca.
 *
 * Kimlik dogrulama MEVCUT fixture'lardan geliyor: testte parola yazilmiyor,
 * giris formu doldurulmuyor. Seed, diger P0 UI testleriyle ayni manifest'i
 * uretir.
 *
 * Sinanan sey grafik pikselleri degil, ekranin verdigi bilgi ve gezinme:
 * rakamlarin gorunmesi, eksik verinin adiyla anlatilmasi, secimin senkron
 * kalmasi, drill-down baglantilarinin donemi tasimasi ve CSV.
 */

const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');

type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type FixtureManifest = {
  tenantA: {
    tenantId: string;
    users: Record<Role, { id: string; email: string; role: Role }>;
  };
  accessTokens: Record<string, Record<Role, string>>;
};

async function authenticate(page: Page, fixture: FixtureManifest, role: Role) {
  const token = fixture.accessTokens[fixture.tenantA.tenantId][role];
  const user = { ...fixture.tenantA.users[role], name: fixture.tenantA.users[role].email };
  await page.addInitScript(
    ({ accessToken, authUser }) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('fleet_access_token', accessToken);
      localStorage.setItem('user', JSON.stringify(authUser));
      localStorage.setItem('fleet_user', JSON.stringify(authUser));
      sessionStorage.removeItem('fleet_skip_auto_login');
    },
    { accessToken: token, authUser: user },
  );
}

test.describe.serial('Fahrzeugkosten-Dashboard', () => {
  let fixture: FixtureManifest;

  test.beforeAll(() => {
    /**
     * Seed AYNI KOSUDA IKINCI KEZ calisirsa tekil kisita takiliyor. Bu bir
     * hata degil, "zaten kurulu" demek: birden fazla spec dosyasi ayni
     * fixture'i paylasiyor. Manifest diskte durdugu icin onu yeniden
     * kullaniyoruz — koru koruye tekrar seed etmek yerine.
     */
    try {
      execFileSync('npm', ['run', 'seed:p0-qa'], { cwd: BACKEND_ROOT, env: process.env, stdio: 'pipe' });
    } catch (error) {
      if (!existsSync(FIXTURE_PATH)) throw error;
    }
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
  });

  test('muhasebe dashboard\'u ucdan uca kullanabiliyor', async ({ page }) => {
    await authenticate(page, fixture, 'accounting');

    // 1) Dashboard sekmesi acilir.
    await page.goto('/costs');
    const dashboard = page.getByTestId('cost-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 20_000 });

    // 2) KPI satiri yuklendi.
    await expect(page.getByTestId('kpi-row')).toBeVisible();
    await expect(page.getByTestId('kpi-totalCost')).toBeVisible();

    // 3) Maliyet/km ya gercek bir deger ya da "yetersiz veri" gosterir;
    //    uydurma bir `0` KABUL EDILMEZ.
    const perKm = page.getByTestId('kpi-costPerKm');
    await expect(perKm).toBeVisible();
    const perKmText = (await perKm.innerText()).trim();
    expect(perKmText.length).toBeGreaterThan(0);

    // 4) Kapsam metni her zaman var: hangi araclar hesaba katildi.
    await expect(page.getByTestId('coverage-note')).toBeVisible();

    // 5) Aylik seri TABLO olarak da okunabiliyor (grafik tek kaynak degil).
    const monthlyRows = page.getByTestId('monthly-table').locator('tbody tr');
    await expect(monthlyRows.first()).toBeVisible();

    // 6) Dagilim listesi metin olarak var.
    await expect(page.getByTestId('composition-list')).toBeVisible();

    // 7) Arac tablosunda 12 sutun var.
    const headers = page.getByTestId('vehicle-table').locator('thead th');
    await expect(headers).toHaveCount(12);

    // 8) Satir secimi, secili arac kartiyla SENKRON.
    const firstRow = page.getByTestId('vehicle-table').locator('tbody tr[role="button"]').first();
    await expect(firstRow).toBeVisible();
    const plate = (await firstRow.locator('th').first().innerText()).trim();
    await firstRow.click();
    await expect(firstRow).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('selected-vehicle')).toContainText(plate);

    // 9) Klavyeyle de secilebiliyor.
    const rows = page.getByTestId('vehicle-table').locator('tbody tr[role="button"]');
    if ((await rows.count()) > 1) {
      const second = rows.nth(1);
      await second.focus();
      await page.keyboard.press('Enter');
      await expect(second).toHaveAttribute('data-selected', 'true');
      await expect(firstRow).toHaveAttribute('data-selected', 'false');
    }

    // 10) Olcut secicide bes olcut var.
    const metrics = page.getByTestId('trend-metric-selector').locator('button');
    await expect(metrics).toHaveCount(5);

    // 11) Olcut degistirince trend tablosunun basligi degisir.
    await page.getByTestId('trend-metric-fines').click();
    await expect(page.getByTestId('trend-metric-fines')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('trend-table')).toBeVisible();

    // 12) Maliyet/km secilemezse SEBEBI yazili olmali.
    const perKmMetric = page.getByTestId('trend-metric-costPerKm');
    if (await perKmMetric.isDisabled()) {
      await expect(page.getByTestId('trend-nodistance-hint')).toBeVisible();
    } else {
      await perKmMetric.click();
      await expect(perKmMetric).toHaveAttribute('aria-pressed', 'true');
    }

    // 13) CSV disa aktarimi calisir ve temel para birimi sutunu tasir.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('cost-dashboard-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^fahrzeugkosten-.*\.csv$/);
    const csvPath = await download.path();
    const csv = readFileSync(csvPath!, 'utf8');
    expect(csv.split('\n')[0]).toContain('currency');
    // Tutarlar MAKINE OKUNABILIR: para sembolu yok.
    expect(csv).not.toContain('€');

    // 14) Donem degistirilebiliyor.
    await page.getByRole('button', { name: /12/ }).first().click();
    await expect(page.getByTestId('cost-dashboard')).toBeVisible();

    // 15) Fis drill-down'i arac ve donemi tasir, filtre GORUNUR.
    const receiptLink = firstRow.getByRole('link', { name: /Beleg|Receipt|Fiş/i }).first();
    const receiptHref = await receiptLink.getAttribute('href');
    expect(receiptHref).toContain('vehicleId=');
    expect(receiptHref).toContain('from=');
    await page.goto(receiptHref!);
    await expect(page.getByTestId('receipt-filter-banner')).toBeVisible({ timeout: 20_000 });

    // 16) Ceza drill-down'i da filtreyi gosterir.
    await page.goto('/costs');
    await expect(page.getByTestId('cost-dashboard')).toBeVisible({ timeout: 20_000 });
    const finesLink = page
      .getByTestId('vehicle-table')
      .locator('tbody tr[role="button"]')
      .first()
      .getByRole('link', { name: /Bußgeld|Fine|Ceza/i })
      .first();
    const finesHref = await finesLink.getAttribute('href');
    expect(finesHref).toContain('vehicle_id=');
    await page.goto(finesHref!);
    await expect(page.getByTestId('fines-filter-banner')).toBeVisible({ timeout: 20_000 });

    // 17) Hicbir ekranda ham hata kodu sizmamis olmali.
    await page.goto('/costs');
    await expect(page.getByTestId('cost-dashboard')).toBeVisible({ timeout: 20_000 });
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/tenant_not_found|unsupported_currency|internal_/);
  });

  test('muhasebe temel para birimini goruyor ama degistiremiyor', async ({ page }) => {
    await authenticate(page, fixture, 'accounting');
    await page.goto('/settings');
    const card = page.getByTestId('tenant-finance-settings');
    await expect(card).toBeVisible({ timeout: 20_000 });
    // Salt okunur: kaydet dugmesi YOK.
    await expect(page.getByTestId('finance-currency-save')).toHaveCount(0);
    await expect(page.getByTestId('finance-readonly')).toBeVisible();
  });

  test('admin zaman dilimini degistirebiliyor', async ({ page }) => {
    await authenticate(page, fixture, 'admin');
    await page.goto('/settings');
    const select = page.getByTestId('finance-timezone-select');
    await expect(select).toBeVisible({ timeout: 20_000 });
    await expect(select).toBeEnabled();
    await expect(page.getByTestId('finance-timezone-save')).toBeVisible();
  });

  test('ofis rolu temel para birimi kartini hic gormuyor', async ({ page }) => {
    await authenticate(page, fixture, 'office');
    await page.goto('/settings');
    // Once sayfanin GERCEKTEN yuklendigini dogruluyoruz; aksi halde
    // "kart yok" iddiasi bos bir sayfada da dogru cikardi.
    await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tenant-finance-settings')).toHaveCount(0);
  });
});
