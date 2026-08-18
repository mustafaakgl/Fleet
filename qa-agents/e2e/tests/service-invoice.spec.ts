import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensureP0Fixture, type FixtureManifest, type Role } from './support/p0-fixture';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Servis faturasi dikey dilimi — uctan uca (Faz 13).
 *
 *   PDF yukleme → hash/duplicate → Mock Ordivan extraction → arac eslestirme
 *   → inceleme/duzeltme → onay → ServiceRecord → arac maliyeti
 *
 * Gercek AI/OCR YOK: Faz 12'nin gercek connector protokolu ve deterministik
 * Mock Worker kullaniliyor.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');
const WORKER = path.join(BACKEND_ROOT, 'scripts/ordivan-mock-worker.mjs');
const FIXTURES = path.join(REPO_ROOT, 'evals/service-invoice-v1/fixtures');

const execFileAsync = promisify(execFile);

function token(fixture: FixtureManifest, role: Role) {
  return fixture.accessTokens[fixture.tenantA.tenantId]?.[role] ?? null;
}

async function authenticate(page: Page, fixture: FixtureManifest, role: Role) {
  const accessToken = token(fixture, role)!;
  const user = { ...fixture.tenantA.users[role], name: fixture.tenantA.users[role].email };
  await page.addInitScript(
    ({ accessToken: value, authUser }) => {
      localStorage.setItem('accessToken', value);
      localStorage.setItem('fleet_access_token', value);
      localStorage.setItem('user', JSON.stringify(authUser));
      localStorage.setItem('fleet_user', JSON.stringify(authUser));
      sessionStorage.removeItem('fleet_skip_auto_login');
    },
    { accessToken, authUser: user },
  );
}

/** Fixture PDF'i her kosuda FARKLI baytlarla: hash tekilligi testi bloklamasin. */
function pdfBytes(name: string, unique = true): Buffer {
  const base = readFileSync(path.join(FIXTURES, name));
  if (!unique) return base;
  // PDF'in sonuna yorum satiri ekliyoruz: dosya gecerli kalir, hash degisir.
  return Buffer.concat([base, Buffer.from(`\n% e2e-${Date.now()}-${Math.random()}\n`)]);
}

async function runWorker(credential: string) {
  try {
    const { stdout } = await execFileAsync('node', [WORKER, '--once'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, FLEET_API_BASE_URL: API_BASE_URL, ORDIVAN_CREDENTIAL: credential },
      timeout: 60_000,
    });
    return stdout;
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? '';
  }
}

/**
 * BELIRLI is tamamlanana kadar worker'i calistirir.
 *
 * Kuyrukta onceki testlerden kalan isler olabilir ve worker EN ESKI isi alir.
 * "Bir is tamamlandi" demek, "BENIM isim tamamlandi" demek degildir.
 */
async function runWorkerUntilJob(credential: string, jobId: string): Promise<string> {
  let combined = '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const output = await runWorker(credential);
    combined += output;
    if (output.includes(`completed job=${jobId}`)) return combined;
    if (output.includes('no job available')) break;
  }
  return combined;
}

async function uploadInvoice(
  request: APIRequestContext,
  auth: Record<string, string>,
  name: string,
  buffer: Buffer,
) {
  return request.post(`${API_BASE_URL}/ordivan/automation/documents/service-invoice`, {
    headers: auth,
    multipart: {
      document: { name, mimeType: 'application/pdf', buffer },
    },
  });
}

async function fleetServiceTotal(request: APIRequestContext, auth: Record<string, string>) {
  const response = await request.get(`${API_BASE_URL}/dashboard/cost-dashboard?months=12`, {
    headers: auth,
  });
  expect(response.ok()).toBeTruthy();
  return Number((await response.json()).composition.service);
}

