import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');

type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type FixtureManifest = {
  password: string;
  tenantA: {
    tenantId: string;
    users: Record<Role, { id: string; email: string; role: Role; tenantId: string }>;
  };
  accessTokens: Record<string, Record<Role, string>>;
  sessions: {
    activeAccessToken: string;
    expiredAccessToken: string;
    activeRefreshToken: string;
    expiredRefreshToken: string;
  };
};

function loadFixture(): FixtureManifest {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
}

test.describe.serial('P0 authentication and sessions', () => {
  let fixture: FixtureManifest;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'seed:p0-qa'], {
      cwd: BACKEND_ROOT,
      env: process.env,
      stdio: 'pipe',
    });
    fixture = loadFixture();
  });

  test('valid login succeeds and wrong password is rejected', async ({ request }) => {
    const admin = fixture.tenantA.users.admin;
    const valid = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: admin.email, password: fixture.password },
    });
    expect(valid.status(), await valid.text()).toBe(200);
    const body = await valid.json() as { accessToken?: string; refreshToken?: string };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const invalid = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: admin.email, password: 'Wrong-QA-Password!' },
    });
    expect(invalid.status()).toBe(401);
  });

  test('protected API rejects missing, malformed, and expired access tokens', async ({ request }) => {
    const missing = await request.get(`${API_BASE_URL}/users`);
    expect(missing.status()).toBe(401);

    const malformed = await request.get(`${API_BASE_URL}/users`, {
      headers: { Authorization: 'Bearer malformed.qa.token' },
    });
    expect(malformed.status()).toBe(401);

    const expired = await request.get(`${API_BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${fixture.sessions.expiredAccessToken}` },
    });
    expect(expired.status()).toBe(401);
  });

  test('users API allows admin and rejects boss, accounting, office, and driver', async ({ request }) => {
    for (const role of ['admin', 'boss', 'accounting', 'office', 'driver'] as const) {
      const response = await request.get(`${API_BASE_URL}/users`, {
        headers: {
          Authorization: `Bearer ${fixture.accessTokens[fixture.tenantA.tenantId][role]}`,
        },
      });
      expect(response.status(), `${role} received ${response.status()}`).toBe(role === 'admin' ? 200 : 403);
    }
  });

  test('refresh rotates, old-token reuse revokes the replacement chain', async ({ request }) => {
    const rotated = await request.post(`${API_BASE_URL}/auth/refresh`, {
      data: { refreshToken: fixture.sessions.activeRefreshToken },
    });
    expect(rotated.status(), await rotated.text()).toBe(200);
    const rotatedBody = await rotated.json() as { refreshToken: string };
    expect(rotatedBody.refreshToken).toBeTruthy();

    const reuse = await request.post(`${API_BASE_URL}/auth/refresh`, {
      data: { refreshToken: fixture.sessions.activeRefreshToken },
    });
    expect(reuse.status()).toBe(401);

    const replacementAfterReuse = await request.post(`${API_BASE_URL}/auth/refresh`, {
      data: { refreshToken: rotatedBody.refreshToken },
    });
    expect(replacementAfterReuse.status()).toBe(401);
  });

  test('expired refresh is rejected and logout revokes a live refresh token', async ({ request }) => {
    const expired = await request.post(`${API_BASE_URL}/auth/refresh`, {
      data: { refreshToken: fixture.sessions.expiredRefreshToken },
    });
    expect(expired.status()).toBe(401);

    const admin = fixture.tenantA.users.admin;
    const login = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: admin.email, password: fixture.password },
    });
    expect(login.status(), await login.text()).toBe(200);
    const loginBody = await login.json() as { refreshToken: string };

    const logout = await request.post(`${API_BASE_URL}/auth/logout`, {
      data: { refreshToken: loginBody.refreshToken },
    });
    expect(logout.status()).toBe(200);

    const afterLogout = await request.post(`${API_BASE_URL}/auth/refresh`, {
      data: { refreshToken: loginBody.refreshToken },
    });
    expect(afterLogout.status()).toBe(401);
  });

  test('login rate limit returns 429 without weakening production policy', async ({ request }) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: `rate-limit-${attempt}@qa-p0.invalid`,
          password: 'Wrong-QA-Password!',
        },
      });
      statuses.push(response.status());
    }
    expect(statuses).toContain(429);
  });
});