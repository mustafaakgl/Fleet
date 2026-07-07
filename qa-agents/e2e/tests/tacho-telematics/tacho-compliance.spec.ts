import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');
const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

function storageStateFor(role: string): string | null {
  const statePath = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(statePath) ? statePath : null;
}

async function authHeaders(page: import('@playwright/test').Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchBadges(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${API_URL}/tachograph/badges`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    openCriticalInfringements: number;
    unacknowledgedInfringements: number;
    overdueCardDownloads: number;
    overdueVuDownloads: number;
    activeCriticalDtcs: number;
  }>;
}

test.describe('Tachograph compliance & badges', () => {
  test('[tacho] compliance KPIs and stale driver after seed', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/compliance');
      await expect(page.getByRole('heading', { name: /compliance|uyumluluk|lenkzeit/i })).toBeVisible({
        timeout: 20_000,
      });

      const openKpi = page.locator('a[href="/tachograph/infringements?tab=open"] .tabular-nums').first();
      test.skip((await openKpi.count()) < 1, 'No compliance KPI cards (likely no DDD files in dataset)');
      await expect(openKpi).toBeVisible({ timeout: 20_000 });
      const openCount = Number(await openKpi.textContent());
      expect(openCount).toBeGreaterThan(0);

      const overdueCards = page
        .locator('div')
        .filter({ hasText: /overdue card|gecikmiş kart|überfällige karten/i })
        .locator('.tabular-nums')
        .first();
      if ((await overdueCards.count()) > 0) {
        await expect(overdueCards).toHaveClass(/text-red-700/);
      }

      const staleRow = page.locator('tr.opacity-\\[0\\.55\\]').first();
      test.skip((await staleRow.count()) < 1, 'No stale driver row in current compliance dataset');
      await expect(staleRow).toBeVisible();
      await expect(staleRow.getByText(/estimated|tahmini|geschätzt/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[tacho] sidebar badges match API', async ({ browser, request }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/dashboard');
      const tachographNavToggle = page.getByRole('button', { name: /tachograph|takograf/i });
      if ((await tachographNavToggle.count()) > 0) {
        await tachographNavToggle.first().click();
      }

      const headers = await authHeaders(page);
      const badges = await fetchBadges(request, headers);

      const infringementsNav = page.locator('a[href="/tachograph/infringements"]');
      test.skip((await infringementsNav.count()) < 1, 'Tachograph sidebar links are not visible in current nav state');
      await expect(infringementsNav).toBeVisible({ timeout: 20_000 });

      const badge = infringementsNav.locator('span.rounded-full');
      if (badges.unacknowledgedInfringements > 0) {
        await expect(badge).toBeVisible();
        const text = await badge.textContent();
        expect(Number(text)).toBe(badges.unacknowledgedInfringements);
      } else {
        await expect(badge).toHaveCount(0);
      }

      const complianceNav = page.locator('a[href="/tachograph/compliance"]');
      const criticalBadge = complianceNav.locator('span.rounded-full');
      if (badges.openCriticalInfringements > 0) {
        await expect(criticalBadge).toBeVisible();
        expect(Number(await criticalBadge.textContent())).toBe(badges.openCriticalInfringements);
      } else {
        await expect(criticalBadge).toHaveCount(0);
      }
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Tachograph infringements queue', () => {
  test('[tacho] repeat offender badge and tooltip', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/infringements?tab=open');
      await expect(page.getByRole('heading', { name: /infringement|ihlal|verstoß/i })).toBeVisible({
        timeout: 20_000,
      });

      const repeatBadge = page
        .locator('[title*="displayed"], [title*="angezeigten"], [title*="görüntülenen"]')
        .first();
      const hasRepeat = (await repeatBadge.count()) > 0;
      test.skip(!hasRepeat, 'No repeat offender (3×) in seed for open queue');

      await expect(repeatBadge).toContainText(/3/);
    } finally {
      await ctx.close();
    }
  });

  test('[tacho] filter by driver narrows queue', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/infringements?tab=open');
      await expect(page.getByRole('heading', { name: /infringement|ihlal|verstoß/i })).toBeVisible({
        timeout: 20_000,
      });

      const driverSelect = page.locator('select').first();
      const options = await driverSelect.locator('option').all();
      test.skip(options.length < 2, 'No drivers in filter');

      const before = await page.locator('button', { hasText: /review|incele|prüfen/i }).count();
      await driverSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
      const after = await page.locator('button', { hasText: /review|incele|prüfen/i }).count();
      expect(after).toBeLessThanOrEqual(before);
    } finally {
      await ctx.close();
    }
  });

  test('[tacho] acknowledge flow: note required → closed tab → badge drops → audit log', async ({
    browser,
    request,
  }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/infringements?tab=open');
      await expect(page.getByRole('heading', { name: /infringement|ihlal|verstoß/i })).toBeVisible({
        timeout: 20_000,
      });

      const openTab = page.getByRole('button', { name: /open|açık|offen/i });
      const closedTab = page.getByRole('button', { name: /closed|kapalı|geschlossen/i });
      const openBefore = Number((await openTab.textContent())?.match(/\d+/)?.[0] ?? '0');
      const closedBefore = Number((await closedTab.textContent())?.match(/\d+/)?.[0] ?? '0');

      const headers = await authHeaders(page);
      const badgesBefore = await fetchBadges(request, headers);

      const reviewButton = page.getByRole('button', { name: /review|incele|prüfen/i }).first();
      const hasRow = (await reviewButton.count()) > 0;
      test.skip(!hasRow, 'No open infringements in seed data for acknowledge flow');

      await reviewButton.click();
      const drawer = page.locator('aside').last();
      await expect(drawer.locator('#ack-note')).toBeVisible();

      const submit = drawer.getByRole('button').last();
      await expect(submit).toBeDisabled();

      await drawer.locator('#ack-note').fill('Driver consulted and corrective action documented for compliance review.');
      await drawer.locator('input[type="checkbox"]').last().check();
      await expect(submit).toBeEnabled();
      await submit.click();

      await expect(drawer).toBeHidden({ timeout: 15_000 });
      await expect(closedTab).toHaveClass(/border-blue-600/);

      const openAfter = Number((await openTab.textContent())?.match(/\d+/)?.[0] ?? '0');
      const closedAfter = Number((await closedTab.textContent())?.match(/\d+/)?.[0] ?? '0');
      expect(openAfter).toBe(openBefore - 1);
      expect(closedAfter).toBe(closedBefore + 1);

      await page.goto('/dashboard');
      const badgesAfter = await fetchBadges(request, headers);
      if (badgesBefore.unacknowledgedInfringements > 0) {
        expect(badgesAfter.unacknowledgedInfringements).toBe(badgesBefore.unacknowledgedInfringements - 1);
      }

      const auditResponse = await request.get(
        `${API_URL}/audit-logs?action=tacho_infringement_acknowledged&limit=5`,
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
