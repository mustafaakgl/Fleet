import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');
type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type Entity = { id: string };
type DocumentFixture = Entity & { documentType: string; ownerId: string; tenantId: string };
type TenantFixture = {
  tenantId: string;
  users: Record<Role, Entity>;
  driver: Entity;
  documents: Record<'public' | 'private' | 'salary' | 'medical', DocumentFixture>;
};
type FixtureManifest = {
  tenantA: TenantFixture;
  tenantB: TenantFixture;
  accessTokens: Record<string, Record<Role, string>>;
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function expectStatus(response: Awaited<ReturnType<APIRequestContext['get']>>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

test.describe.serial('P0 document and file security API', () => {
  let fixture: FixtureManifest;
  let token: Record<Role, string>;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'seed:p0-qa'], { cwd: BACKEND_ROOT, env: process.env, stdio: 'pipe' });
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
    token = fixture.accessTokens[fixture.tenantA.tenantId];
  });

  test('operational roles can read tenant documents but never tenant B direct IDs', async ({ request }) => {
    for (const role of ['admin', 'boss', 'accounting'] as const) {
      const list = await request.get(`${API_BASE_URL}/documents?owner_type=driver&owner_id=${fixture.tenantA.driver.id}`, {
        headers: auth(token[role]),
      });
      await expectStatus(list, 200);
      const documents = await list.json() as DocumentFixture[];
      expect(documents.map((document) => document.id)).toEqual(expect.arrayContaining(
        Object.values(fixture.tenantA.documents).map((document) => document.id),
      ));
      expect(documents.every((document) => document.tenantId === fixture.tenantA.tenantId)).toBe(true);

      for (const document of Object.values(fixture.tenantA.documents)) {
        const download = await request.get(`${API_BASE_URL}/documents/${document.id}/download`, {
          headers: auth(token[role]),
        });
        await expectStatus(download, 200);
        expect(download.headers()['content-type']).toContain('application/pdf');
      }
    }

    const officeList = await request.get(`${API_BASE_URL}/documents?owner_type=driver&owner_id=${fixture.tenantA.driver.id}`, {
      headers: auth(token.office),
    });
    await expectStatus(officeList, 200);
    const officeDocuments = await officeList.json() as DocumentFixture[];
    expect(officeDocuments.map((document) => document.id)).toContain(fixture.tenantA.documents.public.id);
    for (const documentType of ['private', 'salary', 'medical'] as const) {
      expect(officeDocuments.map((document) => document.id)).not.toContain(fixture.tenantA.documents[documentType].id);
      await expectStatus(await request.get(
        `${API_BASE_URL}/documents/${fixture.tenantA.documents[documentType].id}/download`,
        { headers: auth(token.office) },
      ), 404);
    }
    await expectStatus(await request.get(`${API_BASE_URL}/documents/${fixture.tenantA.documents.public.id}/download`, {
      headers: auth(token.office),
    }), 200);

    const foreignDocument = fixture.tenantB.documents.private;
    await expectStatus(await request.get(`${API_BASE_URL}/documents/${foreignDocument.id}`, {
      headers: auth(token.admin),
    }), 404);
    await expectStatus(await request.get(`${API_BASE_URL}/documents/${foreignDocument.id}/download`, {
      headers: auth(token.admin),
    }), 404);
  });

  test('driver sees and downloads only own documents', async ({ request }) => {
    await expectStatus(await request.get(`${API_BASE_URL}/documents`, { headers: auth(token.driver) }), 403);
    const ownList = await request.get(`${API_BASE_URL}/driver/documents`, { headers: auth(token.driver) });
    await expectStatus(ownList, 200);
    const ownBody = await ownList.json() as { items: DocumentFixture[] };
    expect(ownBody.items.map((document) => document.id)).toEqual(expect.arrayContaining(
      Object.values(fixture.tenantA.documents).map((document) => document.id),
    ));
    await expectStatus(await request.get(
      `${API_BASE_URL}/driver/documents/${fixture.tenantA.documents.medical.id}/download`,
      { headers: auth(token.driver) },
    ), 200);
    await expectStatus(await request.get(
      `${API_BASE_URL}/driver/documents/${fixture.tenantB.documents.medical.id}/download`,
      { headers: auth(token.driver) },
    ), 404);
  });

  test('upload rejects declared PDF content with an invalid signature and a traversal filename', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/documents/upload`, {
      headers: auth(token.office),
      multipart: {
        ownerType: 'driver',
        ownerId: fixture.tenantA.driver.id,
        documentType: 'public',
        file: {
          name: '../../p0-traversal.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('not-a-pdf'),
        },
      },
    });
    await expectStatus(response, 400);

    const oversized = await request.post(`${API_BASE_URL}/documents/upload`, {
      headers: auth(token.office),
      multipart: {
        ownerType: 'driver',
        ownerId: fixture.tenantA.driver.id,
        documentType: 'public',
        file: {
          name: 'oversized.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x25),
        },
      },
    });
    expect([400, 413], await oversized.text()).toContain(oversized.status());
  });

  test('reminder generation is role-protected and deduplicated', async ({ request }) => {
    await expectStatus(await request.post(`${API_BASE_URL}/reminders/generate`, {
      headers: auth(token.accounting), data: {},
    }), 403);
    const first = await request.post(`${API_BASE_URL}/reminders/generate`, {
      headers: auth(token.office), data: {},
    });
    await expectStatus(first, 201);
    const firstBody = await first.json() as { totalCandidates: number; created: number };
    expect(firstBody.totalCandidates).toBeGreaterThan(0);
    expect(firstBody.created).toBeGreaterThan(0);
    const second = await request.post(`${API_BASE_URL}/reminders/generate`, {
      headers: auth(token.office), data: {},
    });
    await expectStatus(second, 201);
    expect((await second.json() as { created: number }).created).toBe(0);
  });
});