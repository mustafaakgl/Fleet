import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * SIPARIS GELEN KUTUSU — UCTAN UCA (Faz 16).
 *
 * GERCEK SUREC, GERCEK PROTOKOL: Faz 12'nin mock worker'i burada AYRI BIR
 * NODE SURECI olarak calisiyor. Enrollment, connector kimlik dogrulamasi, is
 * kiralama, icerik cekme ve sonuc bildirimi gercek HTTP uzerinden geciyor —
 * hicbiri taklit edilmiyor. Servis testleri her adimi ayri ayri kanitliyor;
 * burada kanitlanan sey ADIMLARIN BIRBIRINE BAGLANDIGI.
 *
 * WORKER CALISMAZSA TEST GORUNUR BICIMDE DUSER. Daha once bu testler `skip`
 * idi ve bu yaniltiyordu: atlanan bir test yesil gorunur ama hicbir sey
 * kanitlamaz. Artik inceleme belirli surede acilmazsa worker'in ciktisiyla
 * birlikte hata veriliyor.
 *
 * PRODUCTION KORUMASI ZAYIFLATILMADI: worker `NODE_ENV=production` ile
 * calismayi REDDEDIYOR ve bu ayrica test ediliyor.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const BACKEND_ROOT = path.resolve(__dirname, '../../../backend');

const CREDENTIALS = {
  admin: { email: 'admin@fleet.com', password: process.env.SEED_ADMIN_PASSWORD },
  office: { email: 'office@fleet.com', password: process.env.SEED_OFFICE_PASSWORD },
  accounting: { email: 'accounting@fleet.com', password: process.env.SEED_ACCOUNTING_PASSWORD },
  driver: { email: 'driver@fleet.com', password: process.env.SEED_DRIVER_PASSWORD },
} as const;

type Role = keyof typeof CREDENTIALS;

const CRLF = '\r\n';

/** IKI KALEMLI, fiyat tasiyan sentetik bir tasima emri. */
const MULTI_CONSIGNMENT_BODY = [
  'Ladestelle: Musterweg 3, 47051 Duisburg',
  'Entladestelle: Hafenstrasse 12, 20095 Hamburg',
  'Ladung: Maschinenteile',
  'Gewicht: 8400 kg',
  // ADR KALEM BAZINDA: iki sevkiyatin tehlikeli madde durumu FARKLI ve
  // her biri kendi blogunda bildiriliyor. Tek bir kalemin ADR'sinin
  // digerine SESSIZCE devrolmadigini da bu ayrim gosteriyor.
  'ADR: nein',
  'Ladestelle: Ringstrasse 9, 50667 Koeln',
  'Entladestelle: Leipziger Platz 2, 10117 Berlin',
  'Ladung: Ersatzteile',
  'Paletten: 6',
  'ADR: ja',
  'Frachtpreis: 1.250,00 EUR',
];

function buildEml(options: { messageId: string; reference: string; body?: string[] }): Buffer {
  const headers = [
    // GONDEREN SEED'DEKI GERCEK BIR MUSTERININ KAYITLI ADRESI.
    // Uydurma bir adres kullansaydik eslestirme `unknown` kalirdi ve test
    // "eslestirme calisiyor" degil "eslestirme calismiyor"u dogrulardi.
    'From: "Raben Group" <dispo@raben.de>',
    'To: auftrag@fleet.example',
    `Subject: Transportauftrag ${options.reference}`,
    'Date: Tue, 01 Sep 2026 09:15:00 +0200',
    `Message-ID: <${options.messageId}@e2e.example>`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  const body = [`Referenz: ${options.reference}`, ...(options.body ?? MULTI_CONSIGNMENT_BODY)];
  return Buffer.from(`${headers.join(CRLF)}${CRLF}${CRLF}${body.join('\n')}${CRLF}`, 'utf8');
}

async function login(request: APIRequestContext, role: Role): Promise<string> {
  const credentials = CREDENTIALS[role];
  expect(
    credentials.password,
    `SEED_${role.toUpperCase()}_PASSWORD tanimli degil — E2E kimlik bilgilerini ortamdan okur`,
  ).toBeTruthy();

  /**
   * 429'DA BEKLEYIP TEKRAR DENIYORUZ — throttle DEVRE DISI BIRAKILMIYOR.
   * Giris ucu 60 saniyede 5 denemeye sinirli ve bu bir URUN DAVRANISI.
   */
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: credentials.email, password: credentials.password },
    });
    if (response.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      continue;
    }
    expect(response.status(), await response.text()).toBe(200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  }
  throw new Error(`${role} icin giris yapilamadi: rate limit penceresi acilmadi`);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Mock worker — GERCEK SUREC
