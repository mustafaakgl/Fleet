import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * SIPARIS GELEN KUTUSU — API E2E (Faz 16).
 *
 * GERCEK BACKEND: burada mock yok. Olculen sey, servis testlerinin
 * kanitlayamadigi kisim — guard'lar, DTO dogrulamasi ve maskelemenin
 * GERCEK HTTP yanitinda tutup tutmadigi. Bir alani ekranda gizlemek degil,
 * `curl` ile cagiran birine ne dondugu onemli.
 *
 * Kimlik bilgileri ortamdan okunuyor (`prisma db seed` ayni degerleri
 * kullaniyor); testin icine sabit parola YAZILMIYOR.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

const CREDENTIALS = {
  admin: { email: 'admin@fleet.com', password: process.env.SEED_ADMIN_PASSWORD },
  office: { email: 'office@fleet.com', password: process.env.SEED_OFFICE_PASSWORD },
  accounting: { email: 'accounting@fleet.com', password: process.env.SEED_ACCOUNTING_PASSWORD },
  driver: { email: 'driver@fleet.com', password: process.env.SEED_DRIVER_PASSWORD },
} as const;

type Role = keyof typeof CREDENTIALS;

const CRLF = '\r\n';

/** Fiyat TASIYAN sentetik bir tasima emri e-postasi. */
function buildEml(options: { messageId: string; subject?: string; body?: string[] }): Buffer {
  const headers = [
    'From: "Spedition Muster GmbH" <dispo@muster.example>',
    'To: auftrag@fleet.example',
    `Subject: ${options.subject ?? 'Transportauftrag E2E-0001'}`,
    'Date: Tue, 01 Sep 2026 09:15:00 +0200',
    `Message-ID: <${options.messageId}@e2e.example>`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  const body = options.body ?? [
    'Kundennummer: 10042',
    'Referenz: E2E-0001',
    'Ladestelle: Musterweg 3, 47051 Duisburg',
    'Entladestelle: Hafenstrasse 12, 20095 Hamburg',
    'Ladung: Maschinenteile',
    'ADR: nein',
    'Frachtpreis: 1.250,00 EUR',
  ];
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
   *
   * Giris ucu 60 saniyede 5 denemeye siniri (`@Throttle`) ve bu bir URUN
   * DAVRANISI. Testi gecirmek icin onu kapatmak, korumayi test ortaminda
   * olmayan bir sey haline getirirdi; dogrusu testin sinira uymasi.
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

async function upload(request: APIRequestContext, token: string, messageId: string) {
  return request.post(`${API_BASE_URL}/order-intake/uploads`, {
    headers: auth(token),
    multipart: {
      file: {
        name: `${messageId}.eml`,
        mimeType: 'message/rfc822',
        buffer: buildEml({ messageId }),
      },
    },
  });
}

test.describe.serial('Faz 16 — siparis gelen kutusu API', () => {
  const tokens: Partial<Record<Role, string>> = {};
  let messageId = '';
  const uniqueId = `e2e-${Date.now()}`;

  test.beforeAll(async ({ playwright }) => {
    // Giris throttle'i 60 saniyelik bir pencere kullaniyor; art arda kosulan
    // bir sette beklemek gerekebilir. Varsayilan 30 sn'lik hook siniri buna
    // yetmiyor — sinir uzatiliyor, KORUMA kapatilmiyor.
    test.setTimeout(180_000);

    const request = await playwright.request.newContext();
    for (const role of Object.keys(CREDENTIALS) as Role[]) {
      tokens[role] = await login(request, role);
    }
    await request.dispose();
  });

  test('EML yuklemesi mesaj olusturuyor', async ({ request }) => {
    const response = await upload(request, tokens.admin!, uniqueId);
    expect(response.status(), await response.text()).toBe(201);

    const body = (await response.json()) as { messageId: string; duplicate: boolean };
    expect(body.duplicate).toBe(false);
    expect(body.messageId).toBeTruthy();
    messageId = body.messageId;
  });

  test('AYNI mesaj ikinci kez YENI kayit ACMIYOR', async ({ request }) => {
    const response = await upload(request, tokens.admin!, uniqueId);
    expect(response.status()).toBe(201);

    const body = (await response.json()) as { messageId: string; duplicate: boolean };
    expect(body.duplicate).toBe(true);
    expect(body.messageId).toBe(messageId);
  });

  test('liste NIYETE gore filtreleniyor', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages?intent=new_order`, {
      headers: auth(tokens.admin!),
    });
    expect(response.status(), await response.text()).toBe(200);

    const body = (await response.json()) as { items: Array<{ id: string }>; total: number };
    expect(Array.isArray(body.items)).toBe(true);

    // Gecersiz niyet DTO'da reddediliyor — serbest metin filtre olamaz.
    const invalid = await request.get(`${API_BASE_URL}/order-intake/messages?intent=approve`, {
      headers: auth(tokens.admin!),
    });
    expect(invalid.status()).toBe(400);
  });

  test('SURUCU hicbir uca erisemiyor', async ({ request }) => {
    for (const path of [
      '/order-intake/messages',
      `/order-intake/messages/${messageId}`,
      `/order-intake/messages/${messageId}/raw`,
    ]) {
      const response = await request.get(`${API_BASE_URL}${path}`, { headers: auth(tokens.driver!) });
      expect(response.status(), `${path} surucuye acik`).toBe(403);
    }

    const upload = await request.post(`${API_BASE_URL}/order-intake/uploads`, {
      headers: auth(tokens.driver!),
      multipart: { file: { name: 'x.eml', mimeType: 'message/rfc822', buffer: buildEml({ messageId: 'x' }) } },
    });
    expect(upload.status()).toBe(403);
  });

  test('KIMLIK DOGRULAMASIZ istek reddediliyor', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/order-intake/messages`);
    expect(response.status()).toBe(401);
  });

  test('OFISTE finansal alanlar MASKELENIYOR, muhasebede goruntuleniyor', async ({ request }) => {
    const officeResponse = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.office!),
    });
    expect(officeResponse.status(), await officeResponse.text()).toBe(200);
    const office = (await officeResponse.json()) as Record<string, unknown>;

    // Fiyat tasiyan mesajda ham belge ofise KAPALI.
    expect(office.rawDocumentAvailable).toBe(false);

    const officeRaw = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}/raw`, {
      headers: auth(tokens.office!),
    });
    expect(officeRaw.status()).toBe(403);

    // Maskelenmis yanitin HICBIR yerinde tutar metni gecmemeli.
    expect(JSON.stringify(office)).not.toContain('1.250,00');

    const accountingResponse = await request.get(
      `${API_BASE_URL}/order-intake/messages/${messageId}`,
      { headers: auth(tokens.accounting!) },
    );
    expect(accountingResponse.status()).toBe(200);
    const accounting = (await accountingResponse.json()) as { rawDocumentAvailable: boolean };
    expect(accounting.rawDocumentAvailable).toBe(true);
  });

  test('red SEBEPSIZ yapilamiyor', async ({ request }) => {
    const detail = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.admin!),
    });
    const body = (await detail.json()) as { review: { id: string } | null };
    test.skip(!body.review, 'inceleme henuz acilmadi (cikarim isi kosulmamis)');

    const response = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${body.review!.id}/reject`,
      { headers: auth(tokens.admin!), data: { reason: 'x' } },
    );
    expect(response.status()).toBe(400);
  });

  test('AJANIN gonderdigi kimlik ve durum alanlari DTO`da reddediliyor', async ({ request }) => {
    const detail = await request.get(`${API_BASE_URL}/order-intake/messages/${messageId}`, {
      headers: auth(tokens.admin!),
    });
    const body = (await detail.json()) as { review: { id: string } | null };
    test.skip(!body.review, 'inceleme henuz acilmadi (cikarim isi kosulmamis)');

    // `unknown` bir niyet ONAYLANAMAZ — DTO listesinde bile yok.
    const response = await request.post(
      `${API_BASE_URL}/order-intake/reviews/${body.review!.id}/approve`,
      { headers: auth(tokens.admin!), data: { intent: 'unknown' } },
    );
    expect(response.status()).toBe(400);
  });
});
