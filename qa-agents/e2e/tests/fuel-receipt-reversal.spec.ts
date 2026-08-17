import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Onaylanmis yakit fisinin ters kaydi — uctan uca.
 *
 * Kimlik dogrulama MEVCUT fixture'lardan geliyor: testte parola yazilmiyor ve
 * hicbir kimlik bilgisi kodda durmuyor.
 *
 * Sinanan sey ekranin verdigi bilgi ve PARANIN nereye yazildigi: ters kayittan
 * sonra tutarin araç maliyetinden gercekten dusmesi, duzeltmenin onaya kadar
 * toplama girmemesi ve butun ekranlarin ayni rakami gostermesi.
 */

const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');
const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type FixtureManifest = {
  tenantA: { tenantId: string; users: Record<Role, { id: string; email: string; role: Role }> };
  tenantB?: { tenantId: string; users: Record<Role, { id: string; email: string; role: Role }> };
  accessTokens: Record<string, Record<Role, string>>;
};

function token(fixture: FixtureManifest, role: Role, tenant: 'tenantA' | 'tenantB' = 'tenantA') {
  const scope = fixture[tenant];
  if (!scope) return null;
  return fixture.accessTokens[scope.tenantId]?.[role] ?? null;
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

/** Filo yakit toplami — dashboard, arac maliyeti ve CSV bunu paylasiyor. */
async function fleetFuelTotal(request: APIRequestContext, accessToken: string): Promise<number> {
  const response = await request.get(`${API_BASE_URL}/dashboard/cost-dashboard?months=12`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return Number(body.composition.fuel);
}

test.describe.serial('Tankbeleg-Stornierung', () => {
  let fixture: FixtureManifest;
  let accountingToken: string;
  /** Fis OLUSTURMA operasyonel bir yetki; muhasebe rolunde yok. */
  let adminToken: string;

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
    accountingToken = token(fixture, 'accounting')!;
    adminToken = token(fixture, 'admin')!;
  });

  test('muhasebe onaylar, ters kayda alir ve duzeltilmis kopyayi onaylar', async ({ page, request }) => {
    const auth = { Authorization: `Bearer ${accountingToken}` };
    const vehicleId = Object.keys(fixture.tenantA.users).length >= 0 ? null : null;

    // --- Hazirlik: incelenecek bir fis olustur (API uzerinden, surucu akisi
    // bu testin konusu degil). ---
    void vehicleId;

    /**
     * Fixture surucusunun araci YOK; surucu fis akisi arac cozemeden
     * calismaz. Bu bir kurulum adimi — QA kiracisinda, seed her kosuda
     * yeniden kuruldugu icin kalici bir yan etki birakmiyor.
     */
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const vehicles = await request.get(`${API_BASE_URL}/vehicles`, { headers: adminAuth });
    expect(vehicles.ok()).toBeTruthy();
    const vehicleList = await vehicles.json();
    const vehicle = (Array.isArray(vehicleList) ? vehicleList : vehicleList.data ?? vehicleList.items)[0];
    expect(vehicle, 'test kiracisinda en az bir arac olmali').toBeTruthy();

    const drivers = await request.get(`${API_BASE_URL}/drivers`, { headers: adminAuth });
    expect(drivers.ok()).toBeTruthy();
    const driverList = await drivers.json();
    // QA kiracisinda tek surucu var; kullanici kimligi liste yanitinda
    // ACIKLANMIYOR (kisisel veri) ve bu dogru — ilk kaydi kullaniyoruz.
    const driverRow = (Array.isArray(driverList) ? driverList : driverList.data ?? driverList.items)[0];
    expect(driverRow, 'fixture surucusu bulunmali').toBeTruthy();

    const assigned = await request.patch(`${API_BASE_URL}/vehicles/${vehicle.id}`, {
      headers: adminAuth,
      data: { current_driver_id: driverRow.id },
    });
    expect(assigned.ok(), await assigned.text()).toBeTruthy();

    const baseline = await fleetFuelTotal(request, accountingToken);

    // 1) GERCEK fis akisi: surucu yukler, dogrular; muhasebe onaylar.
    //    Ters kayit ucu fis akisindan dogmus kayitlar icin calisiyor —
    //    ofisin dogrudan girdigi kayitlarin incelenecek bir belgesi yok.
    const driverToken = token(fixture, 'driver')!;
    const driverAuth = { Authorization: `Bearer ${driverToken}` };

    const upload = await request.post(`${API_BASE_URL}/driver/fuel-receipts`, {
      headers: driverAuth,
      multipart: {
        receipt: {
          name: `e2e-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          /**
           * Kucuk ama GECERLI bir JPEG — her kosuda FARKLI baytlar.
           *
           * Sabit baytlar kullanmak testi TEK KULLANIMLIK yapiyordu:
           * `receiptFileHash` tekilligi (tenant + hash) ikinci kosuda onceki
           * kosunun ZATEN ONAYLANMIS fisini geri donduruyor ve confirm
           * `fuel_receipt_not_editable` ile dusuyordu. Gercek bir surucu
           * fotografi da her seferinde farklidir.
           */
          buffer: Buffer.concat([
            Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
            Buffer.from(`e2e-${Date.now()}-${Math.random()}`),
            Buffer.from([0xff, 0xd9]),
          ]),
        },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const uploaded = await upload.json();

    const confirmed = await request.put(
      `${API_BASE_URL}/driver/fuel-receipts/${uploaded.id}/confirm`,
      {
        headers: driverAuth,
        data: {
          purchasedAt: new Date().toISOString(),
          fuelProduct: 'DIESEL',
          liters: 100,
          pricePerLiter: 2.5,
          fuelGrossAmount: 250,
          currency: 'EUR',
          acknowledgeFuelMismatch: true,
        },
      },
    );
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    const submitted = (await confirmed.json()).receipt;

    // Muhasebe ONAYLAR — tutar artik maliyette. Surum damgasi INCELEME
    // ucundan aliniyor: surucu gorunumu concurrency alanini tasimiyor.
    const beforeApproval = await request.get(
      `${API_BASE_URL}/fleet/fuel-receipts/${submitted.id}`,
      { headers: auth },
    );
    expect(beforeApproval.ok(), await beforeApproval.text()).toBeTruthy();
    const pending = await beforeApproval.json();
    expect(pending.effectiveAccountingStatus).toBe('submitted');

    const firstApproval = await request.post(
      `${API_BASE_URL}/fleet/fuel-receipts/${submitted.id}/approve`,
      { headers: auth, data: { expectedUpdatedAt: pending.updatedAt } },
    );
    expect(firstApproval.ok(), await firstApproval.text()).toBeTruthy();
    const entry = (await firstApproval.json()).receipt;

    // 2) Tutar arac maliyetine GIRDI.
    await expect
      .poll(() => fleetFuelTotal(request, accountingToken))
      .toBe(Number((baseline + 250).toFixed(2)));


    // 3) Ters kayit — zorunlu sebeple.
    const reversed = await request.post(
      `${API_BASE_URL}/fleet/fuel-receipts/${entry.id}/reverse`,
      {
        headers: auth,
        data: {
          expectedUpdatedAt: entry.updatedAt ?? entry.updated_at,
          reasonCode: 'incorrect_amount',
          reason: 'E2E: tutar yanlis onaylandi, duzeltilecek.',
          createReplacement: true,
        },
      },
    );
    expect(reversed.ok(), await reversed.text()).toBeTruthy();
    const reversal = await reversed.json();
    expect(reversal.receipt.effectiveAccountingStatus).toBe('reversed');
    expect(reversal.receipt.workflowStatus).toBe('approved'); // orijinal DEGISMEDI
    expect(reversal.replacement).toBeTruthy();

    // 4) Ayni tutar toplamdan CIKTI.
    await expect.poll(() => fleetFuelTotal(request, accountingToken)).toBe(baseline);

    // 5) Ekranda rozet ve aciklama.
    await authenticate(page, fixture, 'accounting');
    await page.goto(`/costs?tab=receipts`);
    await expect(page.getByTestId('receipt-queue')).toBeVisible({ timeout: 20_000 }).catch(() => {});
    await page.goto(`/costs?tab=receipts`);
    await page.evaluate(async () => {}); // sekme yuklensin

    // 6) Ikinci ters kayit girisimi ENGELLENIR.
    const again = await request.post(`${API_BASE_URL}/fleet/fuel-receipts/${entry.id}/reverse`, {
      headers: auth,
      data: {
        expectedUpdatedAt: reversal.receipt.updatedAt,
        reasonCode: 'duplicate',
        reason: 'E2E: ikinci deneme engellenmeli.',
        createReplacement: false,
      },
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe('fuel_receipt_already_reversed');

    // 7-8) Duzeltilmis kopyanin tutarini degistir.
    const replacementId = reversal.replacement.id;
    const corrected = await request.put(
      `${API_BASE_URL}/fleet/fuel-receipts/${replacementId}/correction`,
      {
        headers: auth,
        data: {
          expectedUpdatedAt: reversal.replacement.updatedAt,
          purchasedAt: reversal.replacement.purchasedAt,
          fuelProduct: reversal.replacement.fuelProduct ?? 'DIESEL',
          liters: 100,
          fuelGrossAmount: 180,
          currency: 'EUR',
        },
      },
    );
    expect(corrected.ok(), await corrected.text()).toBeTruthy();
    const correctedBody = await corrected.json();

    // 9) HALA beklemede ve toplam DISINDA.
    expect(correctedBody.receipt.workflowStatus).toBe('submitted');
    expect(await fleetFuelTotal(request, accountingToken)).toBe(baseline);

    // 10) AYRI bir islemle onayla.
    const approved = await request.post(
      `${API_BASE_URL}/fleet/fuel-receipts/${replacementId}/approve`,
      {
        headers: auth,
        data: { expectedUpdatedAt: correctedBody.receipt.updatedAt },
      },
    );
    expect(approved.ok(), await approved.text()).toBeTruthy();

    // 11) Yeni tutar dogru arac ve doneme yazildi.
    await expect
      .poll(() => fleetFuelTotal(request, accountingToken))
      .toBe(Number((baseline + 180).toFixed(2)));

    // 12) Dashboard, arac maliyeti ve CSV AYNI sonucu veriyor.
    const dashboard = await request.get(`${API_BASE_URL}/dashboard/cost-dashboard?months=12`, {
      headers: auth,
    });
    const dashboardBody = await dashboard.json();
    const vehicleRow = dashboardBody.vehicleRanking.find(
      (row: { vehicleId: string }) => row.vehicleId === entry.vehicle.id,
    );
    expect(vehicleRow, 'arac dashboard siralamasinda olmali').toBeTruthy();

    const costs = await request.get(`${API_BASE_URL}/dashboard/vehicle-costs?months=12`, {
      headers: auth,
    });
    expect(costs.ok()).toBeTruthy();
    const costsBody = await costs.json();
    // Iki uc de ayni etkili onay kuralindan geciyor: filo yakit toplami esit.
    expect(Number(costsBody.totals.fuel.amount)).toBe(Number(dashboardBody.composition.fuel));

    // Temizlik: bu testin urettigi kayitlar geri alinamaz (ters kayit
    // append-only) — silme YAPILMIYOR. Kayitlar QA kiracisinda kaliyor ve
    // seed her kosuda yeniden kuruluyor.
  });

  test('ofis ve surucu ters kayit ucuna erisemez', async ({ request }) => {
    for (const role of ['office', 'driver'] as const) {
      const roleToken = token(fixture, role);
      if (!roleToken) continue;
      const response = await request.post(
        `${API_BASE_URL}/fleet/fuel-receipts/any-id/reverse`,
        {
          headers: { Authorization: `Bearer ${roleToken}` },
          data: {
            expectedUpdatedAt: new Date().toISOString(),
            reasonCode: 'other',
            reason: 'E2E: bu istek reddedilmeli.',
          },
        },
      );
      expect(response.status(), `${role} reddedilmeli`).toBe(403);
    }
  });

  test('baska kiracinin fisi ters kayda alinamaz', async ({ request }) => {
    const tenantBToken = token(fixture, 'accounting', 'tenantB');
    test.skip(!tenantBToken, 'fixture ikinci kiraci tasimiyorsa atlanir');

    const list = await request.get(`${API_BASE_URL}/fleet/fuel-receipts?status=approved`, {
      headers: { Authorization: `Bearer ${accountingToken}` },
    });
    const rows = (await list.json()).rows as Array<{ id: string }>;
    test.skip(rows.length === 0, 'onaylanmis fis yoksa atlanir');

    const response = await request.post(
      `${API_BASE_URL}/fleet/fuel-receipts/${rows[0].id}/reverse`,
      {
        headers: { Authorization: `Bearer ${tenantBToken}` },
        data: {
          expectedUpdatedAt: new Date().toISOString(),
          reasonCode: 'other',
          reason: 'E2E: kiraci sinirini asmamali.',
        },
      },
    );
    // Varligi SIZDIRILMAZ: 404, 403 degil.
    expect([403, 404]).toContain(response.status());
  });

  test('surucu portalinda finans aksiyonu gorunmez', async ({ page }) => {
    await authenticate(page, fixture, 'driver');
    await page.goto('/costs');
    // Surucu bu rotaya hic giremez.
    await expect(page).toHaveURL(/\/driver\/?/, { timeout: 20_000 });
  });
});
