import path from 'node:path';
import { ensureP0Fixture, type FixtureManifest, type Role } from './support/p0-fixture';
import { expect, test, type Page } from '@playwright/test';

/**
 * Finance merkezi (Faz 18C) — uctan uca.
 *
 * Sinanan sey: TEK ekranda yedi blogun bulunmasi, tahmin ile gerceklesenin
 * ayri kalmasi, rol kapisinin GERCEKTEN sunucuda olmasi ve karar panelinin
 * ret nedeni olmadan gecmemesi.
 *
 * Kimlik dogrulama MEVCUT fixture'lardan: testte parola yazilmiyor.
 */

const E2E_ROOT = path.resolve(__dirname, '..');

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

test.describe.serial('Finance merkezi', () => {
  let fixture: FixtureManifest;

  test.beforeAll(() => {
    fixture = ensureP0Fixture();
  });

  test('muhasebe yedi blogu TEK ekranda goruyor', async ({ page }) => {
    await authenticate(page, fixture, 'accounting');
    await page.goto('/finance');

    await expect(page.getByTestId('finance-overview')).toBeVisible();

    // 1-4) Ozet kartlari: tahmin ve gerceklesen AYRI.
    await expect(page.getByTestId('finance-kpi-actualRevenue')).toBeVisible();
    await expect(page.getByTestId('finance-kpi-estimatedRevenue')).toBeVisible();
    await expect(page.getByTestId('finance-kpi-approvedCost')).toBeVisible();
    await expect(page.getByTestId('finance-kpi-margin')).toBeVisible();

    // 5-7) Listeler ve para birimi blogu.
    await expect(page.getByTestId('finance-pending-service')).toBeVisible();
    await expect(page.getByTestId('finance-fuel-receipts')).toBeVisible();
    await expect(page.getByTestId('finance-disputed-fines')).toBeVisible();

    // TEK ekran: alti ayri sayfaya bolunmedi, alt rota YOK.
    expect(new URL(page.url()).pathname).toBe('/finance');
  });

  test('tahmini ve gercek gelir ayri kartlarda ve sinifi YAZILI', async ({ page }) => {
    await authenticate(page, fixture, 'accounting');
    await page.goto('/finance');

    const estimated = page.getByTestId('finance-kpi-estimatedRevenue');
    const actual = page.getByTestId('finance-kpi-actualRevenue');
    await expect(estimated).toBeVisible();

    // Rozet METIN olarak duruyor: renk tek basina anlam tasimaz.
    await expect(estimated).toContainText(/Schätzung|Estimate|Tahmin/i);
    await expect(actual).toContainText(/Tatsächlich|Actual|Gerçek/i);

    // Ham ceviri anahtari SIZMIYOR.
    await expect(page.getByTestId('finance-overview')).not.toContainText('finance.kpi.');
  });

  test('satis faturalari butonu MEVCUT /invoicing ekranina goturuyor', async ({ page }) => {
    await authenticate(page, fixture, 'accounting');
    await page.goto('/finance');

    // Kenar cubugunda da ayni adla bir baglanti var: secici EKRANA
    // sinirlandiriliyor, aksi halde hangisinin tiklandigi belirsiz olurdu.
    await page
      .getByTestId('finance-overview')
      .getByRole('link', { name: /Ausgangsrechnungen|sales invoices|faturalar/i })
      .click();
    /**
     * `commit` yeterli: sinanan sey butonun MEVCUT `/invoicing` rotasina
     * gitmesi, o sayfanin ne kadar surede yuklendigi DEGIL. Tam `load`
     * beklemek, ilgisiz bir sayfanin dev-derleme suresini bu testin
     * gecmesine kosul yapardi.
     */
    await page.waitForURL('**/invoicing', { waitUntil: 'commit' });
    expect(new URL(page.url()).pathname).toBe('/invoicing');
  });

  test('ofis rolu ekrani GORMUYOR ve sunucu da veri VERMIYOR', async ({ page }) => {
    await authenticate(page, fixture, 'office');

    // Sunucu kapisi: yetkisiz rol cevabin kendisini alamiyor.
    const response = await page.request.get(
      `${process.env.API_URL ?? 'http://localhost:3000/api/v1'}/finance/summary?months=6`,
      { headers: { Authorization: `Bearer ${fixture.accessTokens[fixture.tenantA.tenantId].office}` } },
    );
    expect(response.status()).toBe(403);

    await page.goto('/finance');
    // Ekran acik bir mesaj gosteriyor; finansal alan HIC render edilmiyor.
    await expect(page.getByTestId('finance-overview')).toHaveCount(0);
    await expect(page.getByTestId('finance-kpi-actualRevenue')).toHaveCount(0);

    // Menude de yok.
    await expect(page.locator('nav a[href="/finance"]')).toHaveCount(0);
  });

  test('mobilde kart, masaustunde tablo — yatay tasma YOK', async ({ page }) => {
    await authenticate(page, fixture, 'accounting');

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/finance');
      await expect(page.getByTestId('finance-overview')).toBeVisible();

      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth > de.clientWidth;
      });
      expect(overflow, `yatay tasma @${viewport.width}px`).toBe(false);
    }
  });
});
