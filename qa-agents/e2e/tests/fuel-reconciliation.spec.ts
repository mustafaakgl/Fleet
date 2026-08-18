import path from 'node:path';
import { ensureP0Fixture, type FixtureManifest, type Role } from './support/p0-fixture';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Yakit fisi / telematik mutabakati — uctan uca (Faz 11).
 *
 * Kimlik dogrulama MEVCUT fixture'lardan geliyor: testte parola yazilmiyor.
 *
 * SINANAN SEY iki parca:
 *   1) Onayin analizi gercekten kuyruga koymasi ve rol sinirinin tutmasi —
 *      bunlar worker'a HIC bagli degil, aninda dogrulaniyor.
 *   2) Worker calistiktan sonra sonucun, kanitin ve inceleme akisinin
 *      dogru olmasi.
 *
 * WORKER SIKLIGI: varsayilan cron bes dakikada bir. Test bunu bekleyecek
 * kadar uzun bir zaman asimiyla kurulmus (atlanmiyor, gercekten bekliyor).
 * Backend `FUEL_RECONCILIATION_CRON_EXPRESSION='*\/10 * * * * *'` ile
 * calistirilirsa ayni test saniyeler icinde biter.
 */

const E2E_ROOT = path.resolve(__dirname, '..');
const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

/** Worker'in bekleyen analizi islemesi icin taninan sure. */
const WORKER_TIMEOUT_MS = Number(process.env.FUEL_RECONCILIATION_E2E_TIMEOUT_MS || 330_000);

void E2E_ROOT;

function token(fixture: FixtureManifest, role: Role) {
  return fixture.accessTokens[fixture.tenantA.tenantId]?.[role] ?? null;
}

async function authenticate(page: Page, fixture: FixtureManifest, role: Role) {
  const accessToken = token(fixture, role)!;
  const user = { ...fixture.tenantA.users[role], name: fixture.tenantA.users[role].email };
  await page.addInitScript(
    ({ accessToken: t, authUser }) => {
      localStorage.setItem('accessToken', t);
      localStorage.setItem('fleet_access_token', t);
      localStorage.setItem('user', JSON.stringify(authUser));
      localStorage.setItem('fleet_user', JSON.stringify(authUser));
      sessionStorage.removeItem('fleet_skip_auto_login');
    },
    { accessToken, authUser: user },
  );
}

/** Her kosuda FARKLI baytlar — `receiptFileHash` tekilligi ikinci kosuyu dusurmesin. */
function receiptBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    Buffer.from(`faz11-${Date.now()}-${Math.random()}`),
    Buffer.from([0xff, 0xd9]),
  ]);
}

