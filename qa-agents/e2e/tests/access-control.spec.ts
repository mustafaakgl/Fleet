import { test, expect } from '@playwright/test';

/**
 * Access-control smoke tests (Phase 7C — executable, credential-free).
 *
 * These verify the client-side route guards in the Fleet frontend
 * (components/providers/ProtectedRoute.tsx and DriverPortalRoute.tsx):
 *   - An UNauthenticated visitor to a protected route is sent to /login.
 *
 * Why no credentials are required:
 *   The guards run before any data loads; an unauthenticated browser is
 *   redirected to the login form regardless of role. We assert the login
 *   form (`#email`) becomes visible, proving the protected content was not
 *   rendered.
 *
 * Dev auto-login note:
 *   In dev the Fleet frontend auto-logs-in as the default admin unless the
 *   "manual login" flag is set. We prime that flag exactly the way the app
 *   does after an explicit logout — by visiting `/login?manual=1` first — so
 *   the guard's redirect is observable instead of being masked by auto-login.
 *   This does NOT modify any Fleet app code; it only drives the app's own
 *   supported manual-login path.
 *
 * Routes verified (from the Fleet frontend route groups):
 *   - /dashboard         (dashboard group, ProtectedRoute)
 *   - /documents         (dashboard group, ProtectedRoute)
 *   - /driver/documents  (driver-portal group, DriverPortalRoute)
 */

const PROTECTED_ROUTES = [
  { label: 'admin dashboard', path: '/dashboard' },
  { label: 'admin/office documents', path: '/documents' },
  { label: 'driver portal documents', path: '/driver/documents' },
];

/** Disable dev auto-login for this tab by using the app's own manual-login flag. */
async function primeManualLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login?manual=1');
  // The login form must be present once auto-login is bypassed.
  await expect(
    page.locator('#email'),
    'Login form (#email) did not render at /login?manual=1 — selector or route may have changed.',
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('Access Control (auth)', () => {
  test('app login form is reachable for an unauthenticated user', async ({ page }) => {
    await primeManualLogin(page);
    await expect(page.locator('#password')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 15_000 });
  });

  for (const route of PROTECTED_ROUTES) {
    test(`${route.path === '/dashboard' ? '[TM-002]' : route.path === '/documents' ? '[TM-002][TM-057]' : '[TM-002]'} unauthenticated user is redirected from ${route.path} to login`, async ({ page }) => {
      // Prime manual-login so dev auto-login does not mask the guard.
      await primeManualLogin(page);

      // Attempt to open the protected route while unauthenticated.
      await page.goto(route.path);

      // The guard must send us to the login route...
      await expect(
        page,
        `Expected unauthenticated access to ${route.path} (${route.label}) to be ` +
          `redirected to /login, but the URL did not change to the login route.`,
      ).toHaveURL(/\/login/, { timeout: 15_000 });

      // ...and the login form must be shown (protected content not rendered).
      await expect(
        page.locator('#email'),
        `Login form was not shown after redirect from ${route.path}.`,
      ).toBeVisible({ timeout: 15_000 });
    });
  }
});