test.describe.serial('Servis faturasi dikey dilimi', () => {
  let fixture: FixtureManifest;
  let adminAuth: Record<string, string>;
  let driverAuth: Record<string, string>;
  let credential: string;

  test.beforeAll(async ({ request }) => {
    fixture = ensureP0Fixture();
    adminAuth = { Authorization: `Bearer ${token(fixture, 'admin')}` };
    driverAuth = { Authorization: `Bearer ${token(fixture, 'driver')}` };

    const probe = await request.get(`${API_BASE_URL}/ordivan/connectors`, { headers: adminAuth });
    expect(probe.status(), 'backend ORDIVAN_CONNECTOR_MODE=mock ile calismali').toBe(200);

    const created = await request.post(`${API_BASE_URL}/ordivan/connectors/enrollments`, {
      headers: adminAuth,
      data: {
        displayName: `E2E-SI-${Date.now()}`,
        capabilities: ['document.service_invoice.extract'],
      },
    });
    const enrollment = await created.json();
    const enrolled = await request.post(`${API_BASE_URL}/ordivan/connector/enroll`, {
      data: { enrollmentCode: enrollment.enrollmentCode, protocolVersion: '1' },
    });
    credential = (await enrolled.json()).credential;
  });

  test('yalnizca gercek PDF kabul edilir', async ({ request }) => {
    const nonPdf = await uploadInvoice(
      request,
      adminAuth,
      'fatura.pdf',
      Buffer.from('<html>bu bir PDF degil</html>'),
    );
    expect(nonPdf.status(), 'PDF olmayan dosya kabul edildi').toBe(400);

    // Bozuk PDF: uzanti ve MIME dogru ama ilk baytlar degil.
    const broken = await uploadInvoice(request, adminAuth, 'bozuk.pdf', Buffer.from('%PDX-1.4 xx'));
    expect(broken.status()).toBe(400);
  });

  test('surucu belge yukleyemez ve kuyrugu goremez', async ({ request }) => {
    const upload = await uploadInvoice(
      request,
      driverAuth,
      'fatura.pdf',
      pdfBytes('werkstatt-nord-clean.pdf'),
    );
    expect(upload.status()).toBe(403);

    const queue = await request.get(`${API_BASE_URL}/ordivan/automation/proposals`, {
      headers: driverAuth,
    });
    expect(queue.status()).toBe(403);
  });

  test('ayni dosyanin ikinci yuklemesi IKINCI IS ACMAZ', async ({ request }) => {
    const bytes = pdfBytes('werkstatt-nord-clean.pdf');

    const first = await uploadInvoice(request, adminAuth, 'werkstatt-nord-clean.pdf', bytes);
    expect(first.ok(), await first.text()).toBeTruthy();
    const firstBody = await first.json();
    expect(firstBody.duplicate).toBe(false);
    expect(firstBody.jobId).toBeTruthy();

    const second = await uploadInvoice(request, adminAuth, 'werkstatt-nord-clean.pdf', bytes);
    expect(second.ok()).toBeTruthy();
    const secondBody = await second.json();
    expect(secondBody.duplicate, 'duplicate isaretlenmedi').toBe(true);
    expect(secondBody.id).toBe(firstBody.id);

    // Depolama yolu yanitta GORUNMEMELI.
    const raw = JSON.stringify(secondBody);
    expect(raw).not.toContain('uploads/');
    expect(raw).not.toContain('storedFileName');
  });

  test('gecerli PDF: extraction → arac eslestirme → onay → TEK ServiceRecord', async ({ request }) => {
    test.setTimeout(180_000);

    const baseline = await fleetServiceTotal(request, adminAuth);

    const upload = await uploadInvoice(
      request,
      adminAuth,
      'werkstatt-nord-clean.pdf',
      pdfBytes('werkstatt-nord-clean.pdf'),
    );
    const document = await upload.json();

    const workerOut = await runWorkerUntilJob(credential, document.jobId);
    expect(workerOut).toContain('document downloaded');
    expect(workerOut, 'bu is tamamlanmadi').toContain(`completed job=${document.jobId}`);

    const listed = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals?status=pending_review&pageSize=100`,
      { headers: adminAuth },
    );
    const row = ((await listed.json()).rows as Array<{ id: string; jobId: string }>).find(
      (item) => item.jobId === document.jobId,
    );
    expect(row, 'oneri uretilmedi').toBeTruthy();

    const detail = await (
      await request.get(`${API_BASE_URL}/ordivan/automation/proposals/${row!.id}`, {
        headers: adminAuth,
      })
    ).json();

    // Deterministik fixture.
    expect(detail.payload.vendorName).toBe('Werkstatt Nord GmbH');
    expect(detail.payload.lineItems).toHaveLength(2);
    // Belge bagi var, depolama yolu YOK.
    expect(detail.document.fileDownloadPath).toContain('/ordivan/automation/documents/');
    expect(JSON.stringify(detail)).not.toContain('storedFileName');
    // ONAY ONCESI maliyet OLUSMADI.
    expect(detail.serviceRecord).toBeNull();
    expect(await fleetServiceTotal(request, adminAuth)).toBe(baseline);

    // Arac: eslestirme SUNUCUDA yapildi.
    const vehicleCheck = (detail.checks as Array<{ code: string; status: string }>).find(
      (check) => check.code === 'vehicle_match',
    );
    expect(vehicleCheck).toBeTruthy();

    const vehicles = await (
      await request.get(`${API_BASE_URL}/vehicles?limit=50`, { headers: adminAuth })
    ).json();
    const vehicleId =
      detail.evidence?.vehicleMatch?.vehicleId ?? (vehicles.data ?? vehicles)[0]?.id;
    expect(vehicleId).toBeTruthy();

    const confirmation = {
      vehicleId,
      costBasis: 'gross' as const,
      costAmount: 1190,
      currency: 'EUR',
      serviceDate: '2026-08-10',
      repairCompany: 'Werkstatt Nord GmbH',
      serviceType: 'Inspektion und Bremsenwechsel',
      mileageKm: 412000,
    };

    // Para birimi olmadan onay REDDEDILIR (EUR varsayilmiyor).
    const noCurrency = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row!.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'approved',
          serviceInvoice: { ...confirmation, currency: '' },
        },
      },
    );
    expect(noCurrency.status()).toBe(400);

    const approved = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row!.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'approved',
          serviceInvoice: confirmation,
          corrections: [
            {
              fieldName: 'grossAmount',
              fieldType: 'number',
              changed: false,
              category: 'accepted_as_is',
            },
          ],
        },
      },
    );
    expect(approved.ok(), await approved.text()).toBeTruthy();
    const after = (await approved.json()).proposal;

    expect(after.status).toBe('approved');
    expect(after.serviceRecord, 'ServiceRecord olusmadi').toBeTruthy();
    expect(after.serviceRecord.costAmount).toBe(1190);
    expect(after.serviceRecord.currency).toBe('EUR');

    // Maliyete TEK yansima.
    await expect
      .poll(() => fleetServiceTotal(request, adminAuth))
      .toBe(Number((baseline + 1190).toFixed(2)));

    // TEKRARLANAN onay ikinci kayit URETMEZ.
    const repeat = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row!.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: after.updatedAt,
          decision: 'approved',
          serviceInvoice: confirmation,
        },
      },
    );
    expect([200, 409]).toContain(repeat.status());
    expect(await fleetServiceTotal(request, adminAuth)).toBe(
      Number((baseline + 1190).toFixed(2)),
    );

    // Servis kaydi arac gecmisinde gorunuyor.
    const records = await request.get(
      `${API_BASE_URL}/service-records?vehicle_id=${vehicleId}`,
      { headers: adminAuth },
    );
    if (records.ok()) {
      expect(await records.text()).toContain(after.serviceRecord.id);
    }
  });

  test('tutar tutmayan fatura: kontrol `failed`, onay yine insanin', async ({ request }) => {
    test.setTimeout(120_000);

    const upload = await uploadInvoice(
      request,
      adminAuth,
      'summenfehler.pdf',
      pdfBytes('summenfehler.pdf'),
    );
    const document = await upload.json();
    await runWorkerUntilJob(credential, document.jobId);

    const listed = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals?status=pending_review&pageSize=100`,
      { headers: adminAuth },
    );
    const row = ((await listed.json()).rows as Array<{ id: string; jobId: string }>).find(
      (item) => item.jobId === document.jobId,
    )!;
    const detail = await (
      await request.get(`${API_BASE_URL}/ordivan/automation/proposals/${row.id}`, {
        headers: adminAuth,
      })
    ).json();

    const amount = (detail.checks as Array<{ code: string; status: string }>).find(
      (check) => check.code === 'amount_consistency',
    );
    expect(amount?.status).toBe('failed');
    expect(detail.checkSummary.allVerified).toBe(false);

    // Red: kategori ve aciklama zorunlu, kayit OLUSMAZ.
    const rejected = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'rejected',
          rejectionCategory: 'incorrect_value',
          note: 'Netto plus MwSt ergibt nicht den Bruttobetrag.',
        },
      },
    );
    expect(rejected.ok(), await rejected.text()).toBeTruthy();
    expect((await rejected.json()).proposal.serviceRecord).toBeNull();
  });

  test('eksik veri uydurulmaz: para birimi ve arac `unknown`', async ({ request }) => {
    test.setTimeout(120_000);

    const upload = await uploadInvoice(request, adminAuth, 'unklar.pdf', pdfBytes('unklar.pdf'));
    const document = await upload.json();
    await runWorkerUntilJob(credential, document.jobId);

    const listed = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals?status=pending_review&pageSize=100`,
      { headers: adminAuth },
    );
    const row = ((await listed.json()).rows as Array<{ id: string; jobId: string }>).find(
      (item) => item.jobId === document.jobId,
    )!;
    const detail = await (
      await request.get(`${API_BASE_URL}/ordivan/automation/proposals/${row.id}`, {
        headers: adminAuth,
      })
    ).json();

    const byCode = new Map(
      (detail.checks as Array<{ code: string; status: string; unknownReason?: string }>).map(
        (check) => [check.code, check],
      ),
    );
    expect(byCode.get('currency_present')?.status).toBe('unknown');
    expect(byCode.get('currency_present')?.unknownReason).toBe('currency_missing');
    expect(byCode.get('vehicle_match')?.status).toBe('unknown');
    expect(detail.payload.currency).toBeUndefined();
  });

  test('arayuz: yukleme, alanlar ve ozet — masaustu ve mobil', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await authenticate(page, fixture, 'admin');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/automation/queue');
    await expect(page.getByTestId('automation-queue')).toBeVisible();
    await expect(page.getByTestId('automation-upload-input')).toBeVisible();

    await testInfo.attach('service-invoice-queue-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByTestId('automation-upload-input')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'sayfa 375 px genislikte yatay kayiyor').toBeLessThanOrEqual(1);

    await testInfo.attach('service-invoice-queue-mobile', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
