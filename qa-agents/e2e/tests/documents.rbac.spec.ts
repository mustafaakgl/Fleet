import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Documents RBAC tests (Phase 7C — executable where data allows).
 *
 * Phase 7A shipped these as unconditional `test.skip(true, ...)` placeholders.
 * Phase 7C converts every check that CAN run into a real, conditional test:
 *
 *   - Role-gated checks run for real when the matching `.auth/<role>.json`
 *     storage state exists (i.e. credentials were provided in `.env.e2e`).
 *     When the storage state is missing they skip with an exact, actionable
 *     reason. We never "fake pass": a skipped check asserts nothing.
 *
 *   - Checks that still depend on an unknown selector or missing test data
 *     (private-document marker, a real document id, a tenant_b document id)
 *     remain skipped and are documented in reports/testability_gaps.md.
 *
 * Confirmed Fleet routes / guard behavior (read-only inspection):
 *   - Admin/office documents:  /documents          (ProtectedRoute)
 *   - Driver portal documents: /driver/documents   (DriverPortalRoute)
 *   - A driver opening a dashboard route is redirected to /driver.
 *   - A non-driver opening the driver portal is redirected to /dashboard.
 */

const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

const ADMIN_DOCUMENTS_ROUTE = '/documents';
const DRIVER_DOCUMENTS_ROUTE = '/driver/documents';

/** Resolve a role's storage-state path, or null if it was never generated. */
function storageStateFor(role: string): string | null {
  const p = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(p) ? p : null;
}

test.describe('Documents RBAC', () => {
  test('[TM-003][TM-060] driver role should NOT access the admin documents page', async ({ browser }) => {
    const state = storageStateFor('driver');
    test.skip(
      !state,
      'Missing .auth/driver.json — set DRIVER_EMAIL/DRIVER_PASSWORD in ' +
        'e2e/.env.e2e to generate the driver storage state and enable this check.',
    );

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto(ADMIN_DOCUMENTS_ROUTE);

      // The dashboard guard must move a driver away from /documents (to /driver).
      await expect(
        page,
        `A driver should not remain on ${ADMIN_DOCUMENTS_ROUTE}; the guard should ` +
          'redirect to the driver portal.',
      ).not.toHaveURL(new RegExp(`${ADMIN_DOCUMENTS_ROUTE}/?$`), { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('[TM-004][TM-060] office role should NOT access the driver portal documents page', async ({ browser }) => {
    const state = storageStateFor('office');
    test.skip(
      !state,
      'Missing .auth/office.json — set OFFICE_EMAIL/OFFICE_PASSWORD in ' +
        'e2e/.env.e2e to generate the office storage state and enable this check.',
    );

    const ctx = await browser.newContext({ storageState: state! });
    const page = await ctx.newPage();
    try {
      await page.goto(DRIVER_DOCUMENTS_ROUTE);

      // The driver-portal guard must move a non-driver away from /driver/*.
      await expect(
        page,
        `An office user should not remain on ${DRIVER_DOCUMENTS_ROUTE}; the driver ` +
          'portal guard should redirect to the office dashboard.',
      ).not.toHaveURL(new RegExp(`${DRIVER_DOCUMENTS_ROUTE}/?$`), { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('[TM-050][TM-060] office role should NOT see private driver salary/medical documents', async () => {
    // Blocked by testability: no stable selector/test-id marks PRIVATE driver
    // salary/medical documents on /documents, and no seed data guarantees such a
    // document exists. Stays skipped even with credentials. See
    // reports/testability_gaps.md (recommended data-testid="document-row-private").
    test.skip(
      true,
      'Blocked by testability: no stable selector marks PRIVATE driver ' +
        'salary/medical documents on ' + ADMIN_DOCUMENTS_ROUTE + ', and no seed ' +
        'data guarantees such a document exists. Also requires .auth/office.json. ' +
        'See reports/testability_gaps.md.',
    );
  });

  test('[TM-051][TM-060] direct-ID document access should be blocked when not authorized', async () => {
    // Blocked by missing test data + route: the Fleet frontend has no
    // document-detail route (no /documents/[id] page) and no known seeded
    // document id for a deterministic unauthorized-access assertion.
    test.skip(
      true,
      'Blocked by missing test data/route: no /documents/[id] detail route and ' +
        'no known seeded document id to attempt an unauthorized direct-ID access. ' +
        'See reports/testability_gaps.md.',
    );
  });

  test('[TM-051][TM-063] tenant_a user should NOT access a tenant_b document', async () => {
    // Blocked by missing test data: requires a known tenant_b document id and a
    // tenant_a storage state. Cross-tenant isolation is exercised by the backend
    // tenant-isolation check; a browser-level assertion needs a seeded id.
    test.skip(
      true,
      'Blocked by missing test data: no seeded tenant_b document id is available ' +
        'to assert cross-tenant isolation from the browser. See ' +
        'reports/testability_gaps.md.',
    );
  });

  // Keep the driver-portal route referenced so it stays documented + lint-clean.
  test('driver portal documents route constant is correct', async () => {
    expect(DRIVER_DOCUMENTS_ROUTE).toBe('/driver/documents');
  });
});
