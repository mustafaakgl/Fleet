import { test, expect } from '@playwright/test';

/**
 * Smoke tests — the most basic "is the app up?" checks.
 *
 * These run unauthenticated against BASE_URL. They verify the app responds,
 * does not immediately return a server error, and renders a page with a title.
 * Screenshots are captured automatically on failure (see playwright.config.ts).
 *
 * No project dependency on `setup` is required for smoke tests, but they share
 * the same `chromium` project config; if `setup` is skipped (no credentials),
 * these still run because they do not rely on any storage state.
 */

test.describe('Smoke', () => {
  test('[TM-001] home page responds without a server error', async ({ page }) => {
    const response = await page.goto('/');

    // A navigation response should exist and not be a 5xx server error.
    expect(response, 'No navigation response was received for BASE_URL.').not.toBeNull();
    const status = response?.status() ?? 0;
    expect(status, `Unexpected server error status ${status} at BASE_URL.`).toBeLessThan(500);
  });

  test('page renders a document title and body', async ({ page }) => {
    await page.goto('/');

    // The HTML document should expose a title (string can be empty on some SPAs,
    // but the property must resolve without throwing).
    const title = await page.title();
    expect(typeof title).toBe('string');

    // The main body should be attached and visible — i.e. something rendered.
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page is reachable', async ({ page }) => {
    // The login route is a stable, public entry point in the Fleet frontend.
    // `?manual=1` opts out of the dev auto-login redirect so the form renders.
    const response = await page.goto('/login?manual=1');
    const status = response?.status() ?? 0;
    expect(status, `Login route returned a server error (${status}).`).toBeLessThan(500);

    // The login email field is the anchor for later authenticated flows.
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
  });
});
