import { ensureP0Fixture, fixtureToken, type FixtureManifest } from './support/p0-fixture';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Yakit fisi OCR akisi — uctan uca, MOCK saglayici ile.
 *
 * DETERMINISTIK: gercek Azure'a CIKILMIYOR. Mock saglayici dosya adindaki
 * ipucuna gore sabit bir fixture donduruyor, dolayisiyla "OCR ne okudu"
 * sorusunun cevabi her kosuda ayni.
 *
 * SINANAN SEY: OCR'in hicbir kaydi kendiliginden gondermedigi ve
 * onaylamadigi, karma fiste yalnizca yakit satirinin onerildigi, OCR
 * basarisiz olsa bile manuel akisin tam calistigi ve yeniden denemenin
 * sahiplik + durum kapilarini gectigi.
 */

const API = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

/** Her kosuda FARKLI baytlar: `receiptFileHash` tekilligi testi tek kullanimlik yapmasin. */
function jpegBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    Buffer.from(`ocr-e2e-${Date.now()}-${Math.random()}`),
    Buffer.from([0xff, 0xd9]),
  ]);
}

async function upload(request: APIRequestContext, token: string, name: string) {
  const response = await request.post(`${API}/driver/fuel-receipts`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { receipt: { name, mimeType: 'image/jpeg', buffer: jpegBytes() } },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function analyze(request: APIRequestContext, token: string, id: string) {
  const response = await request.post(`${API}/driver/fuel-receipts/${id}/analyze`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test.describe.serial('Tankbeleg-OCR', () => {
  let fixture: FixtureManifest;
  let driverToken: string;
  let accountingToken: string;

  test.beforeAll(async ({ request }) => {
    fixture = ensureP0Fixture();
    driverToken = fixtureToken(fixture, 'driver')!;
    accountingToken = fixtureToken(fixture, 'accounting')!;

    // Surucu fis akisi arac cozemeden calismaz.
    const adminToken = fixtureToken(fixture, 'admin')!;
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const vehicles = await (await request.get(`${API}/vehicles`, { headers: adminAuth })).json();
    const vehicle = (vehicles.data ?? vehicles)[0];
    const drivers = await (await request.get(`${API}/drivers`, { headers: adminAuth })).json();
    const driver = (drivers.data ?? drivers)[0];
    await request.patch(`${API}/vehicles/${vehicle.id}`, {
      headers: adminAuth,
      data: { current_driver_id: driver.id },
    });
  });

  test('OCR alanlari DOLDURUR ama kaydi kendiliginden GONDERMEZ', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'diesel-beleg.jpg');

    // 1) Yukleme sonrasi OCR HENUZ calismamis olmali — sayfa acilisi
    //    kendiliginden analiz tetiklememeli.
    expect(uploaded.ocrStatus).toBe('not_requested');
    expect(uploaded.workflowStatus).toBe('driver_review');

    // 2) Acik aksiyonla analiz.
    const analysed = await analyze(request, driverToken, uploaded.id);
    expect(analysed.ocrStatus).toBe('succeeded');
    expect(analysed.ocrExtraction).toBeTruthy();
    expect(analysed.ocrExtraction.fuelProduct.value).toBe('DIESEL');
    expect(analysed.ocrExtraction.liters.value).toBeGreaterThan(0);

    // 3) OCR SONRASI kayit HALA surucude: gonderilmedi, onaylanmadi.
    expect(analysed.workflowStatus).toBe('driver_review');

    // 4) Muhasebe kuyrugunda GORUNMEZ.
    const queue = await (
      await request.get(`${API}/fleet/fuel-receipts?status=submitted`, {
        headers: { Authorization: `Bearer ${accountingToken}` },
      })
    ).json();
    expect(
      (queue.rows as Array<{ id: string }>).some((row) => row.id === uploaded.id),
      'surucu onaylamadan kuyruga girmemeli',
    ).toBe(false);
  });

  test('surucu OCR degerini DUZELTEBILIR ve acik onayla gonderir', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'diesel-beleg.jpg');
    const analysed = await analyze(request, driverToken, uploaded.id);
    const suggested = analysed.ocrExtraction.fuelGrossAmount.value as number;

    // Surucu OCR'in onerdiginden FARKLI bir tutar giriyor.
    const corrected = suggested + 5;
    const confirmed = await request.put(`${API}/driver/fuel-receipts/${uploaded.id}/confirm`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        purchasedAt: new Date().toISOString(),
        fuelProduct: 'DIESEL',
        liters: 40,
        fuelGrossAmount: corrected,
        currency: 'EUR',
        acknowledgeFuelMismatch: true,
      },
    });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    const receipt = (await confirmed.json()).receipt;

    // Surucunun degeri kazanir; OCR onerisi UZERINE YAZMAZ.
    expect(receipt.workflowStatus).toBe('submitted');
    expect(Number(receipt.fuelGrossAmount)).toBe(corrected);

    // Onaya kadar maliyete GIRMEZ: kayit `submitted`, yani muhasebe kuyrugunda
    // ama henuz onayli degil. (Filo toplami karsilastirilmiyor — paralel
    // spec'ler ayni kiracida veri uretiyor.)
    expect(receipt.workflowStatus).not.toBe('approved');
  });

  test('KARMA fiste yalnizca yakit satiri onerilir', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'mixed-beleg.jpg');
    const analysed = await analyze(request, driverToken, uploaded.id);

    const extraction = analysed.ocrExtraction;
    expect(extraction.hasNonFuelItems).toBe(true);
    // Kasada odenen genel toplam, araca yazilacak yakit tutarindan BUYUK.
    expect(extraction.receiptGrossAmount.value).toBeGreaterThan(extraction.fuelGrossAmount.value);
    // Arayuzun araca onerecegi deger YAKIT satiridir.
    expect(extraction.fuelGrossAmount.value).toBe(88.4);
  });

  test('OCR BASARISIZ olsa bile manuel akis tam calisir', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'failure-beleg.jpg');
    const analysed = await analyze(request, driverToken, uploaded.id);

    expect(analysed.ocrStatus).toBe('failed');
    expect(analysed.ocrErrorClass).toBeTruthy();
    // Teknik saglayici mesaji DEGIL, siniflandirilmis bir deger.
    expect(String(analysed.ocrErrorClass)).not.toContain('Error');

    // Fis KAYBOLMAZ; surucu elle doldurup gonderebilir.
    const confirmed = await request.put(`${API}/driver/fuel-receipts/${uploaded.id}/confirm`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        purchasedAt: new Date().toISOString(),
        fuelProduct: 'DIESEL',
        liters: 30,
        fuelGrossAmount: 52.5,
        currency: 'EUR',
        acknowledgeFuelMismatch: true,
      },
    });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    expect((await confirmed.json()).receipt.workflowStatus).toBe('submitted');
  });

  test('yeniden deneme yalnizca FIS SAHIBI surucude calisir', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'diesel-beleg.jpg');

    // Baska bir rol surucu ucuna hic erisemez.
    const officeToken = fixtureToken(fixture, 'office');
    if (officeToken) {
      const denied = await request.post(`${API}/driver/fuel-receipts/${uploaded.id}/analyze`, {
        headers: { Authorization: `Bearer ${officeToken}` },
      });
      expect(denied.status()).toBe(403);
    }

    // Baska kiracinin surucusu de goremez.
    //
    // DURUM KODU SABITLENMIYOR: istek fise ulasmadan once baska bir kapiya
    // (ornegin "bu surucunun araci yok") takilabilir ve bu da mesru bir ret.
    // Asil iddia sudur: ISTEK BASARILI OLMAZ ve fisten hicbir sey sizmaz.
    const otherTenantDriver = fixtureToken(fixture, 'driver', 'tenantB');
    if (otherTenantDriver) {
      const denied = await request.post(`${API}/driver/fuel-receipts/${uploaded.id}/analyze`, {
        headers: { Authorization: `Bearer ${otherTenantDriver}` },
      });
      expect(denied.ok(), 'baska kiracinin surucusu analiz baslatamamali').toBe(false);
      const body = await denied.text();
      expect(body).not.toContain(uploaded.id);
      expect(body).not.toContain('ocrExtraction');
    }
  });

  test('GONDERILMIS fiste yeniden deneme calismaz', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'diesel-beleg.jpg');
    await analyze(request, driverToken, uploaded.id);

    await request.put(`${API}/driver/fuel-receipts/${uploaded.id}/confirm`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        purchasedAt: new Date().toISOString(),
        fuelProduct: 'DIESEL',
        liters: 20,
        fuelGrossAmount: 35,
        currency: 'EUR',
        acknowledgeFuelMismatch: true,
      },
    });

    /**
     * Kayit artik muhasebede.
     *
     * Uc HATA FIRLATMIYOR — Faz 6'dan beri idempotent: "zaten islendi ya da
     * baskasi calistiriyor" durumunda mevcut gorunumu donuyor. Sinanmasi
     * gereken sey durum kodu degil, ASIL DEGISMEZ: yeni bir analiz
     * BASLATILMIYOR ve kaydin durumu degismiyor. Ucretli bir cagrinin
     * tekrarlanmamasi da bu degismeze bagli.
     */
    const before = await request.get(`${API}/driver/fuel-receipts/${uploaded.id}`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const beforeBody = before.ok() ? await before.json() : null;

    const retry = await request.post(`${API}/driver/fuel-receipts/${uploaded.id}/analyze`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });

    if (retry.ok()) {
      const after = await retry.json();
      // Kayit muhasebede KALIYOR; OCR yeniden calismiyor.
      expect(after.workflowStatus).toBe('submitted');
      expect(after.ocrStatus).not.toBe('processing');
      if (beforeBody) {
        expect(after.ocrProcessedAt).toBe(beforeBody.ocrProcessedAt);
      }
    } else {
      // Acik ret de kabul edilebilir bir davranistir.
      expect([403, 404, 409]).toContain(retry.status());
    }
  });

  test('OCR sonucu araç maliyetine KATILMAZ', async ({ request }) => {
    const uploaded = await upload(request, driverToken, 'diesel-beleg.jpg');
    const analysed = await analyze(request, driverToken, uploaded.id);

    /**
     * FILO TOPLAMI KARSILASTIRILMIYOR.
     *
     * Once "onceki toplam == sonraki toplam" diye sinaniyordu; paralel
     * calisan baska bir spec ayni kiracida fis onaylayinca toplam iki okuma
     * arasinda degisiyor ve test HAKSIZ yere dusuyordu. Sinanmasi gereken
     * sey filonun toplami degil, BU KAYDIN maliyete girip girmedigi.
     */
    expect(analysed.workflowStatus).toBe('driver_review');

    // Maliyete YALNIZCA etkili onayli kayitlar girer; bu kayit onaylilar
    // listesinde GORUNMEZ.
    const approved = await (
      await request.get(`${API}/fleet/fuel-receipts?status=approved&pageSize=100`, {
        headers: { Authorization: `Bearer ${accountingToken}` },
      })
    ).json();
    expect(
      (approved.rows as Array<{ id: string }>).some((row) => row.id === uploaded.id),
      'OCR calismis olmasi kaydi onayli yapmaz',
    ).toBe(false);
  });

  test('health ucu OCR durumunu HASSAS OLMAYAN bicimde bildirir', async ({ request }) => {
    const response = await request.get(`${API}/health/ready`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.ocr).toBeTruthy();
    expect(['live', 'mock', 'disabled']).toContain(body.ocr.mode);
    expect(typeof body.ocr.configured).toBe('boolean');

    // Endpoint, anahtar ve operasyon kimligi ASLA donmemeli.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('cognitiveservices');
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toContain('Operation-Location');
  });
});
