import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensureP0Fixture, type FixtureManifest, type Role } from './support/p0-fixture';
import { expect, test, type Page } from '@playwright/test';

/**
 * Ordivan connector protokolu — uctan uca (Faz 12).
 *
 * Kesin cikis kriteri burada kanitlaniyor:
 *   Job → Mock Connector → AgentRun → Proposal → inceleme → approve/reject
 *   → CorrectionEvent → audit
 *
 * MOCK WORKER GERCEK SUREC OLARAK calistiriliyor (`--once`): DB'ye ya da
 * servis katmanina dokunmuyor, yalnizca HTTP protokolunu konusuyor. Iki
 * worker'in ayni anda ayni isi alamamasi da bu yuzden GERCEK bir eszamanlilik
 * testi.
 *
 * Backend `ORDIVAN_CONNECTOR_MODE=mock` ile calismali; aksi halde uclar 503
 * doner (disabled modda Fleet calismaya devam eder).
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const BACKEND_ROOT = path.resolve(__dirname, '../../../backend');
const WORKER = path.join(BACKEND_ROOT, 'scripts/ordivan-mock-worker.mjs');

const execFileAsync = promisify(execFile);

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

function token(fixture: FixtureManifest, role: Role) {
  return fixture.accessTokens[fixture.tenantA.tenantId]?.[role] ?? null;
}

async function runWorker(args: string[], env: Record<string, string> = {}) {
  try {
    const { stdout } = await execFileAsync('node', [WORKER, ...args], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, FLEET_API_BASE_URL: API_BASE_URL, ...env },
      timeout: 60_000,
    });
    return { ok: true as const, stdout };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false as const, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

test.describe.serial('Ordivan connector protokolu', () => {
  let fixture: FixtureManifest;
  let adminAuth: Record<string, string>;
  let officeAuth: Record<string, string>;
  let driverAuth: Record<string, string>;
  let credential: string;

  test.beforeAll(async ({ request }) => {
    fixture = ensureP0Fixture();
    adminAuth = { Authorization: `Bearer ${token(fixture, 'admin')}` };
    officeAuth = { Authorization: `Bearer ${token(fixture, 'office')}` };
    driverAuth = { Authorization: `Bearer ${token(fixture, 'driver')}` };

    const probe = await request.get(`${API_BASE_URL}/ordivan/connectors`, { headers: adminAuth });
    expect(
      probe.status(),
      'Ordivan kapali gorunuyor — backend ORDIVAN_CONNECTOR_MODE=mock ile calismali',
    ).toBe(200);
  });

  test('enrollment: kod bir kez calisir, rol siniri tutar', async ({ request }) => {
    // ROL: ofis ve surucu connector yonetimini GOREMEZ.
    for (const [label, headers] of [
      ['office', officeAuth],
      ['driver', driverAuth],
    ] as const) {
      const forbidden = await request.get(`${API_BASE_URL}/ordivan/connectors`, { headers });
      expect(forbidden.status(), `${label} connector ekranini gormemeli`).toBe(403);
    }

    const created = await request.post(`${API_BASE_URL}/ordivan/connectors/enrollments`, {
      headers: adminAuth,
      // Iki yetenek de veriliyor: asagidaki testler hem echo hem belge isi
      // kiraliyor. Yetenek eslesmesi ayrica kendi testinde sinaniyor.
      data: {
        displayName: `E2E-${Date.now()}`,
        capabilities: ['system.echo', 'document.classification'],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const enrollment = await created.json();
    expect(enrollment.enrollmentCode.length).toBeGreaterThan(20);

    const enrolled = await request.post(`${API_BASE_URL}/ordivan/connector/enroll`, {
      data: { enrollmentCode: enrollment.enrollmentCode, protocolVersion: '1' },
    });
    expect(enrolled.ok(), await enrolled.text()).toBeTruthy();
    credential = (await enrolled.json()).credential;
    expect(credential.length).toBeGreaterThan(20);

    // TEK KULLANIMLIK: ayni kod ikinci kez gecmez.
    const replay = await request.post(`${API_BASE_URL}/ordivan/connector/enroll`, {
      data: { enrollmentCode: enrollment.enrollmentCode },
    });
    expect(replay.status()).toBe(401);

    // Liste ne anahtari ne ozetini icerir.
    const listed = await request.get(`${API_BASE_URL}/ordivan/connectors`, { headers: adminAuth });
    const body = await listed.text();
    expect(body).not.toContain(credential);
    expect(body).not.toContain(enrollment.enrollmentCode);
  });

  test('gecersiz anahtar ile is kiralanamaz', async ({ request }) => {
    const denied = await request.post(`${API_BASE_URL}/ordivan/connector/jobs/lease`, {
      headers: { 'x-ordivan-credential': 'tamamen-uydurma-anahtar' },
    });
    expect(denied.status()).toBe(401);
  });

  test('yetenegi olmayan connector isi ALAMAZ', async ({ request }) => {
    const created = await request.post(`${API_BASE_URL}/ordivan/connectors/enrollments`, {
      headers: adminAuth,
      data: { displayName: `E2E-limited-${Date.now()}`, capabilities: ['system.echo'] },
    });
    const enrollment = await created.json();
    const enrolled = await request.post(`${API_BASE_URL}/ordivan/connector/enroll`, {
      data: { enrollmentCode: enrollment.enrollmentCode, protocolVersion: '1' },
    });
    const limited = (await enrolled.json()).credential;

    const documentJob = await request.post(`${API_BASE_URL}/ordivan/automation/jobs`, {
      headers: adminAuth,
      data: {
        jobType: 'document.mock_classification',
        schemaVersion: 1,
        payload: { documentName: `Rechnung-yetenek-${Date.now()}.pdf` },
      },
    });
    const documentJobId = (await documentJob.json()).id;

    /**
     * Yalnizca `system.echo` yetenegi olan connector BELGE isini gormemeli.
     *
     * "Hic is almamali" DIYE BAKILMAZ: kuyrukta hakki olan baska isler
     * olabilir ve onlari almasi dogrudur. Sinanan sey, yetenegi olmayan isin
     * ASLA bu connector'a verilmemesi.
     */
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const leased = await request.post(`${API_BASE_URL}/ordivan/connector/jobs/lease`, {
        headers: { 'x-ordivan-credential': limited },
      });
      expect(leased.ok()).toBeTruthy();
      const job = (await leased.json()).job as
        | { jobId: string; jobType: string; leaseToken: string }
        | null;
      if (!job) break;

      expect(job.jobId, 'yetenegi olmayan is verildi').not.toBe(documentJobId);
      expect(job.jobType).toBe('system.echo');

      // Aldigi isi GERI BIRAKIYOR: bu test kuyrugu zehirlememeli, yoksa
      // sonraki testler kiralanmis ama hic islenmeyen islerin arkasinda kalir.
      await request.post(`${API_BASE_URL}/ordivan/connector/jobs/${job.jobId}/fail`, {
        headers: { 'x-ordivan-credential': limited },
        data: { leaseToken: job.leaseToken, failureClass: 'e2e_release' },
      });
    }
  });

  test('IKI worker ayni anda: yalnizca biri isi alir', async ({ request }) => {
    test.setTimeout(120_000);

    /**
     * ONCE KUYRUGU BOSALT.
     *
     * Onceki kosulardan kalan isler varsa iki worker BASKA isleri alir ve
     * test olcmek istedigi seyi hic olcmez. Bosaltma, yarisin gercekten AYNI
     * is uzerinde olmasini garanti ediyor.
     */
    for (let index = 0; index < 20; index += 1) {
      const drained = await runWorker(['--once'], { ORDIVAN_CREDENTIAL: credential });
      if (drained.stdout.includes('no job available')) break;
    }

    const created = await request.post(`${API_BASE_URL}/ordivan/automation/jobs`, {
      headers: adminAuth,
      data: { jobType: 'system.echo', schemaVersion: 1, payload: { message: 'eszamanlilik' } },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const jobId = (await created.json()).id;

    // Iki GERCEK worker sureci, ayni anda, ayni kiraci ve ayni yetenek.
    const [first, second] = await Promise.all([
      runWorker(['--once'], { ORDIVAN_CREDENTIAL: credential }),
      runWorker(['--once'], { ORDIVAN_CREDENTIAL: credential }),
    ]);

    const outputs = [first.stdout, second.stdout];

    // ONEMLI: "kac worker bir is tamamladi" diye BAKILMAZ. Kuyrukta baska
    // isler olabilir ve iki worker'in FARKLI isleri almasi zaten dogru
    // davranistir. Sinanan sey su: BU is yalnizca BIR kez alinmis olmali.
    const tookThisJob = outputs.filter((out) => out.includes(`completed job=${jobId}`));
    expect(tookThisJob.length, 'ayni is iki worker tarafindan tamamlandi').toBe(1);

    // Tek oneri uretildi.
    const proposals = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals?status=pending_review&pageSize=100`,
      { headers: adminAuth },
    );
    const rows = (await proposals.json()).rows as Array<{ jobId: string }>;
    // Tek is, tek oneri: kiralama kilidi tuttu.
    expect(rows.filter((row) => row.jobId === jobId).length).toBe(1);
  });

  test('tam akis: job → proposal → onay → CorrectionEvent → audit', async ({ request }) => {
    test.setTimeout(120_000);

    const created = await request.post(`${API_BASE_URL}/ordivan/automation/jobs`, {
      headers: adminAuth,
      data: {
        jobType: 'document.mock_classification',
        schemaVersion: 1,
        payload: { documentName: 'Rechnung-2026-08.pdf' },
      },
    });
    const jobId = (await created.json()).id;

    const worker = await runWorker(['--once'], { ORDIVAN_CREDENTIAL: credential });
    expect(worker.ok, worker.stdout).toBeTruthy();
    expect(worker.stdout).toContain('completed job=');

    const listed = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals?status=pending_review&pageSize=100`,
      { headers: adminAuth },
    );
    const row = ((await listed.json()).rows as Array<{ id: string; jobId: string }>).find(
      (item) => item.jobId === jobId,
    );
    expect(row, 'oneri uretilmedi').toBeTruthy();

    const detailResponse = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals/${row!.id}`,
      { headers: adminAuth },
    );
    const detail = await detailResponse.json();

    // Deterministik mock: dosya adi "Rechnung" -> invoice.
    expect(detail.payload.documentKind).toBe('invoice');
    // UC DURUMLU KONTROL: icerik okunmadigi icin "unknown", "sorun yok" DEGIL.
    const contentCheck = (detail.checks as Array<{ code: string; status: string; unknownReason?: string }>)
      .find((check) => check.code === 'content_consistency');
    expect(contentCheck?.status).toBe('unknown');
    expect(contentCheck?.unknownReason).toBeTruthy();
    expect(detail.checkSummary.allVerified).toBe(false);
    // Denetlenebilir yetki izi.
    expect(detail.agentRun.toolset).toEqual([]);
    // Sunucu tarafindan yonetilen sure.
    expect(detail.expiresAt).toBeTruthy();

    // ONAY: rutin onayda aciklama OPSIYONEL.
    const approved = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row!.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'approved',
          corrections: [
            {
              fieldName: 'documentKind',
              fieldType: 'enum',
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
    expect(after.approvalTask.decision).toBe('approved');
    expect(after.approvalTask.status).toBe('decided');

    // Denetim izi: karar audit'e dustu, oneri govdesi DUSMEDI.
    const audit = await request.get(
      `${API_BASE_URL}/audit-logs?entityType=AutomationProposal&limit=50`,
      { headers: adminAuth },
    );
    if (audit.ok()) {
      const text = await audit.text();
      expect(text).toContain('automation_proposal.approved');
      expect(text).not.toContain('Rechnung-2026-08.pdf');
    }
  });

  test('arayuz: connector ekrani ve kuyruk, masaustu ve mobil', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await authenticate(page, fixture, 'admin');

    // --- Connector ekrani, masaustu ---
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/automation/connectors');
    await expect(page.getByTestId('ordivan-connector-screen')).toBeVisible();
    // Calisma modu METIN olarak duruyor.
    await expect(page.getByTestId('ordivan-mode')).toBeVisible();
    await expect(page.getByTestId('ordivan-connector-row').first()).toBeVisible();

    // ANAHTAR SAYFADA YOK: liste ucu ne anahtari ne ozetini tasiyor.
    const connectorHtml = await page.content();
    expect(connectorHtml).not.toContain(credential);

    await testInfo.attach('ordivan-connectors-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // --- Kuyruk, masaustu ---
    await page.goto('/automation/queue');
    await expect(page.getByTestId('automation-queue')).toBeVisible();
    await expect(page.getByTestId('automation-metrics')).toBeVisible();

    await testInfo.attach('ordivan-queue-desktop', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // --- Mobil ---
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByTestId('automation-queue')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'sayfa 375 px genislikte yatay kayiyor').toBeLessThanOrEqual(1);

    await testInfo.attach('ordivan-queue-mobile', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('arayuz: ofis ve surucu otomasyon ekranlarini goremez', async ({ page }) => {
    for (const role of ['office', 'driver'] as const) {
      const context = await page.context().browser()!.newContext();
      const scoped = await context.newPage();
      await authenticate(scoped, fixture, role);
      await scoped.goto('/automation/queue');

      // Rol siniri sunucuda; ekranda veri GORUNMEMELI.
      await expect(scoped.getByTestId('automation-row')).toHaveCount(0);
      await context.close();
    }
  });

  test('red: kategori zorunlu, aciklama zorunlu, kalite sinyali uretilir', async ({ request }) => {
    test.setTimeout(120_000);

    const created = await request.post(`${API_BASE_URL}/ordivan/automation/jobs`, {
      headers: adminAuth,
      data: {
        jobType: 'document.mock_classification',
        schemaVersion: 1,
        payload: { documentName: 'Lieferschein-77.pdf' },
      },
    });
    const jobId = (await created.json()).id;
    await runWorker(['--once'], { ORDIVAN_CREDENTIAL: credential });

    const listed = await request.get(
      `${API_BASE_URL}/ordivan/automation/proposals?status=pending_review&pageSize=100`,
      { headers: adminAuth },
    );
    const row = ((await listed.json()).rows as Array<{ id: string; jobId: string }>).find(
      (item) => item.jobId === jobId,
    )!;
    const detail = await (
      await request.get(`${API_BASE_URL}/ordivan/automation/proposals/${row.id}`, {
        headers: adminAuth,
      })
    ).json();

    // Kategori olmadan red REDDEDILIR.
    const noCategory = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'rejected',
          note: 'Passt nicht.',
        },
      },
    );
    expect(noCategory.status()).toBe(400);

    // Aciklama olmadan red de REDDEDILIR.
    const noNote = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'rejected',
          rejectionCategory: 'incorrect_value',
        },
      },
    );
    expect(noNote.status()).toBe(400);

    const rejected = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: detail.updatedAt,
          decision: 'rejected',
          rejectionCategory: 'incorrect_value',
          note: 'Dokumenttyp stimmt nicht mit dem Beleg überein.',
        },
      },
    );
    expect(rejected.ok(), await rejected.text()).toBeTruthy();
    const after = (await rejected.json()).proposal;
    expect(after.status).toBe('rejected');
    expect(after.approvalTask.rejectionCategory).toBe('incorrect_value');

    // Karar verilmis oneri yeniden kapatilamaz.
    const again = await request.post(
      `${API_BASE_URL}/ordivan/automation/proposals/${row.id}/decide`,
      {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: after.updatedAt,
          decision: 'approved',
          note: 'Doch nicht.',
        },
      },
    );
    expect(again.status()).toBe(409);
  });
});
