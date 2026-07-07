import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');
const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const E2E_FULL = process.env.E2E_FULL === '1';

function storageStateFor(role: string): string | null {
  const statePath = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(statePath) ? statePath : null;
}

async function authHeaders(page: import('@playwright/test').Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

test.describe('Telematics vehicle health', () => {
  test('[telematics] KPIs, table, critical DTC and expandable charts', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/telematics/vehicle-health');
      await expect(page.getByRole('heading', { name: /vehicle health|araç sağlığı|fahrzeugzustand/i })).toBeVisible({
        timeout: 20_000,
      });

      const onlineKpi = page.locator('.tabular-nums').filter({ hasText: /\// }).first();
      await expect(onlineKpi).toBeVisible({ timeout: 20_000 });

      const tableRow = page.locator('tbody tr').first();
      await expect(tableRow).toBeVisible();

      const criticalDtcBadge = page.locator('tbody .border-red-200').first();
      test.skip((await criticalDtcBadge.count()) < 1, 'No critical DTC row in current seeded telematics state');
      await expect(criticalDtcBadge).toBeVisible();

      await tableRow.click();
      await expect(page.getByText(/speed|hız|geschwindigkeit/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.recharts-responsive-container').first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[telematics] fuel theft flag after fuel-theft scenario', async ({ browser }) => {
    test.skip(!E2E_FULL, 'Runs only with E2E_FULL=1');

    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/telematics/vehicle-health');
      await expect(page.getByRole('heading', { name: /vehicle health|araç sağlığı|fahrzeugzustand/i })).toBeVisible({
        timeout: 20_000,
      });

      const flag = page.locator('tbody svg.lucide-flag').first();
      await expect(flag).toBeVisible({ timeout: 20_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Telematics driver scores', () => {
  test('[telematics] ranked drivers, insufficient data, target line', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/telematics/driver-scores');
      await expect(page.getByRole('heading', { name: /driver scores|sürücü skorları|fahrerbewertung/i })).toBeVisible({
        timeout: 20_000,
      });

      await expect(page.locator('.recharts-reference-line').first()).toBeVisible({ timeout: 15_000 });

      const rankOne = page.locator('tbody tr').first().locator('.tabular-nums').first();
      await expect(rankOne).toHaveText('1');

      const insufficient = page.getByText(/insufficient data|yetersiz veri|unzureichende daten/i);
      if ((await insufficient.count()) > 0) {
        await expect(insufficient.first()).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });

  test('[telematics] driver role receives 403 on telematics APIs', async ({ browser, request }) => {
    test.skip(!E2E_FULL, 'Runs only with E2E_FULL=1');

    const state = storageStateFor('driver');
    test.skip(!state, 'Missing .auth/driver.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      const headers = await authHeaders(page);
      for (const path of ['/telematics/vehicle-health', '/telematics/driver-scores']) {
        const response = await request.get(`${API_URL}${path}`, { headers });
        expect(response.status()).toBe(403);
      }
    } finally {
      await ctx.close();
    }
  });
});
