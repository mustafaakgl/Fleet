import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');
const SNAPSHOT_DIR = path.join(__dirname, '..', '..', '__snapshots__', 'premium-cila');

function storageStateFor(role: string): string | null {
  const statePath = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(statePath) ? statePath : null;
}

test.describe('Session 11 premium polish', () => {
  test('[premium] compliance skeleton on slow network then content without refetch flash', async ({
    browser,
  }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.route('**/tachograph/compliance/overview**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });

      await page.goto('/tachograph/compliance');
      await expect(page.getByTestId('page-skeleton')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('page-skeleton')).toBeHidden({ timeout: 20_000 });

      const skeletonVisibleDuringPoll = await page.evaluate(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return Boolean(document.querySelector('[data-testid="page-skeleton"]'));
      });
      expect(skeletonVisibleDuringPoll).toBe(false);
    } finally {
      await ctx.close();
    }
  });

  test('[premium] connection banner on SSE failure', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.route('**/tracking/live/stream**', (route) => route.abort());
      await page.goto('/live-tracking');
      await expect(page.getByTestId('connection-banner')).toBeVisible({ timeout: 20_000 });
      await page.unroute('**/tracking/live/stream**');
      await page.reload();
    } finally {
      await ctx.close();
    }
  });

  test('[premium] page titles follow template', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/compliance');
      await expect(page).toHaveTitle(/· Fleet$/);
      await page.goto('/telematics/vehicle-health');
      await expect(page).toHaveTitle(/· Fleet$/);
    } finally {
      await ctx.close();
    }
  });

  test('[premium] dark mode uses CARTO dark tiles', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({
      storageState: state!,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    try {
      await page.goto('/live-tracking');
      await page.waitForSelector('.leaflet-tile-pane img', { timeout: 20_000 });
      const tileSrc = await page.locator('.leaflet-tile-pane img').first().getAttribute('src');
      expect(tileSrc ?? '').toContain('dark_all');
    } finally {
      await ctx.close();
    }
  });

  test('[premium] visual regression seed compliance', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/compliance');
      await expect(page.getByTestId('page-skeleton')).toBeHidden({ timeout: 20_000 });
      await expect(page).toHaveScreenshot(path.join(SNAPSHOT_DIR, 'compliance.png'), {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await ctx.close();
    }
  });

  test('[premium] visual regression seed infringements', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/tachograph/infringements');
      await expect(page.getByTestId('page-skeleton')).toBeHidden({ timeout: 20_000 });
      await expect(page).toHaveScreenshot(path.join(SNAPSHOT_DIR, 'infringements.png'), {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await ctx.close();
    }
  });

  test('[premium] visual regression seed vehicle-health', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto('/telematics/vehicle-health');
      await expect(page.getByTestId('page-skeleton')).toBeHidden({ timeout: 20_000 });
      await expect(page).toHaveScreenshot(path.join(SNAPSHOT_DIR, 'vehicle-health.png'), {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await ctx.close();
    }
  });
});
