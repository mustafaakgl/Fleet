import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Truck,
  Building2,
  FileText,
  MapPinned,
  CalendarDays,
  Bell,
  MessageSquare,
  ClipboardList,
  ListTodo,
  Wrench,
  Shield,
  Upload,
  CreditCard,
  Rocket,
  ScrollText,
} from 'lucide-react';
import type { Role } from './types';

export type NavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
};

export type NavGroup = {
  id: string;
  labelKey: string;
  items: NavItem[];
};

const ALL_ITEMS: Record<string, NavItem> = {
  dashboard: { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  officeQueue: { href: '/office/queue', labelKey: 'nav.officeQueue', icon: ListTodo },
  assignments: { href: '/assignments', labelKey: 'nav.assignments', icon: CalendarDays },
  liveTracking: { href: '/live-tracking', labelKey: 'nav.liveTracking', icon: MapPinned },
  requests: { href: '/requests', labelKey: 'nav.requests', icon: ClipboardList },
  messenger: { href: '/messenger', labelKey: 'nav.messenger', icon: MessageSquare },
  drivers: { href: '/drivers', labelKey: 'nav.drivers', icon: Users },
  vehicles: { href: '/vehicles', labelKey: 'nav.vehicles', icon: Truck },
  companies: { href: '/companies', labelKey: 'nav.companies', icon: Building2 },
  documents: { href: '/documents', labelKey: 'nav.documents', icon: FileText },
  reminders: { href: '/reminders', labelKey: 'nav.reminders', icon: Bell },
  cargoDamage: { href: '/cargo-damage', labelKey: 'nav.cargoDamage', icon: ClipboardList },
  serviceHistory: { href: '/service-history', labelKey: 'nav.serviceHistory', icon: Wrench },
};

function group(id: string, labelKey: string, keys: (keyof typeof ALL_ITEMS)[]): NavGroup {
  return { id, labelKey, items: keys.map((k) => ALL_ITEMS[k]) };
}

/** Office-first: daily work surfaced at the top, master data grouped below. */
const OFFICE_NAV: NavGroup[] = [
  group('daily', 'nav.group.daily', [
    'dashboard',
    'officeQueue',
    'assignments',
    'liveTracking',
    'requests',
    'messenger',
  ]),
  group('fleet', 'nav.group.fleet', ['drivers', 'vehicles', 'companies']),
  group('compliance', 'nav.group.compliance', ['documents', 'reminders', 'cargoDamage']),
  group('more', 'nav.group.more', ['serviceHistory']),
];

/** Default operational layout (admin, boss, accounting). */
const DEFAULT_NAV: NavGroup[] = [
  group('overview', 'nav.group.overview', [
    'dashboard',
    'assignments',
    'liveTracking',
  ]),
  group('master', 'nav.group.master', ['drivers', 'vehicles', 'companies', 'documents']),
  group('operations', 'nav.group.operations', [
    'requests',
    'cargoDamage',
    'serviceHistory',
    'reminders',
    'messenger',
  ]),
];

const PRIVACY_ITEM: NavItem = {
  href: '/privacy',
  labelKey: 'nav.privacy',
  icon: Shield,
};

const AUDIT_ITEM: NavItem = {
  href: '/audit',
  labelKey: 'nav.audit',
  icon: ScrollText,
};

const IMPORT_ITEM: NavItem = {
  href: '/import',
  labelKey: 'nav.import',
  icon: Upload,
};

const BILLING_ITEM: NavItem = {
  href: '/billing',
  labelKey: 'nav.billing',
  icon: CreditCard,
};

const GETTING_STARTED_ITEM: NavItem = {
  href: '/getting-started',
  labelKey: 'nav.gettingStarted',
  icon: Rocket,
};

export function getNavigationForRole(role: Role): NavGroup[] {
  const groups =
    role === 'office'
      ? OFFICE_NAV.map((group) => ({ ...group, items: [...group.items] }))
      : DEFAULT_NAV.map((group) => ({ ...group, items: [...group.items] }));

  if (role === 'admin' || role === 'boss') {
    const complianceGroup = groups.find((group) => group.id === 'compliance');
    if (complianceGroup) {
      if (role === 'admin') {
        complianceGroup.items.unshift(GETTING_STARTED_ITEM);
        complianceGroup.items.push(PRIVACY_ITEM, IMPORT_ITEM, BILLING_ITEM);
      }
      complianceGroup.items.push(AUDIT_ITEM);
    } else {
      const operationsGroup = groups.find((group) => group.id === 'operations');
      if (operationsGroup) {
        if (role === 'admin') {
          operationsGroup.items.unshift(GETTING_STARTED_ITEM);
          operationsGroup.items.push(PRIVACY_ITEM, IMPORT_ITEM, BILLING_ITEM);
        }
        operationsGroup.items.push(AUDIT_ITEM);
      }
    }
  }

  return groups;
}

export function flattenNavGroups(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
