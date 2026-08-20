import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../bootstrap/create-app';

/**
 * PUBLIC SLOT UCU — ROTA DUZEYINDE (Faz 17f).
 *
 * BU DOSYA GERCEK UYGULAMAYI AYAGA KALDIRIYOR ve HTTP uzerinden konusuyor.
 * Sebep dogrudan gorevin kendisi: hiz siniri SERVIS KATMANINDA kalmamali,
 * GERCEK PUBLIC ROTA uzerinde dogrulanmali. Bir servis metodunu dogrudan
 * cagirip "sinir calisiyor" demek hicbir sey kanitlamaz — istegi
 * `ThrottlerGuard` durdurur ve o guard ancak gercek bir istek geldiginde,
 * gercek rota metadata'siyla calisir.
 *
 * VERITABANI GEREKMIYOR ve bu bilincli: kisa (gecersiz) bir token
 * `resolveInvitation`in ILK kontrolunde duser, yani Prisma'ya hic
 * dokunulmadan guvenli 404 doner. Olculen sey zaten depolama degil, KAPI.
 */

const PUBLIC_PATH = '/api/v1/public/delivery-slots';
/** `@Throttle({ default: { limit: 10, ttl: 60_000 } })` ile AYNI olmali. */
const ROUTE_LIMIT = 10;