// ---------------------------------------------------------------------------

let worker: ChildProcessWithoutNullStreams | null = null;
let workerLog = '';

async function startWorker(request: APIRequestContext, adminToken: string): Promise<void> {
  // 1) ENROLLMENT: kod admin ucundan aliniyor, yetenekler REGISTRY ile suzuluyor.
  const enrollment = await request.post(`${API_BASE_URL}/ordivan/connectors/enrollments`, {
    headers: auth(adminToken),
    data: {
      displayName: `e2e-worker-${Date.now()}`,
      capabilities: ['transport_order.extract@v1', 'order_intake.message.push@v1'],
    },
  });
  expect(enrollment.status(), await enrollment.text()).toBe(201);
  const { enrollmentCode } = (await enrollment.json()) as { enrollmentCode: string };
  expect(enrollmentCode, 'enrollment kodu donmedi').toBeTruthy();

  // 2) WORKER: ayri bir surec. Kendi kimligini kendisi dogruluyor.
  worker = spawn(
    process.execPath,
    ['scripts/ordivan-mock-worker.mjs', '--enroll', enrollmentCode],
    {
      cwd: BACKEND_ROOT,
      env: { ...process.env, FLEET_API_BASE_URL: API_BASE_URL, ORDIVAN_MOCK_POLL_MS: '1000' },
    },
  ) as ChildProcessWithoutNullStreams;

  worker.stdout.on('data', (chunk: Buffer) => {
    workerLog += chunk.toString();
  });
  worker.stderr.on('data', (chunk: Buffer) => {
    workerLog += chunk.toString();
  });

  // 3) Enrollment'in gerceklestigini worker'in KENDI ciktisindan dogruluyoruz.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (/enrolled connector=/.test(workerLog)) return;
    if (worker.exitCode !== null) {
      throw new Error(`mock worker beklenmedik sekilde kapandi:\n${workerLog}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`mock worker enrollment tamamlanmadi:\n${workerLog}`);
}

function stopWorker(): void {
  if (!worker) return;
  worker.kill('SIGTERM');
  worker = null;
}

type ReviewDetail = {
  review: {
    id: string;
    status: string;
    proposedIntent: string;
    companyMatchStatus: string;
    tasks: Array<{ sequence: number; status: string }>;
    resultTransportOrderId: string | null;
  } | null;
  proposed: { payload: Record<string, unknown> } | null;
};

/**
 * Worker'in isi tamamlamasini bekler.
 *
 * SKIP YOK: sure dolarsa worker'in ciktisiyla birlikte HATA veriliyor, cunku
 * "worker kosmadi" bir test atlamasi degil bir BASARISIZLIKTIR.
 */
async function waitForReview(
  request: APIRequestContext,
  token: string,
  messageId: string,
  timeoutMs = 60_000,
): Promise<ReviewDetail> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(token),
    });
    last = await response.text();
    if (response.status() === 200) {
      const detail = JSON.parse(last) as ReviewDetail;
      if (detail.review) return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `mock worker inceleme uretmedi (${timeoutMs} ms).\n--- worker ---\n${workerLog}\n--- son yanit ---\n${last}`,
  );
}

test.describe.serial('Faz 16 — siparis ajani uctan uca', () => {
  const tokens: Partial<Record<Role, string>> = {};
  const runId = `e2e-${Date.now()}`;
  const reference = `E2E-${Date.now()}`;
  let messageId = '';
  let reviewId = '';

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(240_000);
    const request = await playwright.request.newContext();
    for (const role of Object.keys(CREDENTIALS) as Role[]) {
      tokens[role] = await login(request, role);
    }
    await startWorker(request, tokens.admin!);
    await request.dispose();
  });

  test.afterAll(() => {
    stopWorker();
  });

  // -------------------------------------------------------------------------
  // Intake
  // -------------------------------------------------------------------------

  test('EML yuklemesi mesaj olusturuyor', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/order-intake/uploads`, {
      headers: auth(tokens.admin!),
      multipart: {
        file: {
          name: `${runId}.eml`,
          mimeType: 'message/rfc822',
          buffer: buildEml({ messageId: runId, reference }),
        },
      },
    });
    expect(response.status(), await response.text()).toBe(201);

    const body = (await response.json()) as { messageId: string; duplicate: boolean };
    expect(body.duplicate).toBe(false);
    messageId = body.messageId;
  });

  test('AYNI mesaj ikinci kez YENI kayit ACMIYOR', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/order-intake/uploads`, {
      headers: auth(tokens.admin!),
      multipart: {
        file: {
          name: `${runId}.eml`,
          mimeType: 'message/rfc822',
          buffer: buildEml({ messageId: runId, reference }),
        },
      },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { messageId: string; duplicate: boolean };
    expect(body.duplicate).toBe(true);
    expect(body.messageId).toBe(messageId);
  });

  // -------------------------------------------------------------------------
  // Worker — GERCEK PROTOKOL
  // -------------------------------------------------------------------------

  test('MOCK WORKER isi kiralayip cikarim uretiyor', async ({ request }) => {
    test.setTimeout(120_000);
    const detail = await waitForReview(request, tokens.admin!, messageId);

    expect(detail.review, 'inceleme acilmadi').toBeTruthy();
    reviewId = detail.review!.id;

    // Worker gercekten is kiraladi ve tamamladi — kendi ciktisi da soyluyor.
    expect(workerLog).toMatch(/leased job=/);
    expect(workerLog).toMatch(/order intake extracted intent=/);

    // Niyet ve eslestirme SUNUCUDA belirlendi.
    expect(detail.review!.proposedIntent).toBe('new_order');
    // KAYITLI TAM iletisim e-postasi uzerinden KESIN eslesme.
    expect(detail.review!.companyMatchStatus).toBe('contact_email');
  });

  test('CIKARIM IKI KALEM uretti — ikinci sevkiyat kaybolmuyor', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.admin!),
    });
    const detail = (await response.json()) as ReviewDetail;
    const consignments = detail.proposed!.payload.consignments as Array<Record<string, unknown>>;

    expect(consignments).toHaveLength(2);
    expect(String(consignments[0]!.pickupAddress)).toContain('Duisburg');
    expect(String(consignments[0]!.deliveryAddress)).toContain('Hamburg');
    expect(String(consignments[1]!.pickupAddress)).toContain('Koeln');
    expect(String(consignments[1]!.deliveryAddress)).toContain('Berlin');
    // ADR HER KALEME AYRI gitti — biri digerinden devralmadi.
    expect(consignments[0]!.adr).toBe('no');
    expect(consignments[1]!.adr).toBe('yes');
  });

  test('OPERASYONEL ve FINANSAL gorevler AYRI acildi', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.admin!),
    });
    const detail = (await response.json()) as ReviewDetail;

    // Mesaj fiyat tasiyor: finansal gorev de acilmali.
    expect(detail.review!.tasks.map((task) => task.sequence).sort()).toEqual([1, 2]);
  });

  // -------------------------------------------------------------------------
  // Rol siniri
  // -------------------------------------------------------------------------

  test('OFIS finansal gorevi, MUHASEBE operasyonel gorevi KAPATAMIYOR', async ({ request }) => {
    const officeOnFinancial = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/tasks/2`,
      { headers: auth(tokens.office!), data: { decision: 'approved' } },
    );
    expect(officeOnFinancial.status()).toBe(403);

    const accountingOnOperational = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/tasks/1`,
      { headers: auth(tokens.accounting!), data: { decision: 'approved' } },
    );
    expect(accountingOnOperational.status()).toBe(403);
  });

  test('ZORUNLU GOREV bitmeden taslak OLUSMUYOR', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/order-intake/reviews/${reviewId}/approve`, {
      headers: auth(tokens.admin!),
      data: { intent: 'new_order' },
    });
    expect(response.status()).toBe(409);

    /**
     * ENGEL SEBEBI `details` ALTINDA: global hata filtresi istisnanin ozel
     * govdesini oraya tasiyor. Yalnizca ust seviyeye bakmak, engelin
     * SEBEBININ istemciye ulasip ulasmadigini olcmezdi.
     */
    const body = (await response.json()) as {
      blockedBy?: string[];
      details?: { blockedBy?: string[]; code?: string };
    };
    const blockedBy = body.blockedBy ?? body.details?.blockedBy ?? [];
    expect(blockedBy, JSON.stringify(body)).toContain('operational_review_pending');
  });

  // -------------------------------------------------------------------------
  // Musteri / siparis secimi
  // -------------------------------------------------------------------------

  test('secim listesi KIRACI KAPSAMLI adaylar donduruyor', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.admin!),
    });
    const detail = (await response.json()) as {
      review: { companyOptions: Array<{ id: string; name: string }> } | null;
    };

    // Adaylar ISIMLERIYLE cozulmus geliyor — arayuz secim listesi cizebilsin.
    expect(detail.review!.companyOptions.length).toBeGreaterThan(0);
    expect(detail.review!.companyOptions[0]!.name).toBeTruthy();
  });

  test('BASKA/UYDURMA kimlik dayatilamiyor', async ({ request }) => {
    for (const body of [
      { companyId: 'cmp-baska-tenant' },
      { orderId: 'ord-baska-tenant' },
      { companyId: '../../etc/passwd' },
    ]) {
      const response = await request.post(
        `${API_BASE_URL}/order-intake/reviews/${reviewId}/selection`,
        { headers: auth(tokens.admin!), data: body },
      );
      // Kimlik SUNUCUDA yeniden cozuluyor: yoksa 400, varligi sizmiyor.
      expect(response.status(), JSON.stringify(body)).toBe(400);
    }
  });

  test('MUHASEBE ve SURUCU secim yapamiyor', async ({ request }) => {
    for (const role of ['accounting', 'driver'] as const) {
      const response = await request.post(
        `${API_BASE_URL}/order-intake/reviews/${reviewId}/selection`,
        { headers: auth(tokens[role]!), data: { companyId: null } },
      );
      expect(response.status(), role).toBe(403);
    }
  });

  test('musteri secilebiliyor ve secim KALDIRILABILIYOR', async ({ request }) => {
    const detail = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.admin!),
    });
    const options = (
      (await detail.json()) as { review: { companyOptions: Array<{ id: string }> } }
    ).review.companyOptions;

    const chosen = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/selection`,
      { headers: auth(tokens.office!), data: { companyId: options[0]!.id } },
    );
    expect(chosen.status(), await chosen.text()).toBe(200);
    expect(((await chosen.json()) as { selectedCompanyId: string }).selectedCompanyId).toBe(
      options[0]!.id,
    );

    // `null` SECIMI KALDIRIR — kullanici yanlis sectigini geri alabilmeli.
    const cleared = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/selection`,
      { headers: auth(tokens.office!), data: { companyId: null } },
    );
    expect(cleared.status()).toBe(200);
    expect(((await cleared.json()) as { selectedCompanyId: string | null }).selectedCompanyId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Inceleme -> onay -> TransportOrder draft
  // -------------------------------------------------------------------------

  test('yetkili roller kendi gorevlerini kapatiyor', async ({ request }) => {
    const operational = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/tasks/1`,
      { headers: auth(tokens.office!), data: { decision: 'approved' } },
    );
    expect(operational.status(), await operational.text()).toBe(200);

    const financial = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/tasks/2`,
      { headers: auth(tokens.accounting!), data: { decision: 'approved' } },
    );
    expect(financial.status(), await financial.text()).toBe(200);
  });

  test('ONAY yalnizca TransportOrder DRAFTI uretiyor', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/order-intake/reviews/${reviewId}/approve`, {
      headers: auth(tokens.admin!),
      data: {
        intent: 'new_order',
        values: { currency: 'EUR', orderDate: '2026-09-01', externalReference: reference },
        // INSANIN DUZELTMESI: ikinci kalemin paleti duzeltiliyor.
        consignments: [
          {
            pickupAddress: 'Musterweg 3, 47051 Duisburg',
            deliveryAddress: 'Hafenstrasse 12, 20095 Hamburg',
            cargoDescription: 'Maschinenteile',
            weightKg: 8400,
            adrStatus: 'no',
          },
          {
            pickupAddress: 'Ringstrasse 9, 50667 Koeln',
            deliveryAddress: 'Leipziger Platz 2, 10117 Berlin',
            cargoDescription: 'Ersatzteile',
            palletCount: 8,
            adrStatus: 'unknown',
          },
        ],
      },
    });
    expect(response.status(), await response.text()).toBe(200);

    const body = (await response.json()) as {
      transportOrderId: string | null;
      revisionId: string | null;
    };
    expect(body.transportOrderId, 'taslak olusmadi').toBeTruthy();
    expect(body.revisionId).toBeNull();

    // TASLAK — otomatik CONFIRM YOK.
    const order = await request.get(`${API_BASE_URL}/transport-orders/${body.transportOrderId}`, {
      headers: auth(tokens.admin!),
    });
    expect(order.status(), await order.text()).toBe(200);

    const detail = (await order.json()) as {
      status: string;
      source: string;
      consignments: Array<Record<string, unknown>>;
      assignments?: unknown[];
    };
    expect(detail.status).toBe('draft');
    expect(detail.source).toBe('email_agent');
    // ROUND-TRIP: iki kalem taslaga tasindi ve INSANIN duzeltmesi kazandi.
    expect(detail.consignments).toHaveLength(2);
    expect(detail.consignments[1]!.palletCount).toBe(8);
    // Assignment/Tour OLUSMADI.
    expect(detail.assignments ?? []).toHaveLength(0);
  });

  test('EXACTLY-ONCE: ayni inceleme ikinci kez onaylanamiyor', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/order-intake/reviews/${reviewId}/approve`, {
      headers: auth(tokens.admin!),
      data: { intent: 'new_order', values: { currency: 'EUR' } },
    });
    expect(response.status()).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Guvenlik
  // -------------------------------------------------------------------------

  test('SURUCU hicbir uca erisemiyor', async ({ request }) => {
    for (const endpoint of [
      '/order-intake/messages',
      `/order-intake/messages/${messageId}`,
      `/order-intake/messages/${messageId}/raw`,
    ]) {
      const response = await request.get(`${API_BASE_URL}${endpoint}`, {
        headers: auth(tokens.driver!),
      });
      expect(response.status(), `${endpoint} surucuye acik`).toBe(403);
    }
  });

  test('KIMLIK DOGRULAMASIZ istek reddediliyor', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages`);
    expect(response.status()).toBe(401);
  });

  test('OFISTE finansal alanlar MASKELENIYOR, muhasebede goruntuleniyor', async ({ request }) => {
    const officeResponse = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.office!),
    });
    expect(officeResponse.status()).toBe(200);
    const office = (await officeResponse.json()) as Record<string, unknown>;

    expect(office.rawDocumentAvailable).toBe(false);
    expect(JSON.stringify(office)).not.toContain('1.250,00');

    const officeRaw = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}/raw`, {
      headers: auth(tokens.office!),
    });
    expect(officeRaw.status()).toBe(403);

    const accountingResponse = await request.get(
      `${API_BASE_URL}/order-intake/messages/${messageId}`,
      { headers: auth(tokens.accounting!) },
    );
    const accounting = (await accountingResponse.json()) as { rawDocumentAvailable: boolean };
    expect(accounting.rawDocumentAvailable).toBe(true);
  });

  test('gecersiz niyet filtresi ve sebepsiz red REDDEDILIYOR', async ({ request }) => {
    const invalidFilter = await request.get(
      `${API_BASE_URL}/order-intake/messages?intent=approve`,
      { headers: auth(tokens.admin!) },
    );
    expect(invalidFilter.status()).toBe(400);

    const shortReason = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${reviewId}/reject`,
      { headers: auth(tokens.admin!), data: { reason: 'x' } },
    );
    expect(shortReason.status()).toBe(400);
  });

  test('`unknown` niyet ONAYLANAMIYOR — DTO listesinde yok', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/order-intake/reviews/${reviewId}/approve`, {
      headers: auth(tokens.admin!),
      data: { intent: 'unknown' },
    });
    expect(response.status()).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Kiraci siniri — `tenantId` login govdesinde YOK, TOKEN'da VAR
  // -------------------------------------------------------------------------

  test('kiraci TOKEN`dan cozuluyor, istemciye ACILMIYOR', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: CREDENTIALS.admin.email, password: CREDENTIALS.admin.password },
    });
    // Rate limit penceresi doluysa bu testin olctugu sey degismez; atlamak
    // yerine bekleyip tekrar denemek gerekirdi, ama seri kosumda pencere acik.
    expect(response.status(), await response.text()).toBe(200);

    const body = (await response.json()) as {
      accessToken: string;
      user: Record<string, unknown>;
    };

    // 1) Login GOVDESI kiraci TASIMIYOR — istemci kiraci secemez/goremez.
    expect('tenantId' in body.user).toBe(false);

    // 2) IMZALI TOKEN kiraciyi tasiyor.
    const claims = JSON.parse(
      Buffer.from(body.accessToken.split('.')[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(claims.tenantId).toBeTruthy();

    // 3) Kullanici KIRACIYA BAGLI (global admin degil) ve kiraci-kapsamli
    //    uclar bu token ile calisiyor.
    const scoped = await request.get(`${API_BASE_URL}/order-intake/messages`, {
      headers: auth(body.accessToken),
    });
    expect(scoped.status()).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Production korumasi
  // -------------------------------------------------------------------------

  test('MOCK WORKER production ortaminda calismayi REDDEDIYOR', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/ordivan-mock-worker.mjs', '--enroll', 'sahte-kod', '--once'],
      {
        cwd: BACKEND_ROOT,
        env: { ...process.env, NODE_ENV: 'production' },
        encoding: 'utf8',
      },
    );

    // Koruma ZAYIFLATILMADI: surec baslamadan cikiyor.
    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).toContain('refusing to run with NODE_ENV=production');
  });
});
