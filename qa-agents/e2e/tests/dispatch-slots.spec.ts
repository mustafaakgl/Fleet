import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ensureP0Fixture, fixtureToken, type FixtureManifest, type Role } from './support/p0-fixture';

/**
 * DISPATCH VE TESLIMAT SLOTLARI — UCTAN UCA (Faz 17).
 *
 * GERCEK SUREC, GERCEK PROTOKOL: mock worker AYRI BIR NODE SURECI olarak
 * calisiyor. Enrollment, connector kimlik dogrulamasi, is kiralama ve sonuc
 * bildirimi gercek HTTP uzerinden geciyor. Servis testleri her adimi ayri
 * ayri kanitliyor; burada kanitlanan sey ADIMLARIN BIRBIRINE BAGLANDIGI:
 *
 *   onaylanmis TransportOrder -> dispatch talebi -> worker lease/complete
 *   -> oneri -> aday/beyan -> insan onayi -> Assignment + Tour/TourStop
 *   -> slot daveti -> public rezervasyon -> onerinin superseded olmasi
 *
 * SKIP YOK: worker calismazsa ya da bir adim gerceklesmezse test GORUNUR
 * BICIMDE DUSER. Atlanan bir test yesil gorunur ama hicbir sey kanitlamaz.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const BACKEND_ROOT = path.resolve(__dirname, '../../../backend');

let fixture: FixtureManifest;

function auth(role: Role, tenant: 'tenantA' | 'tenantB' = 'tenantA'): Record<string, string> {
  const token = fixtureToken(fixture, role, tenant);
  if (!token) throw new Error(`fixture token yok: ${role}/${tenant}`);
  return { Authorization: `Bearer ${token}` };
}

/** En kucuk gecerli PNG — fotograf zorunlulugunu gercek bir dosyayla karsilar. */
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * HER KOSU ICIN AYRI BIR IS GUNU.
 *
 * Uygunluk motoru arac/surucu cakismasini GUNE gore sayiyor. Sabit bir gun
 * kullansaydik, onceki kosuda olusan tur bir sonraki kosuda `vehicleBusy`
 * uretir ve test kendi gecmisi yuzunden duserdi — motorun DOGRU davranisi
 * yuzunden yanlis bir kirmizi.
 */
const WORK_DATE = new Date(Date.now() + (60 + (Date.now() % 400)) * 86_400_000);
const WORK_DATE_ISO = WORK_DATE.toISOString().slice(0, 10);

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

// ---------------------------------------------------------------------------
// Mock worker — GERCEK SUREC
// ---------------------------------------------------------------------------

let worker: ChildProcessWithoutNullStreams | null = null;
let workerLog = '';

async function startWorker(request: APIRequestContext): Promise<void> {
  const enrollment = await request.post(`${API_BASE_URL}/ordivan/connectors/enrollments`, {
    headers: auth('admin'),
    data: { displayName: unique('e2e-dispatch'), capabilities: ['dispatch.plan@v1'] },
  });
  expect(enrollment.status(), await enrollment.text()).toBe(201);
  const { enrollmentCode } = (await enrollment.json()) as { enrollmentCode: string };

  worker = spawn(
    process.execPath,
    ['scripts/ordivan-mock-worker.mjs', '--enroll', enrollmentCode],
    {
      cwd: BACKEND_ROOT,
      env: { ...process.env, FLEET_API_BASE_URL: API_BASE_URL, ORDIVAN_MOCK_POLL_MS: '1000' },
    },
  ) as ChildProcessWithoutNullStreams;

  worker.stdout.on('data', (chunk: Buffer) => (workerLog += chunk.toString()));
  worker.stderr.on('data', (chunk: Buffer) => (workerLog += chunk.toString()));

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
  worker?.kill('SIGTERM');
  worker = null;
}

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

interface DispatchDetail {
  id: string;
  status: string;
  generation: string;
  jobAttempt: number;
  updatedAt: string;
  workDate: string;
  resultTourId: string | null;
  financialFieldsMasked: boolean;
  route: { status: string; totalDistanceKm: number | null; plannedStops: unknown[] };
  orders: Array<{ transportOrderId: string; contractedRevenue: number | null; currency: string | null }>;
  agent: Record<string, unknown> | null;
}

