import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');
type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type Entity = { id: string; email?: string };
type TenantFixture = { tenantId: string; users: Record<Role, Entity>; driver: Entity };
type FixtureManifest = {
  password: string;
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

test.describe.serial('P0 audit and privacy API', () => {
  let fixture: FixtureManifest;
  let token: Record<Role, string>;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'seed:p0-qa'], { cwd: BACKEND_ROOT, env: process.env, stdio: 'pipe' });
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
    token = fixture.accessTokens[fixture.tenantA.tenantId];
  });

  test('audit logs allow admin and boss, deny other roles, and scope foreign actor filters', async ({ request }) => {
    for (const role of ['admin', 'boss'] as const) {
      const response = await request.get(`${API_BASE_URL}/audit-logs?limit=20`, { headers: auth(token[role]) });
      await expectStatus(response, 200);
      const body = await response.json() as { data: Array<{ tenantId: string | null }> };
      expect(body.data.every((row) => row.tenantId === fixture.tenantA.tenantId)).toBe(true);
    }
    for (const role of ['accounting', 'office', 'driver'] as const) {
      await expectStatus(await request.get(`${API_BASE_URL}/audit-logs`, { headers: auth(token[role]) }), 403);
    }

    const foreignActor = fixture.tenantB.users.admin.id;
    const foreignFilter = await request.get(`${API_BASE_URL}/audit-logs?actorUserId=${foreignActor}`, {
      headers: auth(token.admin),
    });
    await expectStatus(foreignFilter, 200);
    expect((await foreignFilter.json() as { total: number }).total).toBe(0);
    const csv = await request.get(`${API_BASE_URL}/audit-logs/export?action=%27%3BSELECT%201--`, {
      headers: auth(token.boss),
    });
    await expectStatus(csv, 200);
    expect(csv.headers()['content-type']).toContain('text/csv');
  });

  test('privacy routes deny non-admins and auth errors do not reflect secrets', async ({ request }) => {
    for (const role of ['boss', 'accounting', 'office', 'driver'] as const) {
      const denial = await request.get(`${API_BASE_URL}/privacy/export/driver/${fixture.tenantA.driver.id}`, {
        headers: auth(token[role]),
      });
      expect([403, 429], await denial.text()).toContain(denial.status());
      expect(await denial.text()).not.toMatch(/"stack"|\/Users\/|node_modules/);
    }

    const marker = `P0-SECRET-${Date.now()}`;
    const failedLogin = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: fixture.tenantA.users.admin.email, password: marker },
    });
    expect([401, 429], await failedLogin.text()).toContain(failedLogin.status());
    const responseText = await failedLogin.text();
    expect(responseText).not.toContain(marker);
    expect(responseText).not.toMatch(/passwordHash|refreshToken|accessToken/i);
    expect(responseText).not.toContain(fixture.password);
    expect(responseText).not.toMatch(/"stack"|\/Users\/|node_modules/);
  });
});