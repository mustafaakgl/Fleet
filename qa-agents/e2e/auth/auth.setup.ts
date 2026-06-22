import { test as setup, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Role-based authentication setup.
 *
 * Produces Playwright storage states (cookies + localStorage) per role so the
 * RBAC specs can run as a specific user without re-logging-in each time.
 *
 * Detected from the Fleet frontend (frontend/app/login/page.tsx):
 *   - Login route:    /login   (append ?manual=1 to bypass dev auto-login)
 *   - Email input:    #email
 *   - Password input: #password
 *   - Submit button:  button[type="submit"]  (label "Anmelden")
 *   - Auth token is stored in localStorage after a successful sign-in.
 *
 * If selectors change, update the constants below. Credentials are read from
 * environment variables only — never hardcoded. Roles without credentials are
 * skipped with a clear reason (no fake auth state is written).
 */

// ---- Selectors / routes (single source of truth) ---------------------------
const LOGIN_PATH = '/login?manual=1';
const EMAIL_SELECTOR = '#email';
const PASSWORD_SELECTOR = '#password';
const SUBMIT_SELECTOR = 'button[type="submit"]';

const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

// Map each role to its storage-state file and the env vars holding credentials.
const ROLES = [
  { role: 'admin', emailVar: 'ADMIN_EMAIL', passwordVar: 'ADMIN_PASSWORD' },
  { role: 'boss', emailVar: 'BOSS_EMAIL', passwordVar: 'BOSS_PASSWORD' },
  { role: 'accounting', emailVar: 'ACCOUNTING_EMAIL', passwordVar: 'ACCOUNTING_PASSWORD' },
  { role: 'office', emailVar: 'OFFICE_EMAIL', passwordVar: 'OFFICE_PASSWORD' },
  { role: 'driver', emailVar: 'DRIVER_EMAIL', passwordVar: 'DRIVER_PASSWORD' },
] as const;

/**
 * Perform a manual login and assert we left the login page.
 *
 * We do NOT assert a specific post-login URL because it varies by role
 * (/dashboard, /driver, /portal/dashboard). Leaving /login is a safe signal.
 */
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(LOGIN_PATH);

  const emailInput = page.locator(EMAIL_SELECTOR);
  const passwordInput = page.locator(PASSWORD_SELECTOR);
  const submit = page.locator(SUBMIT_SELECTOR);

  // If the expected form is not present, fail loudly with guidance rather than
  // writing an unauthenticated storage state.
  await expect(
    emailInput,
    `Login email input "${EMAIL_SELECTOR}" not found. The Fleet login form may ` +
      `have changed — update the selectors in auth/auth.setup.ts.`,
  ).toBeVisible({ timeout: 15_000 });

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await submit.click();

  // Wait until the app navigates away from the login route.
  await expect(page, 'Login did not complete (still on /login). Check credentials and selectors.')
    .not.toHaveURL(/\/login/, { timeout: 20_000 });
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
