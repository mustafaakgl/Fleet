import { test as setup, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Role-based authentication setup.
 *
 * Produces Playwright storage states (cookies + localStorage) per role so the
 * RBAC specs can run as a specific user without re-logging-in each time.
 *
 * Auth states are created through the backend login API and then written into
 * the same localStorage keys the Fleet frontend uses at runtime. This avoids
 * flaky pre-hydration form submits in dev mode while still exercising the real
 * application auth contract.
 *
 * If selectors change, update the constants below. Credentials are read from
 * environment variables only — never hardcoded. Roles without credentials are
 * skipped with a clear reason (no fake auth state is written).
 */

const LOGIN_PATH = '/login?manual=1';
const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

// Production-like backend throttling can return 429 when role logins happen
// in parallel. Setup states are independent, so serializing here avoids flakes.
setup.describe.configure({ mode: 'serial' });

// Map each role to its storage-state file and the env vars holding credentials.
const ROLES = [
  { role: 'admin', emailVar: 'ADMIN_EMAIL', passwordVar: 'ADMIN_PASSWORD' },
  { role: 'boss', emailVar: 'BOSS_EMAIL', passwordVar: 'BOSS_PASSWORD' },
  { role: 'accounting', emailVar: 'ACCOUNTING_EMAIL', passwordVar: 'ACCOUNTING_PASSWORD' },
  { role: 'office', emailVar: 'OFFICE_EMAIL', passwordVar: 'OFFICE_PASSWORD' },
  { role: 'driver', emailVar: 'DRIVER_EMAIL', passwordVar: 'DRIVER_PASSWORD' },
] as const;

/**
 * Authenticate through the backend API and persist the resulting auth state
 * into the browser's localStorage for the frontend origin.
 */
async function login(page: Page, email: string, password: string): Promise<void> {
  let response = await page.request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  });

  for (let attempt = 0; response.status() === 429 && attempt < 4; attempt += 1) {
    const backoffMs = 1_500 * (attempt + 1);
    await page.waitForTimeout(backoffMs);
    response = await page.request.post(`${API_BASE_URL}/auth/login`, {
      data: { email, password },
    });
  }

  expect(response.ok(), `Backend login failed for ${email}: ${response.status()} ${await response.text()}`).toBeTruthy();

  const data = await response.json() as {
    accessToken?: string;
    access_token?: string;
    refreshToken?: string;
    refresh_token?: string;
    user?: {
      id: string;
      email: string;
      name?: string;
      role: string;
      language?: string;
      fleet_ops?: boolean;
    };
  };

  const accessToken = data.accessToken ?? data.access_token;
  const refreshToken = data.refreshToken ?? data.refresh_token ?? null;
  expect(accessToken, `Missing access token in login response for ${email}.`).toBeTruthy();
  expect(data.user, `Missing user payload in login response for ${email}.`).toBeTruthy();

  await page.goto(LOGIN_PATH);
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  await page.evaluate(
    ({ token, refresh, user }) => {
      const normalizedUser = {
        ...user,
        name: user.name ?? user.email,
      };
      localStorage.setItem('accessToken', token);
      localStorage.setItem('fleet_access_token', token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('fleet_user', JSON.stringify(normalizedUser));
      if (refresh) {
        localStorage.setItem('refreshToken', refresh);
        localStorage.setItem('fleet_refresh_token', refresh);
      }
      if (user.language) {
        localStorage.setItem('fleet_language', user.language);
      }
      sessionStorage.removeItem('fleet_skip_auto_login');
    },
    {
      token: accessToken,
      refresh: refreshToken,
      user: data.user,
    },
  );
}

// Ensure the .auth directory exists before any state is written.
setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

for (const { role, emailVar, passwordVar } of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const email = process.env[emailVar]?.trim();
    const password = process.env[passwordVar]?.trim();

    // No credentials -> skip (do not write a fake/unauthenticated state).
    setup.skip(
      !email || !password,
      `No credentials for "${role}". Set ${emailVar} and ${passwordVar} in ` +
        `e2e/.env.e2e to generate .auth/${role}.json.`,
    );

    await login(page, email as string, password as string);

    const statePath = path.join(AUTH_DIR, `${role}.json`);
    await page.context().storageState({ path: statePath });
    console.log(`[auth.setup] saved storage state: .auth/${role}.json`);
  });
}
