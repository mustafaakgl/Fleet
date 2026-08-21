import { expect, test, type Page } from '@playwright/test';
import { ensureP0Fixture, type FixtureManifest, type Role } from './support/p0-fixture';

/**
 * GORSEL KAPI — DORT COZUNURLUK (Faz 17g).
 *
 * OLCULEN SEY "guzel gorunuyor mu" DEGIL, KULLANILABILIR mi:
 *   1. Sayfa govdesi YATAY KAYMIYOR. Mobilde yatay kaydirma, iceriginin bir
 *      kismini gorunmez yapar ve kullanici onu aradigini bilmez.
 *   2. Hicbir etkilesimli ogenin dokunma hedefi ekranin disinda kalmiyor.
 *   3. Ham ceviri anahtari ekranda yok.
 *
 * Ekran goruntusu de aliniyor; ama TEST screenshot'a bakmiyor — bakmasi
 * gereken sey olculebilir olmali.
 */

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

let fixture: FixtureManifest;

async function authenticate(page: Page, role: Role) {
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

/** Govde yatay kayiyor mu — 1 px tolerans yuvarlamalar icin. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - root.clientWidth);
  });
}

/** Ekranin disina tasan etkilesimli ogeler. */
async function offscreenControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const width = document.documentElement.clientWidth;
    for (const element of Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea'),
    )) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // Sol/sag kenardan tasanlar: dokunulamaz hale gelirler.
      if (rect.left < -1 || rect.right > width + 1) {
        offenders.push(
          `${element.tagName.toLowerCase()}#${element.id || '-'} ${Math.round(rect.left)}..${Math.round(rect.right)} > ${width}`,
        );
      }
    }
    return offenders.slice(0, 8);
  });
}

async function assertUsable(page: Page, label: string) {
  const overflow = await horizontalOverflow(page);
  expect(overflow, `${label}: govde ${overflow}px yatay kayiyor`).toBeLessThanOrEqual(1);

  const offenders = await offscreenControls(page);
  expect(offenders, `${label}: ekran disi kontrol -> ${offenders.join(' | ')}`).toHaveLength(0);

  const body = await page.locator('body').innerText();
  for (const prefix of ['dispatch.', 'slots.', 'publicSlot.', 'vehicleDetail.capacity.']) {
    expect(body, `${label}: ham anahtar ${prefix}`).not.toContain(prefix);
  }
}

test.describe.serial('Faz 17g — gorsel kapi', () => {
  test.beforeAll(() => {
    fixture = ensureP0Fixture();
  });

  for (const viewport of VIEWPORTS) {
    test(`dispatch kuyrugu ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticate(page, 'office');
      await page.goto('/dispatch');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      // Kuyruk yuklendi (tablo, kart listesi ya da bos durum).
      await page.waitForTimeout(1_500);
      await assertUsable(page, `dispatch/${viewport.name}`);
      await page.screenshot({
        path: `test-results/faz17g-dispatch-${viewport.name}.png`,
        fullPage: true,
      });
    });

    test(`teslimat slotlari ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticate(page, 'office');
      await page.goto('/delivery-slots');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1_500);
      await assertUsable(page, `slots/${viewport.name}`);
      await page.screenshot({
        path: `test-results/faz17g-slots-${viewport.name}.png`,
        fullPage: true,
      });
    });

    test(`arac kapasitesi ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticate(page, 'office');
      await page.goto('/vehicles/qa-p0-vehicle-a');
      await expect(page.getByTestId('vehicle-capacity-edit')).toBeVisible({ timeout: 25_000 });

      // DUZENLEME MODU DA olculuyor: form alanlari dar ekranda tasmamali.
      await page.getByTestId('vehicle-capacity-edit').click();
      await expect(page.getByTestId('capacity-payload_capacity_kg')).toBeVisible();
      await assertUsable(page, `vehicle-capacity/${viewport.name}`);
      await page.screenshot({
        path: `test-results/faz17g-vehicle-capacity-${viewport.name}.png`,
        fullPage: true,
      });
    });
  }
});
