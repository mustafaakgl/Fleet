import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');
type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type FixtureManifest = {
  tenantA: {
    tenantId: string;
    users: Record<Role, { id: string; email: string; role: Role }>;
  };
  accessTokens: Record<string, Record<Role, string>>;
};

async function authenticate(page: Page, fixture: FixtureManifest, role: Role) {
  const token = fixture.accessTokens[fixture.tenantA.tenantId][role];
  const user = { ...fixture.tenantA.users[role], name: fixture.tenantA.users[role].email };
  await page.addInitScript(({ accessToken, authUser }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('fleet_access_token', accessToken);
    localStorage.setItem('user', JSON.stringify(authUser));
    localStorage.setItem('fleet_user', JSON.stringify(authUser));
    sessionStorage.removeItem('fleet_skip_auto_login');
  }, { accessToken: token, authUser: user });
}

test.describe.serial('P0 five-persona UI route guards', () => {
  let fixture: FixtureManifest;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'seed:p0-qa'], { cwd: BACKEND_ROOT, env: process.env, stdio: 'pipe' });
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
  });

  for (const role of ['admin', 'boss', 'accounting', 'office'] as const) {
    test(`${role} can open dashboard and is rejected from driver portal`, async ({ page }) => {
      await authenticate(page, fixture, role);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 15_000 });
      await page.goto('/driver/documents');
      await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 15_000 });
    });
  }

  test('driver can open driver portal and is rejected from dashboard', async ({ page }) => {
    await authenticate(page, fixture, 'driver');
    await page.goto('/driver/documents');
    await expect(page).toHaveURL(/\/driver\/documents\/?$/, { timeout: 15_000 });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/driver\/?$/, { timeout: 15_000 });
  });

  test('driver portal shell remains available after the browser goes offline', async ({ page, context }) => {
    await authenticate(page, fixture, 'driver');
    await page.goto('/driver');
    await expect(page).toHaveURL(/\/driver\/?$/, { timeout: 15_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    await context.setOffline(true);
    try {
      await page.goto('/driver');
      await expect(page).toHaveURL(/\/driver\/?$/, { timeout: 15_000 });
      await expect(page.locator('body')).not.toBeEmpty();
    } finally {
      await context.setOffline(false);
    }
  });
});