describe('Public slot rotasi', () => {
  const originalEnv = {
    swagger: process.env.SWAGGER_ENABLED,
    nodeEnv: process.env.NODE_ENV,
  };
  let app: NestExpressApplication;
  let baseUrl = '';

  before(async () => {
    process.env.NODE_ENV = 'test';
    // Ayni acilista OpenAPI sozlesmesini de dogruluyoruz; uygulamayi iki kez
    // ayaga kaldirmak bu dosyayi gereksiz yere yavaslatirdi.
    process.env.SWAGGER_ENABLED = 'true';
    app = await createApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app?.close();
    if (originalEnv.swagger === undefined) delete process.env.SWAGGER_ENABLED;
    else process.env.SWAGGER_ENABLED = originalEnv.swagger;
    if (originalEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.nodeEnv;
  });

  // -------------------------------------------------------------------------
  // Hiz siniri — ROTA UZERINDE
  // -------------------------------------------------------------------------

  it('sinir asildiginda rota 429 doner', async () => {
    const statuses: number[] = [];
    // Sinir + 2: son iki istek kesinlikle sinirin otesinde.
    for (let attempt = 0; attempt < ROUTE_LIMIT + 2; attempt += 1) {
      const response = await fetch(`${baseUrl}${PUBLIC_PATH}`, {
        headers: { 'x-slot-token': 'short' },
      });
      statuses.push(response.status);
    }

    // Ilk istekler sinire TAKILMIYOR — aksi halde test "her sey 429" diye
    // yanlis sebeple yesil olurdu.
    assert.equal(statuses[0], 404);
    assert.ok(!statuses.slice(0, ROUTE_LIMIT).includes(429), `erken 429: ${statuses.join(',')}`);
    // Sinirin otesi KESIN olarak 429.
    assert.equal(statuses[ROUTE_LIMIT], 429);
    assert.equal(statuses[ROUTE_LIMIT + 1], 429);
  });

  it('429 yaniti `Retry-After` tasiyor ve ic ayrinti sizdirmiyor', async () => {
    // Onceki test kovayi zaten doldurdu; bu istek dogrudan sinirin otesinde.
    const response = await fetch(`${baseUrl}${PUBLIC_PATH}`, {
      headers: { 'x-slot-token': 'short' },
    });
    assert.equal(response.status, 429);
    assert.ok(response.headers.get('retry-after'));

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.statusCode, 429);
    const serialized = JSON.stringify(body);
    for (const leak of ['prisma', 'Prisma', 'stack', 'tenantId', 'tokenHash', 'select']) {
      assert.equal(serialized.includes(leak), false, leak);
    }
  });

  // -------------------------------------------------------------------------
  // Yetkilendirilmis uclar PUBLIC DEGIL
  // -------------------------------------------------------------------------

  it('dispatch ve slot yonetimi uclari girissiz ERISILEMEZ', async () => {
    for (const path of [
      '/api/v1/dispatch/proposals',
      '/api/v1/dispatch/proposals/dp-1',
      '/api/v1/dispatch/proposals/dp-1/candidates',
      '/api/v1/dispatch/proposals/dp-1/tour',
      '/api/v1/delivery-slots',
      '/api/v1/delivery-slots/invitations',
    ]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 401, path);
    }
  });

  it('token QUERY parametresi yetki VERMEZ — yalnizca baslik', async () => {
    // Token URL'de tasinsaydi vekil loglarina ve `Referer` basligina duserdi.
    // Uc onu okumuyor: sorgu parametresiyle gelen istek "token yok" sayilir.
    const response = await fetch(`${baseUrl}${PUBLIC_PATH}?token=some-token-value-1234567890`);
    assert.ok(response.status === 404 || response.status === 429, String(response.status));
  });

  // -------------------------------------------------------------------------
  // OpenAPI sozlesmesi
  // -------------------------------------------------------------------------

  describe('OpenAPI sozlesmesi', () => {
    let document: {
      paths: Record<string, Record<string, { security?: unknown[]; tags?: string[]; description?: string; responses?: Record<string, unknown> }>>;
    };

    before(async () => {
      const response = await fetch(`${baseUrl}/api/docs-json`);
      assert.equal(response.status, 200);
      document = (await response.json()) as typeof document;
    });

    it('butun 17f rotalari belgede', () => {
      for (const path of [
        '/api/v1/dispatch/proposals',
        '/api/v1/dispatch/proposals/{id}',
        '/api/v1/dispatch/proposals/{id}/candidates',
        '/api/v1/dispatch/proposals/{id}/overrides',
        '/api/v1/dispatch/proposals/{id}/tour',
        '/api/v1/dispatch/proposals/{id}/approve',
        '/api/v1/dispatch/proposals/{id}/reject',
        '/api/v1/dispatch/proposals/{id}/retry',
        '/api/v1/delivery-slots',
        '/api/v1/delivery-slots/{id}',
        '/api/v1/delivery-slots/invitations',
        '/api/v1/delivery-slots/invitations/{id}/revoke',
        '/api/v1/delivery-slots/invitations/{id}/reissue',
        '/api/v1/public/delivery-slots',
        '/api/v1/public/delivery-slots/bookings',
        '/api/v1/public/delivery-slots/bookings/cancel',
      ]) {
        assert.ok(document.paths[path], `eksik: ${path}`);
      }
    });

    it('yetkilendirilmis uclar bearer ISTIYOR, public uc ISTEMIYOR', () => {
      assert.ok(document.paths['/api/v1/dispatch/proposals']!.get!.security);
      assert.ok(document.paths['/api/v1/delivery-slots']!.get!.security);
      assert.equal(document.paths['/api/v1/public/delivery-slots']!.get!.security, undefined);
      assert.equal(document.paths['/api/v1/public/delivery-slots/bookings']!.post!.security, undefined);
    });

    it('rol ve yazma politikasi sozlesmede YAZILI', () => {
      const approve = document.paths['/api/v1/dispatch/proposals/{id}/approve']!.post!;
      assert.match(approve.description ?? '', /Allowed roles/u);
      // Yazma politikasi belgede acikca duruyor: sozlesmeyi okuyan biri
      // muhasebenin plan uygulayamadigini gormeli.
      assert.match(approve.description ?? '', /Effective write roles/u);
      assert.match(approve.description ?? '', /admin, boss, office/u);
    });

    it('dispatch ve slot uclari kendi etiketlerinde', () => {
      assert.deepEqual(document.paths['/api/v1/dispatch/proposals']!.get!.tags, ['Dispatch']);
      assert.deepEqual(document.paths['/api/v1/delivery-slots']!.get!.tags, ['Delivery slots']);
      assert.deepEqual(document.paths['/api/v1/public/delivery-slots']!.get!.tags, ['Delivery slots']);
    });

    it('hiz siniri ve cakisma cevaplari belgede', () => {
      const publicGet = document.paths['/api/v1/public/delivery-slots']!.get!;
      assert.ok(publicGet.responses?.['429'], '429 eksik');
      const approve = document.paths['/api/v1/dispatch/proposals/{id}/approve']!.post!;
      assert.ok(approve.responses?.['409'], '409 eksik');
      assert.ok(approve.responses?.['403'], '403 eksik');
    });
  });
});
