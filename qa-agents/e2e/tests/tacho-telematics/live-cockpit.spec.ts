import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');
const SNAPSHOT_DIR = path.join(__dirname, '..', '..', '__snapshots__', 'premium-cila');

function storageStateFor(role: string): string | null {
  const statePath = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(statePath) ? statePath : null;
}

function chipCount(text: string): number {
  const match = text.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
}

test.describe('Session 12 live cockpit', () => {
  test('[cockpit] moving chip filters list', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();

    try {
      await page.goto('/live-tracking');
      await expect(page.getByTestId('live-status-strip')).toBeVisible({ timeout: 20_000 });

      const movingChip = page.getByTestId('live-status-chip-moving');
      const count = chipCount((await movingChip.innerText()).trim());
      test.skip(count < 1, 'No moving vehicles in current seed/sim state');

      await movingChip.click();
      const rows = page.getByTestId('live-tracking-row');
      const totalRows = await rows.count();
      expect(totalRows).toBeGreaterThan(0);

      for (let i = 0; i < totalRows; i += 1) {
        await expect(rows.nth(i)).toHaveAttribute('data-motion', 'moving');
      }
    } finally {
      await ctx.close();
    }
  });

  test('[cockpit] alarm chip and marker dot for alarm vehicle', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();

    try {
      await page.goto('/live-tracking');
      await expect(page.getByTestId('live-status-strip')).toBeVisible({ timeout: 20_000 });

      const alarmChip = page.getByTestId('live-status-chip-alarm');
      const alarmCount = chipCount((await alarmChip.innerText()).trim());
      test.skip(alarmCount < 1, 'No alarm vehicles in current fuel-theft sim state');

      await alarmChip.click();
      const rows = page.getByTestId('live-tracking-row');
      await expect(rows.first()).toBeVisible();

      const markerBadge = page.locator('.vehicle-direction-marker span').first();
      await expect(markerBadge).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[cockpit] selecting vehicle renders trail and remaining block', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();

    try {
      await page.goto('/live-tracking');
      const firstRow = page.getByTestId('live-tracking-row').first();
      await expect(firstRow).toBeVisible({ timeout: 20_000 });
      await firstRow.click();

      await expect(page.locator('path.live-trail-segment').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('remaining-block')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('remaining-driving-radial')).toBeVisible({ timeout: 20_000 });
    } finally {
      await ctx.close();
    }
  });

  test('[cockpit] follow mode auto-disables on manual map drag', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();

    try {
      await page.goto('/live-tracking');
      const firstRow = page.getByTestId('live-tracking-row').first();
      await expect(firstRow).toBeVisible({ timeout: 20_000 });
      await firstRow.click();

      const followToggle = page.getByTestId('follow-mode-toggle');
      await followToggle.click();
      await expect(followToggle).toContainText(/On|Açık|An/);

      const map = page.getByTestId('live-tracking-map');
      await map.hover();
      await page.mouse.down();
      await page.mouse.move(80, 0, { steps: 8 });
      await page.mouse.up();

      await expect(followToggle).toContainText(/Off|Kapalı|Aus/);
    } finally {
      await ctx.close();
    }
  });

  test('[cockpit] clusters appear for dense fleets while selected marker stays visible', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();

    try {
      await page.goto('/live-tracking');
      await expect(page.getByTestId('live-status-strip')).toBeVisible({ timeout: 20_000 });

      const rows = page.getByTestId('live-tracking-row');
      const rowCount = await rows.count();
      test.skip(rowCount < 25, 'Need mock-fleet >=25 visible markers for clustering');

      await rows.first().click();
      await expect(page.locator('.marker-cluster').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.vehicle-direction-marker').first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('[cockpit] visual regression live tracking cockpit', async ({ browser }) => {
    const state = storageStateFor('admin');
    test.skip(!state, 'Missing .auth/admin.json');

    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();

    try {
      await page.goto('/live-tracking');
      await expect(page.getByTestId('live-status-strip')).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveScreenshot(path.join(SNAPSHOT_DIR, 'live-tracking-cockpit.png'), {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await ctx.close();
    }
  });
});