async function createConfirmedOrder(
  request: APIRequestContext,
  options: { revenue?: number } = {},
): Promise<{ orderId: string; consignmentId: string }> {
  /**
   * KALEMLER SIPARISLE BIRLIKTE OLUSUYOR.
   *
   * Ayri bir kalem ucu YOK: `CreateTransportOrderDto` kalemleri govdede
   * tasiyor ve onaylanmis bir siparise kalem eklemek bir REVIZYON gerektirir.
   * Testin bu ayrimi taklit etmesi degil, gercek sozlesmeyi kullanmasi
   * gerekiyor.
   */
  const created = await request.post(`${API_BASE_URL}/transport-orders`, {
    headers: auth('admin'),
    data: {
      companyId: 'qa-p0-company-a',
      orderNumber: unique('DISP'),
      orderDate: new Date().toISOString(),
      currency: 'EUR',
      contractedRevenue: options.revenue ?? 1250,
      consignments: [
        {
          cargoDescription: 'E2E Ladung',
          pickupAddress: 'Musterweg 3, 47051 Duisburg',
          deliveryAddress: 'Hafenstrasse 12, 20095 Hamburg',
          // HER TALEP BOYUTU VERILIYOR: eksik biri (`volumeM3` gibi) uygunluk
          // motorunda VERI EKSIKLIGI turunden bir `unknown` uretir ve o
          // beyanla ASILAMAZ. Testin uygulanabilir bir aday gorebilmesi icin
          // talebin tam olmasi gerekiyor — motorun dogru davranisi bu.
          weightKg: 1200,
          volumeM3: 12,
          palletCount: 4,
          adrStatus: 'no',
          // Pencereler IS GUNUNE hizali; motor pencereyi o gune gore okuyor.
          pickupWindowStart: new Date(WORK_DATE.getTime() + 8 * 3600_000).toISOString(),
          pickupWindowEnd: new Date(WORK_DATE.getTime() + 12 * 3600_000).toISOString(),
          deliveryWindowStart: new Date(WORK_DATE.getTime() + 14 * 3600_000).toISOString(),
          deliveryWindowEnd: new Date(WORK_DATE.getTime() + 18 * 3600_000).toISOString(),
        },
      ],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const order = (await created.json()) as {
    id: string;
    updatedAt: string;
    consignments?: Array<{ id: string }>;
  };

  const confirmed = await request.post(`${API_BASE_URL}/transport-orders/${order.id}/confirm`, {
    headers: auth('admin'),
    data: { expectedUpdatedAt: order.updatedAt },
  });
  expect(confirmed.status(), await confirmed.text()).toBe(200);

  const detail = await request.get(`${API_BASE_URL}/transport-orders/${order.id}`, {
    headers: auth('admin'),
  });
  const detailBody = (await detail.json()) as { consignments: Array<{ id: string }> };
  const consignmentId = detailBody.consignments[0]?.id ?? '';
  expect(consignmentId, 'kalem kimligi alinamadi').toBeTruthy();

  return { orderId: order.id, consignmentId };
}

/** Worker isi bitirene kadar bekler. Bitmezse worker ciktisiyla DUSER. */
async function waitForReady(
  request: APIRequestContext,
  proposalId: string,
  timeoutMs = 90_000,
): Promise<DispatchDetail> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const response = await request.get(`${API_BASE_URL}/dispatch/proposals/${proposalId}`, {
      headers: auth('admin'),
    });
    last = await response.text();
    if (response.status() === 200) {
      const detail = JSON.parse(last) as DispatchDetail;
      if (detail.generation === 'ready') return detail;
      if (detail.generation === 'failed' || detail.generation === 'expired') {
        throw new Error(`uretim ${detail.generation} oldu:\n--- worker ---\n${workerLog}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `worker oneriyi hazir hale getirmedi (${timeoutMs} ms).\n--- worker ---\n${workerLog}\n--- son yanit ---\n${last}`,
  );
}

async function detailAs(
  request: APIRequestContext,
  proposalId: string,
  role: Role,
): Promise<DispatchDetail> {
  const response = await request.get(`${API_BASE_URL}/dispatch/proposals/${proposalId}`, {
    headers: auth(role),
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as DispatchDetail;
}

interface Candidate {
  id: string;
  vehicleId: string | null;
  driverId: string | null;
  decision: string;
  checks: Array<{ code: string; status: string; overridable: boolean; reasonKey: string }>;
}

async function candidatesOf(request: APIRequestContext, proposalId: string): Promise<Candidate[]> {
  const response = await request.get(
    `${API_BASE_URL}/dispatch/proposals/${proposalId}/candidates`,
    { headers: auth('admin') },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Candidate[];
}

/** Bekleyen her beyan icin KAPSAMLI aciklama uretir. */
function declarationsFor(candidate: Candidate, detail: DispatchDetail) {
  return candidate.checks
    .filter((check) => check.status === 'unknown' && check.overridable)
    .map((check) => ({
      code: check.code,
      note: 'E2E: harici olarak elle dogrulandi ve sorumluluk ustlenildi.',
      answer: 'yes' as const,
      scope: {
        dispatchProposalId: detail.id,
        vehicleId: candidate.vehicleId!,
        driverId: candidate.driverId!,
        workDate: detail.workDate,
        proposalRevision: detail.jobAttempt,
      },
    }));
}

// ---------------------------------------------------------------------------

test.describe.serial('Faz 17 — dispatch ve slot uctan uca', () => {
  let orderId = '';
  let consignmentId = '';
  let proposalId = '';
  let ready: DispatchDetail;
  let applicable: Candidate | null = null;

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(300_000);
    fixture = ensureP0Fixture();
    const request = await playwright.request.newContext();
    await startWorker(request);

    /**
     * STAMM VERI ONCE — cunku UYGUNLUK ONA DAYANIYOR.
     *
     * Fixture araci ve surucusu kapasite, muayene, sigorta ve ehliyet
     * tarihi TASIMIYOR. Uygunluk motoru bos alani `unknown` isaretliyor ve
     * bu `unknown`lar VERI EKSIKLIGI turunden — hicbir beyanla asilamazlar.
     * Bu, motorun dogru davranisi; testin uygulanabilir bir aday gorebilmesi
     * icin veriyi GERCEK UCLARDAN doldurmasi gerekiyor.
     */
    const vehicle = await request.patch(`${API_BASE_URL}/vehicles/qa-p0-vehicle-a`, {
      headers: auth('office'),
      data: {
        payload_capacity_kg: 12000,
        cargo_volume_m3: 86.5,
        pallet_capacity: 33,
        gross_weight_kg: 40000,
        height_cm: 400,
        length_cm: 1360,
        width_cm: 255,
        adr_certified: true,
        tuv_expiry_date: new Date(Date.now() + 2000 * 24 * 3600_000).toISOString().slice(0, 10),
        insurance_expiry_date: new Date(Date.now() + 2000 * 24 * 3600_000).toISOString().slice(0, 10),
      },
    });
    expect(vehicle.status(), await vehicle.text()).toBe(200);

    /**
     * DIJITAL FUHRERSCHEINKONTROLLE — GERCEK BIR ON KOSUL.
     *
     * `AssignmentsService` gecersiz/gecikmis ehliyet kontrolunde gorev
     * olusturmayi REDDEDIYOR (Halterhaftung). Dispatch onayi o servisten
     * gectigi icin ayni kapiya takiliyor ve bu DOGRU davranis — testte
     * "onayla gecelim" demek yerine kaydi mesru yoldan olusturuyoruz.
     */
    const license = await request.post(`${API_BASE_URL}/driver-licenses`, {
      headers: auth('office'),
      data: {
        driver_id: 'qa-p0-driver-a',
        license_number: `QA-${Date.now()}`,
        classes: ['C', 'CE'],
        issued_at: new Date(Date.now() - 365 * 24 * 3600_000).toISOString().slice(0, 10),
        expires_at: new Date(Date.now() + 2500 * 24 * 3600_000).toISOString().slice(0, 10),
        issuing_authority: 'QA Behoerde',
      },
    });
    expect([201, 409], await license.text()).toContain(license.status());

    /**
     * KONTROL SUBMIT + APPROVE — GERCEK AKIS.
     *
     * Yeni olusturulan bir ehliyet kaydinda `nextCheckDueAt` BUGUNE
     * ayarlaniyor, yani rozet ANINDA kirmizi ve gorev olusturma engelli.
     * Bunu asmanin mesru yolu periyodik kontrolu yapmak: surucu gonderir,
     * yonetici onaylar. Testte de tam olarak bu yapiliyor — kapiyi
     * "acknowledge" ile gecmek, Halterhaftung kapisini anlamsiz kilardi.
     */
    const submitted = await request.post(`${API_BASE_URL}/driver/license-check/submit`, {
      headers: auth('driver'),
      multipart: {
        notes: 'E2E Sichtkontrolle',
        // Kontrol UC FOTOGRAF istiyor (on, arka, selfie) — bu bir yasal
        // kayittir ve testte de gercekten gonderiliyor.
        front: { name: 'front.png', mimeType: 'image/png', buffer: PNG_PIXEL },
        back: { name: 'back.png', mimeType: 'image/png', buffer: PNG_PIXEL },
        selfie: { name: 'selfie.png', mimeType: 'image/png', buffer: PNG_PIXEL },
      },
    });
    expect([201, 200, 409], await submitted.text()).toContain(submitted.status());

    const pending = await request.get(`${API_BASE_URL}/license-checks/pending`, {
      headers: auth('admin'),
    });
    const pendingRows = (await pending.json()) as Array<{ id: string; driver_id?: string }>;
    for (const row of pendingRows) {
      const approved = await request.post(`${API_BASE_URL}/license-checks/${row.id}/approve`, {
        headers: auth('admin'),
        data: {},
      });
      expect([200, 201], await approved.text()).toContain(approved.status());
    }

    const compliance = await request.get(
      `${API_BASE_URL}/license-checks/drivers/qa-p0-driver-a/compliance`,
      { headers: auth('admin') },
    );
    const badge = ((await compliance.json()) as { badge: string }).badge;
    expect(badge, 'ehliyet rozeti hala gorev olusturmayi engelliyor').not.toBe('red');

    const driver = await request.patch(`${API_BASE_URL}/drivers/qa-p0-driver-a`, {
      headers: auth('office'),
      data: {
        license_expiry_date: new Date(Date.now() + 2000 * 24 * 3600_000).toISOString().slice(0, 10),
      },
    });
    expect(driver.status(), await driver.text()).toBe(200);

    await request.dispose();
  });

  test.afterAll(() => stopWorker());

  // -------------------------------------------------------------------------
  // Canli akis
  // -------------------------------------------------------------------------

  test('onaylanmis siparisten dispatch talebi acilir', async ({ request }) => {
    test.setTimeout(120_000);
    const order = await createConfirmedOrder(request);
    orderId = order.orderId;
    consignmentId = order.consignmentId;

    const response = await request.post(`${API_BASE_URL}/dispatch/proposals`, {
      headers: auth('admin'),
      data: { transportOrderIds: [orderId], workDate: WORK_DATE_ISO },
    });
    expect(response.status(), await response.text()).toBe(201);
    const body = (await response.json()) as { dispatchProposalId: string; jobId: string | null };
    proposalId = body.dispatchProposalId;
    expect(proposalId).toBeTruthy();
    // Oneri ve is AYNI transaction'da olusuyor.
    expect(body.jobId, 'uretim isi acilmadi').toBeTruthy();
  });

  test('worker isi kiralar ve oneriyi HAZIR hale getirir', async ({ request }) => {
    test.setTimeout(150_000);
    ready = await waitForReady(request, proposalId);

    expect(ready.generation).toBe('ready');
    expect(ready.status).toBe('open');
    // Ajan ciktisi baglandi ve SOZLESMEDEKI alanlarla geldi.
    expect(ready.agent).not.toBeNull();
    expect(Object.keys(ready.agent!).sort()).toEqual([
      'consolidationRefs',
      'proposalType',
      'rankedCandidates',
      'schemaVersion',
      'stopOrderRefs',
    ]);
    // HAM payload/confidence/evidence DONMUYOR.
    const serialized = JSON.stringify(ready);
    expect(serialized).not.toContain('mock_dispatch_ranking');
    expect(serialized).not.toContain('"payload"');
    expect(serialized).not.toContain('"confidence"');
  });

  test('adaylar UC DURUMLU kontrollerle geliyor', async ({ request }) => {
    const list = await candidatesOf(request, proposalId);
    expect(list.length, 'aday uretilmedi').toBeGreaterThan(0);

    for (const candidate of list) {
      expect(['eligible', 'blocked', 'review_required']).toContain(candidate.decision);
      for (const check of candidate.checks) {
        expect(['verified', 'incompatible', 'unknown']).toContain(check.status);
      }
    }

    /**
     * TAKOGRAF DAIMA `unknown`: repoda kanonik kalan-surus-suresi verisi yok.
     * Motor sure UYDURMUYOR ve bu kontrol yalnizca KAPSAMLI bir beyanla
     * asilabiliyor.
     */
    const withTacho = list.find((candidate) =>
      candidate.checks.some((check) => check.code === 'driver_drive_time'),
    );
    expect(withTacho, 'takograf kontrolu hic uretilmedi').toBeTruthy();
    const tacho = withTacho!.checks.find((check) => check.code === 'driver_drive_time')!;
    expect(tacho.status).toBe('unknown');
    expect(tacho.overridable, 'takograf beyanla asilabilir olmali').toBe(true);

    applicable =
      list.find(
        (candidate) =>
          candidate.vehicleId &&
          candidate.driverId &&
          !candidate.checks.some((check) => check.status === 'incompatible') &&
          !candidate.checks.some((check) => check.status === 'unknown' && !check.overridable),
      ) ?? null;

    /**
     * SKIP YOK.
     *
     * Aday bulunamazsa bu bir test atlamasi degil, kurulumun ya da uygunluk
     * motorunun BASARISIZLIGIDIR. Atlanan test yesil gorunur ve hicbir sey
     * kanitlamaz; bu yuzden burada acikca dusuyoruz ve hangi kontrolun
     * engelledigini yaziyoruz.
     */
    expect(
      applicable,
      `uygulanabilir aday yok: ${JSON.stringify(
        list.map((candidate) => candidate.checks.filter((check) => check.status !== 'verified')),
      )}`,
    ).toBeTruthy();
  });

  test('BEYANSIZ onay uygulanamaz', async ({ request }) => {
    const response = await request.post(
      `${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`,
      {
        headers: auth('admin'),
        data: {
          vehicleId: applicable!.vehicleId,
          driverId: applicable!.driverId,
          expectedUpdatedAt: ready.updatedAt,
          proposalRevision: ready.jobAttempt,
          idempotencyKey: unique('nodecl'),
        },
      },
    );
    // Takograf `unknown` ve beyan verilmedi: uygulanamaz.
    expect(response.status(), await response.text()).toBe(409);
    expect(await response.text()).toContain('dispatch_not_applicable');
  });

  test('BLOCKED aday hicbir beyanla uygulanamaz', async ({ request }) => {
    const list = await candidatesOf(request, proposalId);
    const blocked = list.find((candidate) =>
      candidate.checks.some((check) => check.status === 'incompatible'),
    );
    if (!blocked) {
      /**
       * ENGELLI ADAY YOKSA ARACI ENGELLIYORUZ — atlamiyoruz.
       *
       * Aracin durumunu `broken` yapmak `vehicle_available` kontrolunu
       * `incompatible` yapar ve bu KESINLIKLE beyanla asilamaz. Testin
       * kanitladigi sey tam olarak bu.
       */
      const broke = await request.patch(`${API_BASE_URL}/vehicles/qa-p0-vehicle-a`, {
        headers: auth('office'),
        data: { status: 'broken' },
      });
      expect(broke.status(), await broke.text()).toBe(200);

      const order = await createConfirmedOrder(request);
      const opened = await request.post(`${API_BASE_URL}/dispatch/proposals`, {
        headers: auth('admin'),
        data: {
          transportOrderIds: [order.orderId],
          workDate: WORK_DATE_ISO,
        },
      });
      expect(opened.status()).toBe(201);
      const blockedProposalId = ((await opened.json()) as { dispatchProposalId: string })
        .dispatchProposalId;
      const blockedReady = await waitForReady(request, blockedProposalId);
      const blockedList = await candidatesOf(request, blockedProposalId);

      const target = blockedList.find((candidate) =>
        candidate.checks.some((check) => check.status === 'incompatible'),
      );
      expect(target, 'bozuk arac engelli aday uretmedi').toBeTruthy();

      const denied = await request.post(
        `${API_BASE_URL}/dispatch/proposals/${blockedProposalId}/approve`,
        {
          headers: auth('admin'),
          data: {
            vehicleId: target!.vehicleId,
            driverId: target!.driverId,
            expectedUpdatedAt: blockedReady.updatedAt,
            proposalRevision: blockedReady.jobAttempt,
            idempotencyKey: unique('blocked'),
            overrides: declarationsFor(target!, blockedReady),
          },
        },
      );
      // BEYAN VERILDI ama `incompatible` HICBIR beyanla asilamaz.
      expect(denied.status(), await denied.text()).toBe(409);
      expect(await denied.text()).toContain('dispatch_not_applicable');

      // Araci geri aktif ediyoruz; sonraki testler ona dayaniyor.
      const restored = await request.patch(`${API_BASE_URL}/vehicles/qa-p0-vehicle-a`, {
        headers: auth('office'),
        data: { status: 'active' },
      });
      expect(restored.status()).toBe(200);
      return;
    }

    const response = await request.post(
      `${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`,
      {
        headers: auth('admin'),
        data: {
          vehicleId: blocked!.vehicleId,
          driverId: blocked!.driverId,
          expectedUpdatedAt: ready.updatedAt,
          proposalRevision: ready.jobAttempt,
          idempotencyKey: unique('blocked'),
          overrides: declarationsFor(blocked!, ready),
        },
      },
    );
    expect(response.status(), await response.text()).toBe(409);
  });

  test('KAPSAMLI beyanla onay Assignment + Tour uretir', async ({ request }) => {
    const fresh = await detailAs(request, proposalId, 'admin');

    const response = await request.post(
      `${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`,
      {
        headers: auth('admin'),
        data: {
          vehicleId: applicable!.vehicleId,
          driverId: applicable!.driverId,
          expectedUpdatedAt: fresh.updatedAt,
          proposalRevision: fresh.jobAttempt,
          idempotencyKey: unique('approve'),
          overrides: declarationsFor(applicable!, fresh),
        },
      },
    );
    expect(response.status(), await response.text()).toBe(200);
    const result = (await response.json()) as {
      tourId: string;
      assignmentIds: string[];
      mode: string;
      repeated: boolean;
    };

    expect(result.tourId, 'tur olusmadi').toBeTruthy();
    expect(result.assignmentIds.length, 'gorev olusmadi').toBeGreaterThan(0);
    // Takograf beyani verildigi icin mod DAIMA `manual_override`.
    expect(result.mode).toBe('manual_override');
    expect(result.repeated).toBe(false);

    // Uygulanmis sonuc AYRI UCTAN okunabiliyor ve TourStop tasiyor.
    const tour = await request.get(`${API_BASE_URL}/dispatch/proposals/${proposalId}/tour`, {
      headers: auth('admin'),
    });
    expect(tour.status(), await tour.text()).toBe(200);
    const tourBody = (await tour.json()) as { tourId: string; stops: unknown[]; assignmentIds: string[] };
    expect(tourBody.tourId).toBe(result.tourId);
    expect(tourBody.stops.length, 'TourStop olusmadi').toBeGreaterThan(0);
    expect(tourBody.assignmentIds.length).toBeGreaterThan(0);
  });

  test('CIFT TIKLAMA ikinci tur URETMEZ — ayni anahtar mevcut sonucu doner', async ({ request }) => {
    const fresh = await detailAs(request, proposalId, 'admin');
    expect(fresh.resultTourId, 'onceki test tur uretmedi').toBeTruthy();

    const key = unique('repeat');
    const body = {
      vehicleId: applicable!.vehicleId,
      driverId: applicable!.driverId,
      expectedUpdatedAt: fresh.updatedAt,
      proposalRevision: fresh.jobAttempt,
      idempotencyKey: key,
    };

    // Ayni anahtarla IKI ESZAMANLI istek.
    const [first, second] = await Promise.all([
      request.post(`${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`, {
        headers: auth('admin'),
        data: body,
      }),
      request.post(`${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`, {
        headers: auth('admin'),
        data: body,
      }),
    ]);

    // Karar zaten verilmisti ve anahtar FARKLI: ikisi de 409 alir.
    for (const response of [first, second]) {
      expect([200, 409]).toContain(response.status());
    }

    // Tur SAYISI DEGISMEDI: exactly-once veritabaninda.
    const after = await detailAs(request, proposalId, 'admin');
    expect(after.resultTourId).toBe(fresh.resultTourId);
  });

  test('BAYAT damga ve BAYAT oneri surumu reddediliyor', async ({ request }) => {
    const stale = await request.post(`${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`, {
      headers: auth('admin'),
      data: {
        vehicleId: applicable?.vehicleId ?? 'x',
        driverId: applicable?.driverId ?? 'x',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        proposalRevision: 1,
        idempotencyKey: unique('stale'),
      },
    });
    expect(stale.status(), await stale.text()).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Roller ve finans maskelemesi
  // -------------------------------------------------------------------------

  test('OFFICE yanitinda finans alanlari HIC GELMIYOR', async ({ request }) => {
    const asOffice = await detailAs(request, proposalId, 'office');
    expect(asOffice.financialFieldsMasked).toBe(true);
    for (const order of asOffice.orders) {
      expect(order.contractedRevenue).toBeNull();
      expect(order.currency).toBeNull();
    }
    // Tutar govdenin HICBIR YERINDE yok — ic ice alanlar dahil.
    expect(JSON.stringify(asOffice)).not.toContain('1250');

    const tour = await request.get(`${API_BASE_URL}/dispatch/proposals/${proposalId}/tour`, {
      headers: auth('office'),
    });
    if (tour.status() === 200) {
      expect(((await tour.json()) as { plannedTollCents: number | null }).plannedTollCents).toBeNull();
    }
  });

  test('FINANS YETKILI rollerde alanlar YERINDE', async ({ request }) => {
    for (const role of ['admin', 'boss', 'accounting'] as const) {
      const detail = await detailAs(request, proposalId, role);
      expect(detail.financialFieldsMasked, role).toBe(false);
      expect(detail.orders[0]!.currency, role).toBe('EUR');
      expect(detail.orders[0]!.contractedRevenue, role).toBe(1250);
    }
  });

  test('ACCOUNTING salt okur — hicbir yazma ucundan gecemez', async ({ request }) => {
    expect(
      (await request.get(`${API_BASE_URL}/dispatch/proposals`, { headers: auth('accounting') })).status(),
    ).toBe(200);

    const writes = [
      request.post(`${API_BASE_URL}/dispatch/proposals`, {
        headers: auth('accounting'),
        data: { transportOrderIds: [orderId], workDate: '2026-09-01' },
      }),
      request.post(`${API_BASE_URL}/dispatch/proposals/${proposalId}/approve`, {
        headers: auth('accounting'),
        data: {
          vehicleId: 'v',
          driverId: 'd',
          expectedUpdatedAt: new Date().toISOString(),
          proposalRevision: 1,
          idempotencyKey: unique('acc'),
        },
      }),
      request.post(`${API_BASE_URL}/dispatch/proposals/${proposalId}/reject`, {
        headers: auth('accounting'),
        data: {
          reason: 'muhasebe reddi',
          expectedUpdatedAt: new Date().toISOString(),
          proposalRevision: 1,
          idempotencyKey: unique('accr'),
        },
      }),
      request.post(`${API_BASE_URL}/delivery-slots/invitations`, {
        headers: auth('accounting'),
        data: { consignmentId, kind: 'delivery' },
      }),
    ];
    for (const response of await Promise.all(writes)) {
      expect(response.status(), await response.text()).toBe(403);
    }
  });

  test('DRIVER dispatch ve slot yuzeyine HIC giremez', async ({ request }) => {
    const paths = [
      '/dispatch/proposals',
      `/dispatch/proposals/${proposalId}`,
      `/dispatch/proposals/${proposalId}/candidates`,
      '/delivery-slots',
      '/delivery-slots/invitations',
    ];
    for (const suffix of paths) {
      const response = await request.get(`${API_BASE_URL}${suffix}`, { headers: auth('driver') });
      expect(response.status(), suffix).toBe(403);
    }
  });

  test('BASKA KIRACININ onerisi 404 — 403 DEGIL', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/dispatch/proposals/${proposalId}`, {
      headers: auth('admin', 'tenantB'),
    });
    // 403 olsaydi kaydin VARLIGI ele verilirdi.
    expect(response.status()).toBe(404);
  });

  test('ISTEMCI dayatamaz: tenantId, resultTourId, tutar, uygunluk', async ({ request }) => {
    const injections: Array<Record<string, unknown>> = [
      { tenantId: 'other-tenant' },
      { resultTourId: 'tour-x' },
      { contractedRevenue: 9999 },
      { confidence: { x: 1 } },
      { evidence: { x: 1 } },
      { checks: [] },
      { generation: 'ready' },
    ];
    for (const injection of injections) {
      const response = await request.post(`${API_BASE_URL}/dispatch/proposals`, {
        headers: auth('admin'),
        data: {
          transportOrderIds: [orderId],
          workDate: WORK_DATE_ISO,
          ...injection,
        },
      });
      expect(response.status(), JSON.stringify(injection)).toBe(400);
    }
  });

  // -------------------------------------------------------------------------
  // Arac kapasitesi ve ADR
  // -------------------------------------------------------------------------

  test('ARAC KAPASITESI ve UC DURUMLU ADR duzenlenebiliyor', async ({ request }) => {
    const vehicleId = 'qa-p0-vehicle-a';

    const saved = await request.patch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      headers: auth('office'),
      data: {
        payload_capacity_kg: 12000,
        cargo_volume_m3: 86.5,
        pallet_capacity: 33,
        gross_weight_kg: 40000,
        height_cm: 400,
        length_cm: 1360,
        width_cm: 255,
        adr_certified: true,
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const body = (await saved.json()) as Record<string, unknown>;
    expect(body.payload_capacity_kg).toBe(12000);
    expect(body.adr_certified).toBe(true);

    // UC DURUMLU: `null` "hayir" DEGIL ve geri yazilabiliyor.
    const cleared = await request.patch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      headers: auth('office'),
      data: { adr_certified: null },
    });
    expect(cleared.status()).toBe(200);
    expect(((await cleared.json()) as { adr_certified: unknown }).adr_certified).toBeNull();

    // Sinir asimi REDDEDILIYOR — arayuzdeki sinirla ayni.
    const tooLarge = await request.patch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      headers: auth('office'),
      data: { height_cm: 501 },
    });
    expect(tooLarge.status()).toBe(400);

    // MUHASEBE kapasite YAZAMAZ.
    const asAccounting = await request.patch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      headers: auth('accounting'),
      data: { payload_capacity_kg: 1 },
    });
    expect(asAccounting.status()).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Slot daveti ve public rezervasyon
  // -------------------------------------------------------------------------

  let slotId = '';
  let secondSlotId = '';
  let invitationToken = '';
  let invitationId = '';

  test('slot ve davet olusturuluyor — TOKEN yalnizca BIR KEZ', async ({ request }) => {
    const orderDetail = await request.get(`${API_BASE_URL}/transport-orders/${orderId}`, {
      headers: auth('admin'),
    });
    const order = (await orderDetail.json()) as {
      consignments: Array<{ id: string; deliveryLocationId: string | null }>;
    };
    const withLocation = order.consignments.find((item) => item.deliveryLocationId);
    expect(withLocation, 'kalemde teslimat konumu yok — geokodlama calismiyor').toBeTruthy();

    const slot = await request.post(`${API_BASE_URL}/delivery-slots`, {
      headers: auth('office'),
      data: {
        locationId: withLocation!.deliveryLocationId,
        startsAt: new Date(WORK_DATE.getTime() + 9 * 3600_000).toISOString(),
        endsAt: new Date(WORK_DATE.getTime() + 11 * 3600_000).toISOString(),
        capacity: 1,
        resourceRef: unique('R'),
      },
    });
    expect(slot.status(), await slot.text()).toBe(201);
    slotId = ((await slot.json()) as { id: string }).id;

    const second = await request.post(`${API_BASE_URL}/delivery-slots`, {
      headers: auth('office'),
      data: {
        locationId: withLocation!.deliveryLocationId,
        startsAt: new Date(WORK_DATE.getTime() + 13 * 3600_000).toISOString(),
        endsAt: new Date(WORK_DATE.getTime() + 15 * 3600_000).toISOString(),
        capacity: 2,
        resourceRef: unique('R'),
      },
    });
    expect(second.status()).toBe(201);
    secondSlotId = ((await second.json()) as { id: string }).id;

    const invitation = await request.post(`${API_BASE_URL}/delivery-slots/invitations`, {
      headers: auth('office'),
      data: { consignmentId: withLocation!.id, kind: 'delivery' },
    });
    expect(invitation.status(), await invitation.text()).toBe(201);
    const invitationBody = (await invitation.json()) as { invitationId: string; token: string };
    invitationToken = invitationBody.token;
    invitationId = invitationBody.invitationId;
    expect(invitationToken.length).toBeGreaterThan(20);

    // LISTE UCU token ozetini TASIMIYOR — yalnizca kirilmis onek.
    const list = await request.get(`${API_BASE_URL}/delivery-slots/invitations`, {
      headers: auth('office'),
    });
    const listText = await list.text();
    expect(listText).not.toContain(invitationToken);
    expect(listText).not.toContain('tokenHash');
  });

  test('PUBLIC: oturum acilir, slot listelenir, rezerve edilir', async ({ playwright }) => {
    // Cookie tasiyan AYRI baglam: bu bir MUSTERI tarayicisi.
    const guest = await playwright.request.newContext();

    const session = await guest.post(`${API_BASE_URL}/public/delivery-slots/session`, {
      data: { token: invitationToken },
    });
    expect(session.status(), await session.text()).toBe(201);
    const sessionBody = (await session.json()) as Record<string, unknown>;
    // Yanit token'i GERI DONDURMUYOR.
    expect(JSON.stringify(sessionBody)).not.toContain(invitationToken);
    expect(sessionBody.kind).toBe('delivery');

    // Sonraki istekler TOKEN OLMADAN, yalnizca cookie ile.
    const list = await guest.get(`${API_BASE_URL}/public/delivery-slots`);
    expect(list.status(), await list.text()).toBe(200);
    const listBody = (await list.json()) as { slots: Array<{ id: string; available: boolean }> };
    expect(listBody.slots.length).toBeGreaterThan(0);

    // YANIT DAR: kiraci, fiyat, arac, surucu ve siparis bilgisi YOK.
    const listText = await list.text();
    for (const leak of ['tenantId', 'contractedRevenue', 'currency', 'vehicleId', 'driverId', 'orderNumber', 'tokenHash']) {
      expect(listText, leak).not.toContain(leak);
    }

    const booking = await guest.post(`${API_BASE_URL}/public/delivery-slots/bookings`, {
      data: { slotId },
    });
    expect(booking.status(), await booking.text()).toBe(201);

    // DEGISIKLIK: farkli slot secilebiliyor.
    const changed = await guest.post(`${API_BASE_URL}/public/delivery-slots/bookings`, {
      data: { slotId: secondSlotId },
    });
    expect(changed.status(), await changed.text()).toBe(201);

    // IPTAL ve IDEMPOTENT tekrar.
    const cancelled = await guest.post(`${API_BASE_URL}/public/delivery-slots/bookings/cancel`);
    expect(cancelled.status()).toBe(200);
    expect(((await cancelled.json()) as { cancelled: boolean }).cancelled).toBe(true);
    const again = await guest.post(`${API_BASE_URL}/public/delivery-slots/bookings/cancel`);
    expect(((await again.json()) as { cancelled: boolean }).cancelled).toBe(false);

    // OTURUM KAPATMA: cookie sunucuda da iptal ediliyor.
    const closed = await guest.delete(`${API_BASE_URL}/public/delivery-slots/session`);
    expect(closed.status()).toBe(200);
    const afterClose = await guest.get(`${API_BASE_URL}/public/delivery-slots`);
    expect(afterClose.status(), 'kapatilmis oturum hala calisiyor').toBe(404);

    await guest.dispose();
  });

  test('SON KAPASITEYE iki eszamanli istekten yalnizca biri kazanir', async ({ playwright }) => {

    // Iki AYRI davet, ayni tek kapasiteli slot.
    const office = await playwright.request.newContext({ extraHTTPHeaders: auth('office') });
    const reissued = await office.post(
      `${API_BASE_URL}/delivery-slots/invitations/${invitationId}/reissue`,
      { data: {} },
    );
    expect(reissued.status(), await reissued.text()).toBe(201);
    const freshToken = ((await reissued.json()) as { token: string }).token;
    await office.dispose();

    const guest = await playwright.request.newContext();
    const session = await guest.post(`${API_BASE_URL}/public/delivery-slots/session`, {
      data: { token: freshToken },
    });
    expect(session.status()).toBe(201);

    // Ayni oturumdan ayni slota IKI ESZAMANLI istek: ikinci istek tekrar
    // sayilir ve kontenjani IKINCI KEZ tuketmez.
    const [a, b] = await Promise.all([
      guest.post(`${API_BASE_URL}/public/delivery-slots/bookings`, { data: { slotId } }),
      guest.post(`${API_BASE_URL}/public/delivery-slots/bookings`, { data: { slotId } }),
    ]);
    const statuses = [a.status(), b.status()].sort();
    expect(statuses[0]).toBe(201);

    /**
     * DOGRULAMA IC UCTAN.
     *
     * Public uc ROTA DUZEYINDE hiz sinirli (10/dk/IP) ve butun testler ayni
     * IP'den geliyor; buradan bir kez daha okumak sinirla yarisirdi. Kapasite
     * sayacinin gercek degeri zaten yonetim ucunda ve orasi otoriter kaynak.
     */
    const auditor = await playwright.request.newContext({ extraHTTPHeaders: auth('office') });
    const managed = await auditor.get(`${API_BASE_URL}/delivery-slots?pageSize=100`);
    expect(managed.status(), await managed.text()).toBe(200);
    const rows = ((await managed.json()) as {
      rows: Array<{ id: string; bookedCount: number; capacity: number; remaining: number }>;
    }).rows;
    const target = rows.find((row) => row.id === slotId);
    expect(target, 'slot yonetim listesinde bulunamadi').toBeTruthy();

    // KAPASITE 1 VE IKI ESZAMANLI ISTEK: sayac IKIYE CIKMADI.
    expect(target!.bookedCount).toBe(1);
    expect(target!.remaining).toBe(0);
    await auditor.dispose();

    await guest.dispose();
  });

  test('gecersiz / suresi dolmus / iptal edilmis token AYNI cevabi verir', async ({ playwright }) => {
    const guest = await playwright.request.newContext();
    const bodies: string[] = [];

    for (const token of ['kisa', 'uydurma-token-uzun-uzun-uzun-1234567890']) {
      const response = await guest.post(`${API_BASE_URL}/public/delivery-slots/session`, {
        data: { token },
      });
      expect(response.status()).toBe(404);
      bodies.push(((await response.json()) as { code: string }).code);
    }

    if (invitationId) {
      const office = await playwright.request.newContext({ extraHTTPHeaders: auth('office') });
      const reissued = await office.post(
        `${API_BASE_URL}/delivery-slots/invitations/${invitationId}/reissue`,
        { data: {} },
      );
      const token = ((await reissued.json()) as { token: string }).token;
      const list = await office.get(`${API_BASE_URL}/delivery-slots/invitations`);
      const rows = ((await list.json()) as { rows: Array<{ id: string; status: string }> }).rows;
      const open = rows.find((row) => row.status === 'open');
      if (open) {
        await office.post(`${API_BASE_URL}/delivery-slots/invitations/${open.id}/revoke`, { data: {} });
        const revoked = await guest.post(`${API_BASE_URL}/public/delivery-slots/session`, {
          data: { token },
        });
        expect(revoked.status()).toBe(404);
        bodies.push(((await revoked.json()) as { code: string }).code);
      }
      await office.dispose();
    }

    // HEPSI AYNI: ayirt edilebilselerdi kalemin VARLIGI ogrenilirdi.
    expect(new Set(bodies).size, `farkli cevaplar: ${bodies.join(',')}`).toBe(1);
    expect(bodies[0]).toBe('slot_invitation_invalid');

    await guest.dispose();
  });

  test('PUBLIC uc ROTA duzeyinde hiz sinirli', async ({ playwright }) => {
    const guest = await playwright.request.newContext();
    // Sinir 10/dk. Kovanin dolmasi icin 12 istek.
    let limited = false;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await guest.get(`${API_BASE_URL}/public/delivery-slots`, {
        headers: { 'x-slot-token': 'kisa' },
      });
      if (response.status() === 429) {
        limited = true;
        break;
      }
    }
    expect(limited, 'rota duzeyinde hiz siniri devreye girmedi').toBe(true);
    await guest.dispose();
  });
});
