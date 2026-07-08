import { expect, test } from '@playwright/test';
import { flattenNavGroups, getNavigationForRole } from '../../../../frontend/lib/navigation';
import type { Role } from '../../../../frontend/lib/types';

const ADMIN_ROLE: Role = 'admin';

const ROUTES = Array.from(
  new Set(
    flattenNavGroups(getNavigationForRole(ADMIN_ROLE))
      .map((item) => item.href)
      .filter((href) => href.startsWith('/')),
  ),
).sort();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('Dashboard route sweep', () => {
  test('[TM-400] admin dashboard routes from navigation stay healthy', async ({ page }) => {
    test.setTimeout(180_000);

    const dashboardResponse = await page.goto('/dashboard', { waitUntil: 'commit' });
    expect(dashboardResponse, 'No navigation response was received for /dashboard.').not.toBeNull();
    expect(dashboardResponse?.status() ?? 0, 'Unexpected server error at /dashboard.').toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();

    for (const route of ROUTES) {
      await test.step(route, async () => {
        const apiFailures: Array<{ method: string; status: number; url: string }> = [];

        const responseListener = (response: { request(): { method(): string }; status(): number; url(): string }) => {
          const url = response.url();
          if (!url.includes('/api/v1/') || url.includes('/api/v1/auth/')) {
            return;
          }

          const status = response.status();
          if (status >= 400) {
            apiFailures.push({
              method: response.request().method(),
              status,
              url,
            });
          }
        };

        page.on('response', responseListener);

        try {
          const navigationResponse = await page.goto(route, { waitUntil: 'commit' });

          expect(
            navigationResponse,
            `No navigation response was received for ${route}.`,
          ).not.toBeNull();
          expect(navigationResponse?.status() ?? 0, `Unexpected server error at ${route}.`).toBeLessThan(500);

          await expect(page.locator('body')).toBeVisible();
          await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
          await expect(page.getByRole('button', { name: /Try again/i })).toHaveCount(0);
          expect(apiFailures, `API errors while loading ${route}: ${JSON.stringify(apiFailures, null, 2)}`).toEqual([]);
        } finally {
          page.off('response', responseListener);
        }
      });
    }
  });
});