import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../bootstrap/create-app';

describe('Swagger/OpenAPI bootstrap', () => {
  const originalSwaggerEnabled = process.env.SWAGGER_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFuelStationProvider = process.env.FUEL_STATION_PROVIDER;
  const originalFuelReceiptOcrProvider = process.env.FUEL_RECEIPT_OCR_PROVIDER;
  const originalOrdivanMode = process.env.ORDIVAN_CONNECTOR_MODE;
  let app: NestExpressApplication | null = null;
  let baseUrl = '';

  async function startWithSwagger(enabled: boolean) {
    if (app) {
      await app.close();
      app = null;
    }

    process.env.SWAGGER_ENABLED = enabled ? 'true' : 'false';
    app = await createApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    // Bu dosya bir test icinde NODE_ENV=production ile uygulamayi ayaga
    // kaldiriyor. Uretimde demo yakit saglayicisi YASAK (bkz.
    // resolveFuelStationProviderKind) — gercek bir uretim dagitiminda oldugu
    // gibi canli saglayici secilmeli, aksi halde modul kurulumu bilincli
    // olarak basarisiz olur. Depodaki `.env` gelistirme icin mock'a ayarli.
    process.env.FUEL_STATION_PROVIDER = 'tankerkoenig';
    // Ayni gerekce yakit fisi OCR saglayicisi icin de gecerli (Faz 6): uretimde
    // demo OCR YASAK, cunku uydurma fis tutarlari muhasebeye gercek maliyet gibi
    // girerdi. `disabled` uretimde gecerli olan degerdir — OCR calismaz, surucu
    // formu elle doldurur. Depodaki `.env` gelistirme icin `mock`a ayarli
    // olabilir ve bu dosya uygulamayi NODE_ENV=production ile kaldirdigi icin
    // acikca gecersiz kilinmali.
    process.env.FUEL_RECEIPT_OCR_PROVIDER = 'disabled';
    // Ordivan da ayni kurali tasiyor: `mock` uretimde ACILISTA reddediliyor.
    // Bu dosya uygulamayi bilincli olarak NODE_ENV=production ile ayaga
    // kaldirdigi icin, gelistirici makinesindeki `mock` ayari burayi
    // dusururdu — sahte saglayicilarla AYNI sekilde notrlestiriliyor.
    process.env.ORDIVAN_CONNECTOR_MODE = 'disabled';
  });

  after(async () => {
    if (app) {
      await app.close();
    }

    if (originalSwaggerEnabled === undefined) {
      delete process.env.SWAGGER_ENABLED;
    } else {
      process.env.SWAGGER_ENABLED = originalSwaggerEnabled;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalFuelStationProvider === undefined) {
      delete process.env.FUEL_STATION_PROVIDER;
    } else {
      process.env.FUEL_STATION_PROVIDER = originalFuelStationProvider;
    }

    if (originalFuelReceiptOcrProvider === undefined) {
      delete process.env.FUEL_RECEIPT_OCR_PROVIDER;
    } else {
      process.env.FUEL_RECEIPT_OCR_PROVIDER = originalFuelReceiptOcrProvider;
    }

    if (originalOrdivanMode === undefined) {
      delete process.env.ORDIVAN_CONNECTOR_MODE;
    } else {
      process.env.ORDIVAN_CONNECTOR_MODE = originalOrdivanMode;
    }
  });

  it('omits docs routes in production when SWAGGER_ENABLED is false', async () => {
    process.env.NODE_ENV = 'production';
    await startWithSwagger(false);

    const docsResponse = await fetch(`${baseUrl}/api/docs`, { redirect: 'manual' });
    const jsonResponse = await fetch(`${baseUrl}/api/docs-json`, { redirect: 'manual' });

    assert.equal(docsResponse.status, 404);
    assert.equal(jsonResponse.status, 404);
  });

  it('serves docs JSON with bearer auth, tags, and critical paths when SWAGGER_ENABLED is true', async () => {
    process.env.NODE_ENV = 'test';
    await startWithSwagger(true);

    const docsUiResponse = await fetch(`${baseUrl}/api/docs`, { redirect: 'manual' });
    const response = await fetch(`${baseUrl}/api/docs-json`);
    assert.equal(docsUiResponse.status, 200);
    assert.equal(response.status, 200);

    const document = (await response.json()) as {
      openapi?: string;
      info?: { title?: string; version?: string };
      tags?: Array<{ name?: string }>;
      paths?: Record<string, Record<string, { security?: Array<Record<string, string[]>>; operationId?: string }>>;
      components?: { securitySchemes?: Record<string, unknown>; schemas?: Record<string, unknown> };
    };

    assert.equal(typeof document.openapi, 'string');
    assert.equal(document.info?.title, 'Fleet API');
    assert.equal(typeof document.info?.version, 'string');
    assert.ok(document.paths?.['/api/v1/auth/login']);
    assert.ok(document.paths?.['/api/v1/users']);
    assert.ok(document.paths?.['/api/v1/drivers']);
    assert.ok(document.paths?.['/api/v1/vehicles']);
    assert.ok(document.paths?.['/api/v1/documents']);
    assert.ok(document.components?.securitySchemes?.bearerAuth);
    assert.ok(document.tags?.some((tag) => tag.name === 'Authentication'));
    assert.ok(document.tags?.some((tag) => tag.name === 'Users'));
    assert.ok(document.tags?.some((tag) => tag.name === 'Drivers'));
    assert.ok(document.tags?.some((tag) => tag.name === 'Vehicles'));
    assert.ok(document.tags?.some((tag) => tag.name === 'Documents'));
    assert.ok(document.tags?.some((tag) => tag.name === 'Telematics'));
    assert.ok(document.tags?.some((tag) => tag.name === 'Equipment issuance'));

    const usersGet = document.paths?.['/api/v1/users']?.get;
    assert.deepEqual(usersGet?.security, [{ bearerAuth: [] }]);
    const driversGet = document.paths?.['/api/v1/drivers']?.get;
    assert.deepEqual(driversGet?.security, [{ bearerAuth: [] }]);
    const vehiclesGet = document.paths?.['/api/v1/vehicles']?.get;
    assert.deepEqual(vehiclesGet?.security, [{ bearerAuth: [] }]);
  });

  it('keeps protected endpoints protected and sanitizes sensitive OpenAPI content', async () => {
    process.env.NODE_ENV = 'test';
    await startWithSwagger(true);

    const protectedResponse = await fetch(`${baseUrl}/api/v1/users`, { redirect: 'manual' });
    assert.equal(protectedResponse.status, 401);

    const response = await fetch(`${baseUrl}/api/docs-json`);
    const document = (await response.json()) as {
      paths?: Record<string, Record<string, { operationId?: string }>>;
      components?: { schemas?: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
    };

    const serialized = JSON.stringify(document);
    assert.equal(serialized.includes('passwordHash'), false);
    assert.equal(serialized.includes('refreshTokenHash'), false);
    assert.equal(serialized.includes('fleet_refresh_token'), false);
    assert.equal(serialized.includes('backend/uploads'), false);
    assert.equal(serialized.includes('test-secret'), false);

    const loginSchema = document.components?.schemas?.LoginDto;
    assert.deepEqual(loginSchema?.required, ['email', 'password']);

    const createDocumentSchema = document.components?.schemas?.CreateDocumentDto;
    assert.deepEqual(createDocumentSchema?.required, ['ownerType', 'ownerId', 'documentType', 'fileName']);
    assert.ok(createDocumentSchema?.properties?.clientRequestId);
    assert.equal(createDocumentSchema?.required?.includes('clientRequestId'), false);

    const routeKeys = new Set<string>();
    const operationIds = new Set<string>();
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods)) {
        const routeKey = `${method.toUpperCase()} ${path}`;
        assert.equal(routeKeys.has(routeKey), false, `Duplicate method/path detected: ${routeKey}`);
        routeKeys.add(routeKey);

        if (operation.operationId) {
          assert.equal(operationIds.has(operation.operationId), false, `Duplicate operationId detected: ${operation.operationId}`);
          operationIds.add(operation.operationId);
        }
      }
    }
  });
});