import type { Role } from './types';

export type NavRole = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';

export type NavAccessRule = {
  href: string;
  roles: NavRole[];
};

/**
 * Which routes each role may see in the sidebar.
 *
 * The sidebar renders the groups from `navigation.ts` but keeps only the entries
 * whose href appears here for the current role — the two lists are intersected.
 * A route missing from this list is therefore invisible even when `navigation.ts`
 * offers it, which is how `/invoicing` and `/fleet-analytics/fuel-card` ended up
 * unreachable. `nav-access.spec.ts` guards that invariant.
 *
 * Labels and icons live in `navigation.ts`; this file carries access only.
 */
export const NAV_ACCESS: NavAccessRule[] = [
  { href: '/dashboard', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/office/queue', roles: ['office'] },
  { href: '/assignments', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/daily-overview', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/planning', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/morning-checkins', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/vehicle-handovers', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/company-notifications', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/vacation-planner', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/assignments/revenue-summary', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/live-tracking', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/reminders/service', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/messenger', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/notifications', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/drivers', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/vehicles', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/vehicles/assignments', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/fleet-analytics/trips', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/telematics/driver-scores', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/telematics/vehicle-health', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/devices', roles: ['admin', 'boss', 'office'] },
  { href: '/tachograph/remaining-driving-time', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/tachograph/infringements', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/tachograph/ddd-archive', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/tachograph/compliance', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/companies', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/documents', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/service-history', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/license-checks', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/departure-checks', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/defects', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/reminders/vehicle', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/reminders/contact', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/accidents', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/cargo-damage', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/fines', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/work-sessions', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/fleet-analytics/fuel', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/fleet-analytics/fuel-card', roles: ['admin', 'boss', 'accounting', 'office'] },
  { href: '/requests', roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { href: '/costs', roles: ['admin', 'boss', 'accounting'] },
  { href: '/getting-started', roles: ['admin'] },
  { href: '/privacy', roles: ['admin'] },
  { href: '/import', roles: ['admin'] },
  { href: '/billing', roles: ['admin'] },
  { href: '/invoicing', roles: ['admin', 'boss', 'accounting'] },
  { href: '/payroll', roles: ['admin', 'boss', 'accounting'] },
  { href: '/audit', roles: ['admin', 'boss'] },
];

export function allowedHrefsForRole(role: NavRole | Role): Set<string> {
  return new Set(
    NAV_ACCESS.filter((rule) => rule.roles.includes(role as NavRole)).map((rule) => rule.href),
  );
}
