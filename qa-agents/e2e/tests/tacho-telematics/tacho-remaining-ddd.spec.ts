import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');
const API_URL = process.env.API_URL || 'http://localhost:3000';

function storageStateFor(role: string): string | null {
  const statePath = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(statePath) ? statePath : null;
}

async function authHeaders(page: import('@playwright/test').Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

test.describe('Tachograph remaining driving time', () => {
  test('[tacho] exhausted driver shows red radial and sorts first', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/remaining-driving-time');
      await expect(page.getByRole('heading', { name: /remaining|kalan|restlenkzeit/i })).toBeVisible({
        timeout: 20_000,
      });

      const firstCard = page.locator('.grid > a').first();
      await expect(firstCard).toBeVisible();
      await expect(firstCard.locator('.text-red-700').first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[tacho] stale driver card is faded with estimated label', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/remaining-driving-time');
      await expect(page.getByRole('heading', { name: /remaining|kalan|restlenkzeit/i })).toBeVisible({
        timeout: 20_000,
      });

      const staleCard = page.locator('a.opacity-\\[0\\.55\\]').first();
      await expect(staleCard).toBeVisible();
      await expect(staleCard.getByText(/estimated|tahmini|geschätzt/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[tacho] assignment exceeds remaining warning band', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/remaining-driving-time');
      await expect(page.getByRole('heading', { name: /remaining|kalan|restlenkzeit/i })).toBeVisible({
        timeout: 20_000,
      });

      const band = page.locator('.border-amber-200.bg-amber-50');
      await expect(band).toBeVisible();
      await expect(band).toContainText(/⚠️|assignment|atama|einsatz/i);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Tachograph DDD archive', () => {
  test('[tacho] tampered fixture shows invalid signature row', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/ddd-archive');
      await expect(page.getByRole('heading', { name: /ddd|arşiv|archiv/i })).toBeVisible({
        timeout: 20_000,
      });

      const invalidRow = page.locator('tr.bg-amber-50\\/80').first();
      await expect(invalidRow).toBeVisible();
      await expect(invalidRow.getByText(/invalid|geçersiz|ungültig/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[tacho] assign unmapped card updates row and audit log', async ({ browser, request }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/ddd-archive');
      await expect(page.getByRole('heading', { name: /ddd|arşiv|archiv/i })).toBeVisible({
        timeout: 20_000,
      });

      const matchButton = page.getByRole('button', { name: /match|eşleştir|zuordnen/i }).first();
      const hasUnassigned = (await matchButton.count()) > 0;
      test.skip(!hasUnassigned, 'No unassigned DDD file in seed');

      await matchButton.click();
      const driverSelect = page.locator('select').last();
      await driverSelect.selectOption({ index: 1 });
      await page.getByRole('button', { name: /save|kaydet|speichern/i }).click();

      await expect(matchButton).toHaveCount(0, { timeout: 15_000 });

      const headers = await authHeaders(page);
      const auditResponse = await request.get(
        `${API_URL}/audit-logs?action=tacho_ddd_file_assigned&limit=5`,
        { headers },
      );
      expect(auditResponse.ok()).toBeTruthy();
      const auditBody = (await auditResponse.json()) as { data: unknown[] };
      expect(auditBody.data.length).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });
});
