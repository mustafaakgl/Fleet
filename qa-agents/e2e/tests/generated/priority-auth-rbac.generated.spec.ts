import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');

function storageStateFor(role: string): string | null {
  const p = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(p) ? p : null;
}

test('[TM-001] logout then browser back should not expose protected page', async ({ page }) => {
  const state = storageStateFor('admin');
  test.skip(!state, 'Missing .auth/admin.json — configure ADMIN_* credentials to enable TM-001.');

    const browser = page.context().browser();
    test.skip(!browser, 'Browser context unavailable for TM-001.');
    const context = await browser!.newContext({ storageState: state! });
    const authedPage = await context.newPage();

  await authedPage.goto('/dashboard');
  await expect(authedPage).toHaveURL(/\/dashboard/, { timeout: 15000 });

  const logoutButton = authedPage.getByRole('button', {
    name: /logout|log out|abmelden|çıkış|sign out/i,
  });
  await expect(logoutButton.first()).toBeVisible({ timeout: 15000 });
  await logoutButton.first().click();

  await expect(authedPage).toHaveURL(/\/login/, { timeout: 15000 });
  await authedPage.goBack();
  await expect(authedPage).toHaveURL(/\/login/, { timeout: 15000 });

    await context.close();
});

test('[TM-004] office should not access finance route if route exists', async ({ browser }) => {
  const state = storageStateFor('office');
  test.skip(!state, 'Missing .auth/office.json — configure OFFICE_* credentials to enable TM-004.');

    const context = await browser.newContext({ storageState: state! });
    const page = await context.newPage();
  await page.goto('/billing');

  // Security expectation: office must not remain on the billing route.
  await expect(page).not.toHaveURL(/\/billing\/?$/, { timeout: 15000 });
    await context.close();
});