test.describe.serial('Tankbeleg-Telematikabgleich', () => {
  let fixture: FixtureManifest;
  let adminToken: string;
  let accountingToken: string;
  let driverToken: string;
  let officeToken: string;
  let vehicleId: string;
  let receiptId: string;
  let reconciliationId: string;

  test.beforeAll(async ({ request }) => {
    fixture = ensureP0Fixture();
    adminToken = token(fixture, 'admin')!;
    accountingToken = token(fixture, 'accounting')!;
    driverToken = token(fixture, 'driver')!;
    officeToken = token(fixture, 'office')!;

    const adminAuth = { Authorization: `Bearer ${adminToken}` };

    const vehicles = await request.get(`${API_BASE_URL}/vehicles`, { headers: adminAuth });
    expect(vehicles.ok()).toBeTruthy();
    const vehicleBody = await vehicles.json();
    const vehicle = (Array.isArray(vehicleBody) ? vehicleBody : vehicleBody.data ?? vehicleBody.items)[0];
    expect(vehicle, 'test kiracisinda en az bir arac olmali').toBeTruthy();
    vehicleId = vehicle.id;

    const drivers = await request.get(`${API_BASE_URL}/drivers`, { headers: adminAuth });
    expect(drivers.ok()).toBeTruthy();
    const driverBody = await drivers.json();
    const driverRow = (Array.isArray(driverBody) ? driverBody : driverBody.data ?? driverBody.items)[0];
    expect(driverRow, 'fixture surucusu bulunmali').toBeTruthy();

    // Depo kapasitesi olmadan MIKTAR KURALLARI CALISMAZ — testin konusu tam
    // olarak bu kural, o yuzden once kapasite yaziliyor.
    const updated = await request.patch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      headers: adminAuth,
      data: { current_driver_id: driverRow.id, fuel_tank_capacity_liters: 80 },
    });
    expect(updated.ok(), await updated.text()).toBeTruthy();
    expect((await updated.json()).fuel_tank_capacity_liters).toBe(80);
  });

  test('onay analizi kuyruga koyar; rol siniri ofisi ve surucuyu disarida tutar', async ({ request }) => {
    const driverAuth = { Authorization: `Bearer ${driverToken}` };
    const accountingAuth = { Authorization: `Bearer ${accountingToken}` };

    const upload = await request.post(`${API_BASE_URL}/driver/fuel-receipts`, {
      headers: driverAuth,
      multipart: {
        receipt: { name: `faz11-${Date.now()}.jpg`, mimeType: 'image/jpeg', buffer: receiptBytes() },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const uploaded = await upload.json();

    // 80 litrelik depoya 400 litre: kapasiteyi acikca asiyor.
    const confirmed = await request.put(
      `${API_BASE_URL}/driver/fuel-receipts/${uploaded.id}/confirm`,
      {
        headers: driverAuth,
        data: {
          purchasedAt: new Date().toISOString(),
          fuelProduct: 'DIESEL',
          liters: 400,
          pricePerLiter: 1.75,
          fuelGrossAmount: 700,
          currency: 'EUR',
          acknowledgeFuelMismatch: true,
        },
      },
    );
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    receiptId = (await confirmed.json()).receipt.id;

    // ONAYDAN ONCE analiz YOK: kontrol, muhasebenin kararindan sonra baslar.
    const beforeApproval = await request.get(`${API_BASE_URL}/fleet/fuel-receipts/${receiptId}`, {
      headers: accountingAuth,
    });
    expect(beforeApproval.ok()).toBeTruthy();
    const pendingReceipt = await beforeApproval.json();
    expect(pendingReceipt.reconciliation).toBeNull();

    const approved = await request.post(
      `${API_BASE_URL}/fleet/fuel-receipts/${receiptId}/approve`,
      { headers: accountingAuth, data: { expectedUpdatedAt: pendingReceipt.updatedAt } },
    );
    expect(approved.ok(), await approved.text()).toBeTruthy();

    // Onay analizi AYNI transaction'da yaratti: worker beklemeden gorunur.
    const detail = await request.get(`${API_BASE_URL}/fleet/fuel-receipts/${receiptId}`, {
      headers: accountingAuth,
    });
    expect(detail.ok()).toBeTruthy();
    const approvedReceipt = await detail.json();
    expect(approvedReceipt.reconciliation).not.toBeNull();
    reconciliationId = approvedReceipt.reconciliation.id;

    // --- Rol siniri ---
    for (const [label, bearer] of [
      ['office', officeToken],
      ['driver', driverToken],
    ] as const) {
      const forbidden = await request.get(`${API_BASE_URL}/fleet/fuel-reconciliations`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      expect(forbidden.status(), `${label} mutabakat listesini gormemeli`).toBe(403);

      const forbiddenDetail = await request.get(
        `${API_BASE_URL}/fleet/fuel-reconciliations/${reconciliationId}`,
        { headers: { Authorization: `Bearer ${bearer}` } },
      );
      expect(forbiddenDetail.status(), `${label} mutabakat detayini gormemeli`).toBe(403);
    }

    // --- Surucuye IC AYRINTI sizmiyor ---
    const driverView = await request.get(`${API_BASE_URL}/driver/fuel-receipts/${receiptId}`, {
      headers: driverAuth,
    });
    expect(driverView.ok()).toBeTruthy();
    const driverPayload = JSON.stringify(await driverView.json());
    for (const leaked of ['riskLevel', 'riskScore', 'signals', 'evidence', 'reviewNote']) {
      expect(driverPayload, `surucu gorunumune sizdi: ${leaked}`).not.toContain(leaked);
    }
  });

  test('worker sonucu hesaplar, kanit ve inceleme akisi calisir', async ({ request }) => {
    test.setTimeout(WORKER_TIMEOUT_MS + 60_000);
    const accountingAuth = { Authorization: `Bearer ${accountingToken}` };

    const calculated = await expect
      .poll(
        async () => {
          const response = await request.get(
            `${API_BASE_URL}/fleet/fuel-reconciliations/${reconciliationId}`,
            { headers: accountingAuth },
          );
          if (!response.ok()) return null;
          const body = await response.json();
          return body.status === 'calculated' ? body : null;
        },
        {
          timeout: WORKER_TIMEOUT_MS,
          message:
            'Analiz hesaplanmadi. Backend calisiyor mu ve FUEL_RECONCILIATION_CRON_ENABLED kapali mi?',
        },
      )
      .not.toBeNull();
    void calculated;

    const detail = await request.get(
      `${API_BASE_URL}/fleet/fuel-reconciliations/${reconciliationId}`,
      { headers: accountingAuth },
    );
    const panel = await detail.json();

    // Kapasiteyi asan litre GUCLU sinyal — telematik verisi olmasa bile.
    expect(panel.riskLevel).toBe('high_attention');
    expect(panel.signals.map((signal: { code: string }) => signal.code)).toContain(
      'receipt_exceeds_tank_capacity',
    );
    expect(panel.evidence.tankCapacityLiters).toBe(80);
    expect(panel.evidence.receiptLiters).toBe(400);
    // SUCLAMA YOK: sonuc metinlerinde boyle bir sinif hic uretilmiyor.
    expect(JSON.stringify(panel).toLowerCase()).not.toContain('diebstahl');

    // Liste ucunde de gorunuyor ve ilgili fise bagli.
    const list = await request.get(
      `${API_BASE_URL}/fleet/fuel-reconciliations?riskLevel=high_attention&reviewState=open`,
      { headers: accountingAuth },
    );
    expect(list.ok()).toBeTruthy();
    const queue = await list.json();
    expect(queue.rows.some((row: { fuelEntryId: string }) => row.fuelEntryId === receiptId)).toBe(true);
    expect(queue.summary.highAttentionCount).toBeGreaterThan(0);

    // --- Inceleme: not ZORUNLU, cakisma korumasi calisiyor ---
    const missingNote = await request.post(
      `${API_BASE_URL}/fleet/fuel-reconciliations/${reconciliationId}/review`,
      {
        headers: accountingAuth,
        data: { expectedUpdatedAt: panel.updatedAt, outcome: 'valid', note: '' },
      },
    );
    expect(missingNote.status(), 'notsuz karar kabul edilmemeli').toBe(400);

    const reviewed = await request.post(
      `${API_BASE_URL}/fleet/fuel-reconciliations/${reconciliationId}/review`,
      {
        headers: accountingAuth,
        data: {
          expectedUpdatedAt: panel.updatedAt,
          outcome: 'corrected',
          note: 'Beleg geprüft, Menge im Beleg falsch erfasst.',
        },
      },
    );
    expect(reviewed.ok(), await reviewed.text()).toBeTruthy();
    const reviewedBody = await reviewed.json();
    expect(reviewedBody.changed).toBe(true);
    expect(reviewedBody.reconciliation.review.state).toBe('closed');
    expect(reviewedBody.reconciliation.review.outcome).toBe('corrected');

    // ESKIMIS surum damgasi ile ikinci farkli karar CAKISMA doner.
    const stale = await request.post(
      `${API_BASE_URL}/fleet/fuel-reconciliations/${reconciliationId}/review`,
      {
        headers: accountingAuth,
        data: {
          expectedUpdatedAt: panel.updatedAt,
          outcome: 'duplicate',
          note: 'Zweiter Versuch mit altem Stand.',
        },
      },
    );
    expect(stale.status()).toBe(409);

    // Kapali kayit ACIK kuyruktan cikti.
    const openQueue = await request.get(
      `${API_BASE_URL}/fleet/fuel-reconciliations?reviewState=open`,
      { headers: accountingAuth },
    );
    const openRows = (await openQueue.json()).rows as Array<{ fuelEntryId: string }>;
    expect(openRows.some((row) => row.fuelEntryId === receiptId)).toBe(false);
  });

  test('muhasebe ekraninda telematik sekmesi, panel ve mobil yerlesim', async ({ page }, testInfo) => {
    await authenticate(page, fixture, 'accounting');

    // --- Masaustu ---
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/costs?tab=reconciliation');

    await expect(page.getByTestId('reconciliation-queue')).toBeVisible();
    // Rakam METIN olarak duruyor — bilgi yalnizca renkte degil.
    await expect(page.getByTestId('reconciliation-open-count')).toBeVisible();
    await expect(page.getByLabel(/filter|filtre/i).first()).toBeVisible();
    await testInfo.attach('reconciliation-queue-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // Fis cekmecesindeki panel — kapali incelemenin sonucu gorunuyor.
    await page.getByTestId('reconciliation-row').first().waitFor({ state: 'visible' });

    // --- Mobil ---
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByTestId('reconciliation-queue')).toBeVisible();
    await expect(page.getByTestId('reconciliation-open-count')).toBeVisible();

    // SAYFA YATAY KAYMAMALI: genis tablo kendi kutusunda kayar.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'sayfa 375 px genislikte yatay kayiyor').toBeLessThanOrEqual(1);

    await testInfo.attach('reconciliation-queue-mobile', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('kuyruktan acilan fis cekmecesinde telematik paneli gorunur', async ({ page }, testInfo) => {
    await authenticate(page, fixture, 'accounting');
    await page.setViewportSize({ width: 1280, height: 800 });
    // Kapali incelemeler de listelenebilsin diye "yalnizca acik" kaldiriliyor:
    // bu testin kaydi bir onceki testte kapatildi.
    await page.goto('/costs?tab=reconciliation');
    await page.getByTestId('reconciliation-queue').waitFor({ state: 'visible' });
    await page.getByLabel(/costs.fuelReconciliation.openOnly|Nur offene|Open only|Yalnızca/i)
      .first()
      .uncheck();

    const row = page.getByTestId('reconciliation-row').first();
    await row.waitFor({ state: 'visible' });
    // Ilgili FISE bag: ayni cekmece, icinde ayni panel.
    await row.getByRole('button').click();

    const panel = page.getByTestId('reconciliation-panel');
    await expect(panel).toBeVisible();
    // Kural METIN olarak duruyor; ham kod ekranda yok.
    await expect(page.getByTestId('reconciliation-evidence')).toBeVisible();
    await expect(panel).not.toContainText('receipt_exceeds_tank_capacity');

    await testInfo.attach('reconciliation-drawer-panel', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
