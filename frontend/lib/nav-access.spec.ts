import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NAV_ACCESS, allowedHrefsForRole, type NavRole } from './nav-access';
import { flattenNavGroups, getNavigationForRole } from './navigation';
import type { Role } from './types';

const ROLES: NavRole[] = ['admin', 'boss', 'accounting', 'office', 'driver'];

describe('nav-access', () => {
  /**
   * The sidebar shows the intersection of navigation.ts and NAV_ACCESS, and that
   * intersection *is* the role filter: navigation.ts deliberately offers a superset
   * and this list narrows it per role. So a route being hidden from some role is by
   * design — but a route missing from this list entirely is not. It then reaches
   * nobody, which is how /invoicing (B1) and /fleet-analytics/fuel-card (B2) became
   * unreachable after being added to navigation.ts alone.
   */
  it('grants every navigation route to at least one role', () => {
    const offered = new Set(
      ROLES.flatMap((role) =>
        flattenNavGroups(getNavigationForRole(role as Role)).map((item) => item.href),
      ),
    );
    const known = new Set(NAV_ACCESS.map((rule) => rule.href));
    const unreachable = [...offered].filter((href) => !known.has(href));

    assert.deepEqual(
      unreachable,
      [],
      `navigation.ts offers these but nav-access.ts never grants them: ${unreachable.join(', ')}`,
    );
  });

  /**
   * Einsatzplan sub-pages are real routes reached through the in-page tabs, not
   * through the sidebar tree. They stay in NAV_ACCESS so a direct link or bookmark
   * still resolves. Listed explicitly so a genuinely orphaned rule still fails.
   */
  const TAB_ONLY_ROUTES = new Set([
    '/assignments/daily-overview',
    '/assignments/planning',
    '/assignments/morning-checkins',
    '/assignments/vehicle-handovers',
    '/assignments/company-notifications',
    '/assignments/vacation-planner',
    '/assignments/revenue-summary',
  ]);

  it('has no access rule for a route nothing renders or links to', () => {
    const offered = new Set(
      ROLES.flatMap((role) =>
        flattenNavGroups(getNavigationForRole(role as Role)).map((item) => item.href),
      ),
    );
    const orphaned = NAV_ACCESS.map((rule) => rule.href).filter(
      (href) => !offered.has(href) && !TAB_ONLY_ROUTES.has(href),
    );

    assert.deepEqual(orphaned, [], `nav-access.ts grants routes nothing renders: ${orphaned.join(', ')}`);
  });

  it('routes accounting to outgoing invoices', () => {
    assert.equal(allowedHrefsForRole('accounting').has('/invoicing'), true);
  });

  it('routes accounting to fuel card reconciliation', () => {
    assert.equal(allowedHrefsForRole('accounting').has('/fleet-analytics/fuel-card'), true);
  });

  it('keeps the Stripe subscription page admin-only', () => {
    assert.equal(allowedHrefsForRole('admin').has('/billing'), true);
    for (const role of ROLES.filter((r) => r !== 'admin')) {
      assert.equal(allowedHrefsForRole(role).has('/billing'), false, `${role} must not see /billing`);
    }
  });

  it('lists each href only once', () => {
    const hrefs = NAV_ACCESS.map((rule) => rule.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
  });

  it('grants no route to a role that has none', () => {
    for (const rule of NAV_ACCESS) {
      assert.ok(rule.roles.length > 0, `${rule.href} has no roles`);
    }
  });
});
