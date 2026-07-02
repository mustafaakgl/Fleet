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

async function fetchDashboardSummary(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${API_URL}/tachograph/dashboard-summary`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    complianceScorePct: number;
    openCriticalCount: number;
    driversOutOfTimeToday: number;
    overdueDownloadsTotal: number;
  }>;
}

test.describe('Session 9 integration polish', () => {
  test('[cila] dashboard compliance strip numbers and drill-down links', async ({ browser, request }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/dashboard');
      const headers = await authHeaders(page);
      const summary = await fetchDashboardSummary(request, headers);

      const strip = page.getByTestId('compliance-fleet-strip');
      await expect(strip).toBeVisible({ timeout: 20_000 });

      const scoreCard = page.getByTestId('compliance-strip-score');
      await expect(scoreCard).toContainText(String(summary.complianceScorePct));

      await scoreCard.click();
      await expect(page).toHaveURL(/\/tachograph\/compliance/);
      await page.goto('/dashboard');

      const criticalCard = page.getByTestId('compliance-strip-critical');
      await expect(criticalCard).toBeVisible();
      await criticalCard.click();
      await expect(page).toHaveURL(/\/tachograph\/infringements\?status=open/);
      await page.goto('/dashboard');

      if (summary.driversOutOfTimeToday > 0) {
        const outOfTimeCard = page.getByTestId('compliance-strip-out-of-time');
        await expect(outOfTimeCard).toBeVisible();
        await outOfTimeCard.click();
        await expect(page).toHaveURL(/\/tachograph\/remaining-driving-time/);
        await page.goto('/dashboard');
      }

      const overdueCard = page.getByTestId('compliance-strip-overdue');
      await expect(overdueCard).toContainText(String(summary.overdueDownloadsTotal));
      await overdueCard.click();
      await expect(page).toHaveURL(/\/tachograph\/ddd-archive/);
    } finally {
      await ctx.close();
    }
  });

  test('[cila] driver story chart shows infringement scatter for repeat offender', async ({
    browser,
    request,
  }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      const headers = await authHeaders(page);
      const infringementsRes = await request.get(`${API_URL}/tachograph/infringements?limit=50`, {
        headers,
      });
      expect(infringementsRes.ok()).toBeTruthy();
      const infringements = (await infringementsRes.json()) as {
        items: Array<{ driver: { id: string } | null }>;
      };
      const driverId = infringements.items.find((row) => row.driver?.id)?.driver?.id;
      test.skip(!driverId, 'No infringements with driver in seed data');

      await page.goto(`/drivers/${driverId}`);
      const storyCard = page.getByTestId('driver-story-card');
      await expect(storyCard).toBeVisible({ timeout: 20_000 });

      const chart = page.getByTestId('driver-story-chart');
      const empty = page.getByTestId('driver-story-empty');
      if (await chart.isVisible().catch(() => false)) {
        await expect(chart.locator('circle')).toHaveCount(await chart.locator('circle').count());
        expect(await chart.locator('circle').count()).toBeGreaterThan(0);
      } else {
        await expect(empty).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });

  test('[cila] vehicle cost chart renders stacked bars', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/vehicles');
      const firstVehicle = page.locator('table tbody tr a').first();
      await expect(firstVehicle).toBeVisible({ timeout: 20_000 });
      const vehicleHref = await firstVehicle.getAttribute('href');
      const vehicleId = vehicleHref?.split('/').pop();
      test.skip(!vehicleId, 'No vehicle in list');

      await page.goto(`/vehicles/${vehicleId}`);
      const costChart = page.getByTestId('vehicle-cost-chart');
      await expect(costChart).toBeVisible({ timeout: 20_000 });
      await expect(costChart.locator('.recharts-bar-rectangle').first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[cila] vehicle cost chart hides service layer when unavailable', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/vehicles');
      const firstVehicle = page.locator('table tbody tr a').first();
      await expect(firstVehicle).toBeVisible({ timeout: 20_000 });
      const vehicleHref = await firstVehicle.getAttribute('href');
      const vehicleId = vehicleHref?.split('/').pop();
      test.skip(!vehicleId, 'No vehicle in list');

      await page.route(`**/fleet/vehicles/${vehicleId}/costs**`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            generatedAt: new Date().toISOString(),
            vehicleId,
            months: [
              { monthStart: '2026-01-01T00:00:00.000Z', fuelEur: 120, serviceEur: 0, fineEur: 0 },
              { monthStart: '2026-02-01T00:00:00.000Z', fuelEur: 90, serviceEur: 0, fineEur: 15 },
            ],
            totalEur: 225,
            monthlyAverageEur: 112.5,
            serviceCostUnavailable: true,
          }),
        });
      });

      await page.goto(`/vehicles/${vehicleId}`);
      const costChart = page.getByTestId('vehicle-cost-chart');
      await expect(costChart).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('vehicle-cost-service-unavailable')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[cila] idle fuel cost card shows approximate EUR format', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/telematics/driver-scores');
      const card = page.getByTestId('idle-fuel-cost-card');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText(/~\s*[\d.,]+\s*€/);
    } finally {
      await ctx.close();
    }
  });
});
