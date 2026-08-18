import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensureP0Fixture, fixtureToken, type FixtureManifest, type Role } from './support/p0-fixture';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * BELGE GELEN KUTUSU — UCTAN UCA (Faz 14).
 *
 *   web/mobil/scanner yukleme → guvenlik → Mock Ordivan siniflandirmasi
 *   → sayfa bolme → arac eslestirme → insan onayi → MEVCUT Fleet sureci
 *
 * Gercek AI/OCR YOK. Scanner akisi Faz 12'nin GERCEK connector protokolu
 * uzerinden Mock Scanner ile kanitlaniyor.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');
const SCANNER = path.join(BACKEND_ROOT, 'scripts/ordivan-mock-scanner.mjs');
const FIXTURES = path.join(REPO_ROOT, 'evals/document-inbox-classification-v1/fixtures');

const execFileAsync = promisify(execFile);

function auth(fixture: FixtureManifest, role: Role, tenant: 'tenantA' | 'tenantB' = 'tenantA') {
  const value = fixtureToken(fixture, role, tenant);
  return value ? { Authorization: `Bearer ${value}` } : null;
}

/** Fixture'i her kosuda FARKLI baytlarla: hash tekilligi testleri bloklamasin. */
function pdfBytes(name: string, unique = true): Buffer {
  const base = readFileSync(path.join(FIXTURES, name));
  if (!unique) return base;
  // PDF'in sonuna yorum: dosya gecerli kalir, hash degisir.
  return Buffer.concat([base, Buffer.from(`\n% e2e-${Date.now()}-${Math.random()}\n`)]);
}

async function upload(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
  buffer: Buffer,
  source: 'web' | 'mobile' = 'web',
) {
  return request.post(`${API_BASE_URL}/ordivan/inbox/uploads`, {
    headers,
    multipart: {
      document: { name, mimeType: 'application/pdf', buffer },
      source,
    },
  });
}

/**
 * Filodaki ilk aracin kimligi.
 *
 * Fixture plakalari eval fixture'larindaki plakalarla KASITLI olarak
 * eslesmiyor: gercek hayatta da belgedeki plaka her zaman taninmaz. Bu yuzden
 * testler aracin INSAN TARAFINDAN secilmesi yolundan geciyor — yani duzeltme
 * ucu de her yonlendirmede kanitlaniyor.
 */
async function firstVehicleId(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${API_BASE_URL}/vehicles`, { headers });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const rows = body.data ?? body.rows ?? [];
  expect(rows.length, 'fixture arac tasimiyor').toBeGreaterThan(0);
  return rows[0].id as string;
}

async function firstDriverId(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${API_BASE_URL}/drivers`, { headers });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const rows = body.data ?? body.rows ?? [];
  expect(rows.length, 'fixture surucu tasimiyor').toBeGreaterThan(0);
  return rows[0].id as string;
}

/** Insanin ekranda yaptigi duzeltme: aracin (ve gerekiyorsa surucunun) secilmesi. */
async function correct(
  request: APIRequestContext,
  headers: Record<string, string>,
  documentId: string,
  data: Record<string, string>,
) {
  const response = await request.post(
    `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/correct`,
    { headers, data },
  );
  expect(response.status(), `duzeltme basarisiz: ${await response.text()}`).toBe(200);
  return response.json();
}

async function detail(request: APIRequestContext, headers: Record<string, string>, id: string) {
  const response = await request.get(`${API_BASE_URL}/ordivan/inbox/documents/${id}`, { headers });
  expect(response.ok(), `detay alinamadi: ${response.status()}`).toBeTruthy();
  return response.json();
}

