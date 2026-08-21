import { expect, test } from '@playwright/test';
import { ensureP0Fixture, fixtureToken, type FixtureManifest, type Role } from './support/p0-fixture';

/**
 * GIRISSIZ SLOT SAYFASI — TARAYICIDA (Faz 17g).
 *
 * BURADA OLCULEN SEY API DEGIL, TARAYICI. Token'in URL'de, gecmiste,
 * `Referer` basliginda ya da hata loglarinda GORUNMEDIGI ancak gercek bir
 * sayfa yuklenip gezildiginde kanitlanabilir.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const PAGE_PATH = '/public/delivery-slot';

let fixture: FixtureManifest;

function auth(role: Role): Record<string, string> {
  const token = fixtureToken(fixture, role, 'tenantA');
  if (!token) throw new Error(`fixture token yok: ${role}`);
  return { Authorization: `Bearer ${token}` };
}

const WORK_DATE = new Date(Date.now() + (500 + (Date.now() % 400)) * 86_400_000);

test.describe.serial('Faz 17g — public slot sayfasi', () => {
  let invitationToken = '';
  let slotId = '';

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(240_000);
    fixture = ensureP0Fixture();
    const request = await playwright.request.newContext();

    /**
     * HIZ SINIRI KOVASININ BOSALMASINI BEKLE.
     *
     * Public uc ROTA DUZEYINDE 10 istek/dk/IP ile sinirli ve butun testler
     * ayni IP'den geliyor. `dispatch-slots` paketi kovayi BILINCLI OLARAK
     * dolduran bir test iceriyor; hemen ardindan calisan bu paket 429 alirdi.
     * Sinir dogru calisirken testin kirmizi olmasi, sinirdan vazgecmek icin
     * bir sebep degil — beklemek dogru olan.
     */
    const deadline = Date.now() + 90_000;
    for (;;) {
      const probe = await request.get(`${API_BASE_URL}/public/delivery-slots`, {
        headers: { 'x-slot-token': 'drain-probe' },
      });
      if (probe.status() !== 429) break;
      if (Date.now() > deadline) throw new Error('hiz siniri kovasi bosalmadi');
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    const order = await request.post(`${API_BASE_URL}/transport-orders`, {
      headers: auth('admin'),
      data: {
        companyId: 'qa-p0-company-a',
        orderNumber: `UI-${Date.now()}`,
        orderDate: new Date().toISOString(),
        currency: 'EUR',
        contractedRevenue: 990,
        consignments: [
          {
            cargoDescription: 'UI Ladung',
            pickupAddress: 'Musterweg 3, 47051 Duisburg',
            deliveryAddress: 'Hafenstrasse 12, 20095 Hamburg',
            weightKg: 900,
            volumeM3: 8,
            adrStatus: 'no',
          },
        ],
      },
    });
    expect(order.status(), await order.text()).toBe(201);
    const created = (await order.json()) as { id: string; updatedAt: string };

    const confirmed = await request.post(`${API_BASE_URL}/transport-orders/${created.id}/confirm`, {
      headers: auth('admin'),
      data: { expectedUpdatedAt: created.updatedAt },
    });
    expect(confirmed.status(), await confirmed.text()).toBe(200);

    const detail = await request.get(`${API_BASE_URL}/transport-orders/${created.id}`, {
      headers: auth('admin'),
    });
    const consignment = ((await detail.json()) as {
      consignments: Array<{ id: string; deliveryLocationId: string | null }>;
    }).consignments[0]!;
    expect(consignment.deliveryLocationId, 'teslimat konumu cozulmedi').toBeTruthy();

    const slot = await request.post(`${API_BASE_URL}/delivery-slots`, {
      headers: auth('office'),
      data: {
        locationId: consignment.deliveryLocationId,
        startsAt: new Date(WORK_DATE.getTime() + 9 * 3600_000).toISOString(),
        endsAt: new Date(WORK_DATE.getTime() + 11 * 3600_000).toISOString(),
        capacity: 2,
        resourceRef: `UI-${Date.now()}`,
      },
    });
    expect(slot.status(), await slot.text()).toBe(201);
    slotId = ((await slot.json()) as { id: string }).id;

    const invitation = await request.post(`${API_BASE_URL}/delivery-slots/invitations`, {
      headers: auth('office'),
      data: { consignmentId: consignment.id, kind: 'delivery' },
    });
    expect(invitation.status(), await invitation.text()).toBe(201);
    invitationToken = ((await invitation.json()) as { token: string }).token;

    await request.dispose();
  });

  /**
   * UC IDDIA, TEK SAYFA YUKLEMESI.
   *
   * Ayri testlere bolseydik her biri yeni bir oturum acardi ve public ucun
   * ROTA DUZEYINDEKI hiz siniri (10/dk/IP) testin kendisi yuzunden devreye
   * girerdi — sinir dogru calisirken test kirmizi olurdu. Iddialar birbirinden
   * bagimsiz; ayni yuklemede olculebilirler.
   */
  test('token URL/gecmis/depolama/Referer/log`da YOK, cerez HttpOnly, ucuncu taraf script YOK', async ({
    page,
    context,
  }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    page.on('pageerror', (error) => consoleText.push(String(error)));

    const referers: string[] = [];
    const ownHost = new URL(test.info().project.use.baseURL ?? 'http://localhost:3001').host;
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const referer = request.headers().referer;
      if (referer) referers.push(referer);
      if (new URL(request.url()).host !== ownHost) externalRequests.push(request.url());
    });

    const response = await page.goto(`${PAGE_PATH}#token=${encodeURIComponent(invitationToken)}`);
    await expect(page.getByTestId('public-slot-ready')).toBeVisible({ timeout: 20_000 });

    // --- 1) TOKEN HICBIR KALICI YERDE YOK ---

    // Adres cubugu: fragment temizlendi.
    expect(page.url()).not.toContain(invitationToken);
    expect(page.url()).not.toContain('token=');
    expect(new URL(page.url()).hash).toBe('');

    // Gecmis: `replaceState` kullanildi — "geri" token'li adrese DONMEZ.
    expect(await page.evaluate(() => window.history.length)).toBeLessThanOrEqual(2);

    // Depolama: token saklanmiyor.
    const stored = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));
    expect(stored.local).not.toContain(invitationToken);
    expect(stored.session).not.toContain(invitationToken);

    // JavaScript'ten okunabilen cerezlerde token YOK.
    const documentCookie = await page.evaluate(() => document.cookie);
    expect(documentCookie).not.toContain(invitationToken);
    expect(documentCookie).not.toContain('fleet_slot_session');

    // Referer: hicbir istek token tasimadi.
    for (const referer of referers) {
      expect(referer).not.toContain(invitationToken);
    }

    // Konsol / hata logu: token metne donusmedi.
    for (const line of consoleText) {
      expect(line).not.toContain(invitationToken);
    }

    // --- 2) OTURUM CEREZI ---

    const cookie = (await context.cookies()).find((item) => item.name === 'fleet_slot_session');
    expect(cookie, 'oturum cerezi verilmedi').toBeTruthy();
    // XSS oturumu okuyamaz.
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    // Cookie YALNIZCA public slot uclarina gidiyor.
    expect(cookie!.path).toBe('/api/v1/public/delivery-slots');
    // Cerez token'in KENDISI DEGIL.
    expect(cookie!.value).not.toBe(invitationToken);

    // --- 3) UCUNCU TARAF YOK, CSP SIKI ---

    const headers = response!.headers();
    expect(headers['referrer-policy']).toBe('no-referrer');
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    // Sayfa yalnizca KENDI kaynagina konusabiliyor: bir analytics ya da hata
    // toplayici secilen saati disari TASIYAMAZ.
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // UCUNCU TARAF script kaynagi YOK — `'self'` disinda bir host yok.
    const scriptSrc = csp.split(';').find((part) => part.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toMatch(/https?:\/\//);

    // Analytics, etiket yoneticisi ya da font CDN'ine hicbir istek gitmedi.
    expect(externalRequests, `dis istek: ${externalRequests.join(', ')}`).toHaveLength(0);
  });

  test('rezervasyon, degisiklik ve iptal TARAYICIDAN calisiyor', async ({ page }) => {
    await page.goto(`${PAGE_PATH}#token=${encodeURIComponent(invitationToken)}`);
    await expect(page.getByTestId('public-slot-ready')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId(`public-slot-book-${slotId}`).click();
    await expect(page.getByTestId('public-slot-notice')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('public-slot-cancel').click();
    await expect(page.getByTestId('public-slot-notice')).toBeVisible({ timeout: 15_000 });

    // OTURUMU KAPAT: sunucudaki satir da iptal ediliyor.
    await page.getByTestId('public-slot-finish').click();
    await expect(page.getByTestId('public-slot-invalid')).toBeVisible({ timeout: 15_000 });
  });

  test('GECERSIZ link tek guvenli mesaj gosteriyor — ham kod YOK', async ({ page }) => {
    await page.goto(`${PAGE_PATH}#token=uydurma-token-uzun-uzun-uzun-1234567890`);
    const panel = page.getByTestId('public-slot-invalid');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    const text = await panel.innerText();
    // Ham makine kodu ya da HTTP durumu kullaniciya gosterilmiyor.
    for (const leak of ['slot_invitation_invalid', '404', 'Exception', 'statusCode']) {
      expect(text).not.toContain(leak);
    }
  });

  test('DE/EN/TR — ucunde de ham anahtar gorunmuyor', async ({ browser }) => {
    for (const [language, expected] of [
      ['de', 'Zeitfenster'],
      ['en', 'time slot'],
      ['tr', 'saat'],
    ] as const) {
      /**
       * HER DIL ICIN TAZE BIR BAGLAM.
       *
       * Ayni sayfayi yeniden `goto` etmek Next'in RSC onbelleginden
       * karsilanabiliyor ve dil DEGISMEMIS gorunuyordu — cerez dogru
       * yazilmis olsa bile. Taze baglam hem cerezi hem onbellegi sifirliyor.
       */
      const context = await browser.newContext({
        extraHTTPHeaders: {},
      });
      await context.addCookies([
        { name: 'fleet_language', value: language, url: 'http://localhost:3001' },
      ]);
      const page = await context.newPage();

      await page.goto(`${PAGE_PATH}#token=${encodeURIComponent(invitationToken)}`);
      await expect(page.getByTestId('public-slot-ready')).toBeVisible({ timeout: 20_000 });

      // Sunucu dogru dili verdi.
      expect(await page.evaluate(() => document.documentElement.lang), language).toBe(language);

      await expect(page.locator('main'), language).toContainText(expected, {
        ignoreCase: true,
        timeout: 15_000,
      });

      // HAM ANAHTAR ekranda YOK.
      const body = await page.locator('main').innerText();
      expect(body, language).not.toContain('publicSlot.');
      expect(body, language).not.toContain('slots.error.');
      expect(body, language).not.toContain('dispatch.reason.');

      await context.close();
    }
  });
});