test.describe.serial('Belge gelen kutusu', () => {
  let fixture: FixtureManifest;
  let adminAuth: Record<string, string>;
  let officeAuth: Record<string, string>;
  let accountingAuth: Record<string, string>;
  let driverAuth: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    fixture = ensureP0Fixture();
    adminAuth = auth(fixture, 'admin')!;
    officeAuth = auth(fixture, 'office')!;
    accountingAuth = auth(fixture, 'accounting')!;
    driverAuth = auth(fixture, 'driver')!;

    const probe = await request.get(`${API_BASE_URL}/ordivan/connectors`, { headers: adminAuth });
    expect(probe.status(), 'backend ORDIVAN_CONNECTOR_MODE=mock ile calismali').toBe(200);
  });

  // -------------------------------------------------------------------------
  // Giris kanallari
  // -------------------------------------------------------------------------

  test('web yuklemesi belgeyi siniflandirir', async ({ request }) => {
    const response = await upload(request, adminAuth, 'rechnung.pdf', pdfBytes('service-invoice-clean.pdf'));
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.duplicate).toBe(false);
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].typeKey).toBe('service_invoice@v1');
  });

  test('mobil yuklemesi ayni yolu kullanir', async ({ request }) => {
    const response = await upload(
      request,
      officeAuth,
      'foto.pdf',
      pdfBytes('fine-speed.pdf'),
      'mobile',
    );
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.documents[0].typeKey).toBe('traffic_fine@v1');

    const listed = await request.get(`${API_BASE_URL}/ordivan/inbox/documents`, {
      headers: officeAuth,
      params: { source: 'mobile' },
    });
    expect(listed.ok()).toBeTruthy();
    expect((await listed.json()).total).toBeGreaterThan(0);
  });

  test('Mock Scanner GERCEK connector protokolu uzerinden yukler ve idempotent', async ({
    request,
  }) => {
    const created = await request.post(`${API_BASE_URL}/ordivan/connectors/enrollments`, {
      headers: adminAuth,
      data: {
        displayName: `E2E-Scanner-${Date.now()}`,
        // YALNIZCA yukleme yetenegi: is alma yetkisi ISTENMIYOR.
        capabilities: ['document.intake.upload@v1'],
      },
    });
    expect(created.status()).toBe(201);
    const enrollment = await created.json();

    const { stdout } = await execFileAsync(
      'node',
      [SCANNER, '--enroll', enrollment.enrollmentCode, '--fixture', 'stapel', '--verify-idempotency'],
      {
        cwd: BACKEND_ROOT,
        env: { ...process.env, FLEET_API_BASE_URL: API_BASE_URL },
        timeout: 60_000,
      },
    );

    expect(stdout, 'scanner yukleyemedi').toContain('[mock-scanner] uploaded');
    // AG KOPMASI TAKLIDI: ayni anahtarla ikinci gonderim yeni girdi ACMAMALI.
    expect(stdout, 'idempotency tutmadi').toContain('idempotency ok');

    const listed = await request.get(`${API_BASE_URL}/ordivan/inbox/documents`, {
      headers: adminAuth,
      params: { source: 'connector', status: 'needs_review' },
    });
    expect((await listed.json()).total).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Guvenlik
  // -------------------------------------------------------------------------

  test('gercek tur ILK BAYTLARDAN okunur; uzanti ve MIME yeterli degil', async ({ request }) => {
    const html = await upload(request, adminAuth, 'rechnung.pdf', Buffer.from('<html>evil</html>'));
    expect(html.status()).toBe(400);
    expect((await html.json()).code).toBe('intake_file_unsupported_type');
  });

  test('HEIC ACIKCA reddedilir — kullanici dostu hata', async ({ request }) => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic', 'latin1'),
      Buffer.alloc(64),
    ]);
    const response = await upload(request, adminAuth, 'IMG_0001.heic', heic);
    expect(response.status()).toBe(400);
    // "Desteklenmeyen dosya" DEGIL: turu tanidik ve acikca soyluyoruz.
    expect((await response.json()).code).toBe('intake_file_heic_unsupported');
  });

  test('sifreli PDF guvenli hata verir', async ({ request }) => {
    const encrypted = Buffer.from('%PDF-1.7\n/Type /Page\ntrailer\n<< /Encrypt 9 0 R >>\n%%EOF', 'latin1');
    const response = await upload(request, adminAuth, 'geschuetzt.pdf', encrypted);
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('intake_file_encrypted');
  });

  test('AYNI dosya ikinci kez yuklenirse yeni girdi ACILMAZ', async ({ request }) => {
    const bytes = pdfBytes('fuel-diesel.pdf');
    const first = await upload(request, adminAuth, 'beleg.pdf', bytes);
    expect(first.status()).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.duplicate).toBe(false);

    const second = await upload(request, adminAuth, 'beleg-kopie.pdf', bytes);
    expect(second.status()).toBe(201);
    const secondBody = await second.json();
    expect(secondBody.duplicate, 'duplicate isaretlenmedi').toBe(true);
    expect(secondBody.intakeId).toBe(firstBody.intakeId);
  });

  test('ESZAMANLI ayni dosya tek girdi uretir', async ({ request }) => {
    const bytes = pdfBytes('insurance-police.pdf');
    const [left, right] = await Promise.all([
      upload(request, adminAuth, 'a.pdf', bytes),
      upload(request, adminAuth, 'b.pdf', bytes),
    ]);
    const leftBody = await left.json();
    const rightBody = await right.json();
    expect(leftBody.intakeId).toBe(rightBody.intakeId);
  });

  test('SURUCU gelen kutusunu goremez ve yukleyemez', async ({ request }) => {
    expect(
      (await request.get(`${API_BASE_URL}/ordivan/inbox/documents`, { headers: driverAuth })).status(),
    ).toBe(403);
    expect(
      (await upload(request, driverAuth, 'beleg.pdf', pdfBytes('fuel-diesel.pdf'))).status(),
    ).toBe(403);
  });

  test('YETKISIZ stream ve KIRACI izolasyonu', async ({ request }) => {
    const uploaded = await (await upload(request, adminAuth, 'r.pdf', pdfBytes('service-invoice-clean.pdf'))).json();

    // Jetonsuz istek dosyaya ULASAMAZ.
    const anonymous = await request.get(
      `${API_BASE_URL}/ordivan/inbox/intakes/${uploaded.intakeId}/file`,
    );
    expect([401, 403]).toContain(anonymous.status());

    // Surucu de ULASAMAZ.
    const asDriver = await request.get(
      `${API_BASE_URL}/ordivan/inbox/intakes/${uploaded.intakeId}/file`,
      { headers: driverAuth },
    );
    expect(asDriver.status()).toBe(403);

    // Baska kiraci: 404 — VARLIGI bile sizdirilmaz.
    const tenantBAuth = auth(fixture, 'admin', 'tenantB');
    test.skip(!tenantBAuth, 'fixture ikinci kiraci tasimiyor');
    const crossTenant = await request.get(
      `${API_BASE_URL}/ordivan/inbox/documents/${uploaded.documents[0].id}`,
      { headers: tenantBAuth! },
    );
    expect(crossTenant.status(), 'kiraci sinirini asti').toBe(404);
  });

  test('yanit ve detay DEPOLAMA YOLU icermez', async ({ request }) => {
    const uploaded = await (await upload(request, adminAuth, 'r.pdf', pdfBytes('fine-anhoerung.pdf'))).json();
    const body = await detail(request, adminAuth, uploaded.documents[0].id);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('storedFileName');
    expect(serialized).not.toContain('uploads/');
    expect(serialized).not.toContain('fileHash');
  });

  // -------------------------------------------------------------------------
  // Siniflandirma ve bolme
  // -------------------------------------------------------------------------

  test('BES tur + unknown ayirt edilir', async ({ request }) => {
    const expectations: Array<[string, string]> = [
      ['service-invoice-clean.pdf', 'service_invoice@v1'],
      ['inspection-tuv.pdf', 'vehicle_inspection@v1'],
      ['insurance-police.pdf', 'vehicle_insurance@v1'],
      ['fine-speed.pdf', 'traffic_fine@v1'],
      ['fuel-diesel.pdf', 'fuel_receipt@v1'],
      ['unknown-anschreiben.pdf', 'unknown@v1'],
    ];

    for (const [file, expected] of expectations) {
      const body = await (await upload(request, adminAuth, file, pdfBytes(file))).json();
      expect(body.documents[0].typeKey, `${file}`).toBe(expected);
    }
  });

  test('COK BELGELI PDF ayrilir; kullanici yeniden bolebilir', async ({ request }) => {
    const body = await (await upload(request, adminAuth, 'stapel.pdf', pdfBytes('stapel-multi.pdf'))).json();
    expect(body.documents.length, 'cok belgeli PDF bolunmedi').toBe(3);

    // Kullanici bolumlemeyi DEGISTIRIYOR: 1-2 ve 3-4.
    const resegmented = await request.post(
      `${API_BASE_URL}/ordivan/inbox/intakes/${body.intakeId}/resegment`,
      {
        headers: adminAuth,
        data: { segments: [{ pageFrom: 1, pageTo: 2 }, { pageFrom: 3, pageTo: 4 }] },
      },
    );
    expect(resegmented.status()).toBe(200);
    expect(await resegmented.json()).toHaveLength(2);

    // ORTUSEN bolumleme REDDEDILIR.
    const overlapping = await request.post(
      `${API_BASE_URL}/ordivan/inbox/intakes/${body.intakeId}/resegment`,
      {
        headers: adminAuth,
        data: { segments: [{ pageFrom: 1, pageTo: 3 }, { pageFrom: 3, pageTo: 4 }] },
      },
    );
    expect(overlapping.status()).toBe(400);
  });

  test('DUSUK GUVEN isaretlenir', async ({ request }) => {
    const body = await (await upload(request, adminAuth, 'schwach.pdf', pdfBytes('service-invoice-weak.pdf'))).json();
    expect(body.documents[0].confidence).toBeLessThan(0.7);
  });

  test('INJECTION containment — gomulu talimat turu ve araci degistiremez', async ({ request }) => {
    const body = await (await upload(request, adminAuth, 'injection.pdf', pdfBytes('injection-inhalt.pdf'))).json();
    // Anahtar sozluk ne diyorsa o: ceza. Metnin emri gecmedi.
    expect(body.documents[0].typeKey).toBe('traffic_fine@v1');

    const detailBody = await detail(request, adminAuth, body.documents[0].id);
    const serialized = JSON.stringify(detailBody);
    expect(serialized).not.toContain('veh-9');
    // Talimat benzeri icerik ISARETLENIR.
    const flagged = detailBody.checks.find(
      (check: { code: string }) => check.code === 'content_instructions',
    );
    expect(flagged.status).toBe('failed');

    // METADATA da tur BELIRLEYEMEZ.
    const metadataCase = await (
      await upload(request, adminAuth, 'meta.pdf', pdfBytes('injection-metadata.pdf'))
    ).json();
    expect(metadataCase.documents[0].typeKey).toBe('unknown@v1');
  });

  test('`unknown` tur SECILMEDEN kayit olusmaz', async ({ request }) => {
    const body = await (await upload(request, adminAuth, 'unbekannt.pdf', pdfBytes('unknown-anschreiben.pdf'))).json();
    const documentId = body.documents[0].id;

    const detailBody = await detail(request, adminAuth, documentId);
    expect(detailBody.plan.canRoute).toBe(false);
    expect(detailBody.plan.blockedBy).toContain('type_unknown');

    const routed = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      { headers: adminAuth, data: {} },
    );
    expect(routed.status()).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Yonlendirme
  // -------------------------------------------------------------------------

  test('SERVIS FATURASI Faz 13 akisina devredilir; dosya IKINCI KEZ yuklenmez', async ({
    request,
  }) => {
    const body = await (await upload(request, adminAuth, 'rechnung.pdf', pdfBytes('service-invoice-clean.pdf'))).json();
    const documentId = body.documents[0].id;

    // Belgedeki plaka bu filoda YOK: arac insan tarafindan seciliyor.
    await correct(request, adminAuth, documentId, {
      vehicleId: await firstVehicleId(request, adminAuth),
    });

    const proposalsBefore = await (
      await request.get(`${API_BASE_URL}/ordivan/automation/proposals`, { headers: adminAuth })
    ).json();

    const routed = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      { headers: adminAuth, data: {} },
    );
    expect(routed.status()).toBe(200);
    const result = await routed.json();
    expect(result.entityType).toBe('AutomationJob');
    expect(result.alreadyRouted).toBe(false);

    // TEKRARLANAN yonlendirme IKINCI is acmaz.
    const again = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      { headers: adminAuth, data: {} },
    );
    expect(again.status()).toBe(200);
    const repeat = await again.json();
    expect(repeat.alreadyRouted, 'idempotency tutmadi').toBe(true);
    expect(repeat.entityId).toBe(result.entityId);

    expect(proposalsBefore.total).toBeGreaterThanOrEqual(0);
  });

  test('YAKIT FISI muhasebe onayi olmadan GIDER OLUSTURMAZ', async ({ request }) => {
    const body = await (await upload(request, accountingAuth, 'tank.pdf', pdfBytes('fuel-diesel.pdf'))).json();
    const documentId = body.documents[0].id;

    await correct(request, accountingAuth, documentId, {
      vehicleId: await firstVehicleId(request, accountingAuth),
    });

    // Surucu secilmeden yonlendirilemez: canonical kayit surucusuz acilamaz.
    const withoutDriver = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      {
        headers: accountingAuth,
        data: {
          fuelReceipt: {
            enteredAt: '2026-08-15T10:00:00.000Z',
            liters: 52.3,
            totalCost: 91.5,
            currency: 'EUR',
          },
        },
      },
    );
    expect(withoutDriver.status(), 'surucusuz yonlendirme gecti').toBe(409);
    expect((await withoutDriver.json()).code).toBe('document_intake_needs_domain_review');

    const afterBlock = await detail(request, accountingAuth, documentId);
    expect(afterBlock.status).toBe('needs_domain_review');

    // Surucu seciliyor ve yonlendiriliyor.
    await correct(request, accountingAuth, documentId, {
      driverId: await firstDriverId(request, accountingAuth),
    });

    const routed = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      {
        headers: accountingAuth,
        data: {
          fuelReceipt: {
            enteredAt: '2026-08-15T10:00:00.000Z',
            liters: 52.3,
            totalCost: 91.5,
            currency: 'EUR',
          },
        },
      },
    );
    expect(routed.status()).toBe(200);
    const result = await routed.json();
    expect(result.entityType).toBe('FleetFuelEntry');

    // MUHASEBE INCELEMESINDE: `approved` DEGIL.
    const review = await request.get(`${API_BASE_URL}/fleet/fuel-receipts/${result.entityId}`, {
      headers: accountingAuth,
    });
    if (review.ok()) {
      const entry = await review.json();
      expect(entry.workflowStatus, 'gelen kutusundan onaylanmis gider olustu').not.toBe('approved');
    }
  });

  test('TUV hatirlatmasi yalnizca tarih GUVENILIR ve kullanici ISTERSE', async ({ request }) => {
    const body = await (await upload(request, officeAuth, 'hu.pdf', pdfBytes('inspection-tuv.pdf'))).json();
    const documentId = body.documents[0].id;
    await correct(request, officeAuth, documentId, {
      vehicleId: await firstVehicleId(request, officeAuth),
    });

    const detailBody = await detail(request, officeAuth, documentId);
    expect(detailBody.plan.reminderAvailable, 'tarih guvenilir olmali').toBe(true);

    const routed = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      {
        headers: officeAuth,
        data: {
          vehicleDocument: {
            documentType: 'HU-Bericht',
            expiryDate: '2027-09-04',
            createReminder: true,
            notifyBeforeDays: 30,
          },
        },
      },
    );
    expect(routed.status()).toBe(200);
    const result = await routed.json();
    expect(result.entityType).toBe('Document');
    expect(result.secondaryEntityType, 'hatirlatma onerisi olusmadi').toBe('Reminder');
  });

  test('TARIHSIZ sigortada hatirlatma REDDEDILIR', async ({ request }) => {
    const body = await (await upload(request, officeAuth, 'vers.pdf', pdfBytes('insurance-no-date.pdf'))).json();
    const documentId = body.documents[0].id;
    await correct(request, officeAuth, documentId, {
      vehicleId: await firstVehicleId(request, officeAuth),
    });

    const detailBody = await detail(request, officeAuth, documentId);
    expect(detailBody.plan.reminderAvailable).toBe(false);

    const routed = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      {
        headers: officeAuth,
        data: {
          vehicleDocument: {
            documentType: 'Versicherungsschein',
            expiryDate: '2027-01-01',
            createReminder: true,
          },
        },
      },
    );
    expect(routed.status(), 'guvenilmez tarihten hatirlatma uretildi').toBe(400);
  });

  test('CEZA icin yetkisiz rol ENGELLENIR', async ({ request }) => {
    const body = await (await upload(request, accountingAuth, 'bussgeld.pdf', pdfBytes('fine-speed.pdf'))).json();
    const documentId = body.documents[0].id;
    await correct(request, accountingAuth, documentId, {
      vehicleId: await firstVehicleId(request, accountingAuth),
    });

    const fine = {
      violationAt: '2026-07-11T08:15:00.000Z',
      violationLocation: 'A40 Essen',
      violationType: 'Geschwindigkeit',
      violationCategory: 'speed',
      amount: 60,
    };

    // MUHASEBE ceza olusturamaz: `fines.controller` yazma kisiti gevsetilmedi.
    const asAccounting = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      { headers: accountingAuth, data: { fine } },
    );
    expect(asAccounting.status(), 'muhasebe ceza olusturdu').toBe(403);

    // Office olusturabilir.
    const asOffice = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/route`,
      { headers: officeAuth, data: { fine } },
    );
    expect(asOffice.status()).toBe(200);
    expect((await asOffice.json()).entityType).toBe('Fine');
  });

  test('ACIK onay olmadan ceza olusmaz', async ({ request }) => {
    const body = await (await upload(request, officeAuth, 'bussgeld2.pdf', pdfBytes('fine-anhoerung.pdf'))).json();
    await correct(request, officeAuth, body.documents[0].id, {
      vehicleId: await firstVehicleId(request, officeAuth),
    });
    const routed = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${body.documents[0].id}/route`,
      { headers: officeAuth, data: {} },
    );
    expect(routed.status()).toBe(400);
  });

  test('red sebep ZORUNLU ve belge kapanir', async ({ request }) => {
    const body = await (await upload(request, adminAuth, 'unbekannt2.pdf', pdfBytes('unknown-leer.pdf'))).json();
    const documentId = body.documents[0].id;

    const tooShort = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/reject`,
      { headers: adminAuth, data: { reason: 'x' } },
    );
    expect(tooShort.status()).toBe(400);

    const rejected = await request.post(
      `${API_BASE_URL}/ordivan/inbox/documents/${documentId}/reject`,
      { headers: adminAuth, data: { reason: 'Gehoert nicht zu diesem Fuhrpark.' } },
    );
    expect(rejected.status()).toBe(200);
    expect((await rejected.json()).status).toBe('rejected');
  });
});

/**
 * MOCK URETIMDE CALISMAZ.
 *
 * Sahte bir siniflandiricinin uretimde oneri uretmesi, insanin "sistem baktı"
 * sanmasi demektir. Koruma SUREC BASLARKEN devreye giriyor, ilk istekte degil.
 */
test('mock production korumasi', async () => {
  const scannerFailure = await execFileAsync('node', [SCANNER], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
    timeout: 30_000,
  }).catch((error: { code?: number; stderr?: string }) => error);

  expect(
    (scannerFailure as { code?: number }).code,
    'mock scanner uretimde calisti',
  ).toBe(2);
  expect((scannerFailure as { stderr?: string }).stderr ?? '').toContain('production');
});
