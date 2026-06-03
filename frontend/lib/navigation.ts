import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Truck,
  Building2,
  FileText,
  Radar,
  MapPinned,
  CalendarDays,
  Bell,
  MessageSquare,
  Shield,
  ClipboardList,
  Settings,
  Wrench,
} from 'lucide-react';
import type { Role } from './types';
import { canManageSettings } from './permissions';

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
  flottenmonitor: { href: '/flottenmonitor', labelKey: 'nav.flottenmonitor', icon: Radar },
  serviceHistory: { href: '/service-history', labelKey: 'nav.serviceHistory', icon: Wrench },
  dsgvo: { href: '/dsgvo', labelKey: 'nav.dsgvo', icon: Shield },
  settings: { href: '/settings', labelKey: 'nav.settings', icon: Settings },
};

function group(id: string, labelKey: string, keys: (keyof typeof ALL_ITEMS)[]): NavGroup {
  return { id, labelKey, items: keys.map((k) => ALL_ITEMS[k]) };
}

/** Office-first: daily work surfaced at the top, master data grouped below. */
const OFFICE_NAV: NavGroup[] = [
  group('daily', 'nav.group.daily', [
    'dashboard',
    'assignments',
    'liveTracking',
    'requests',
    'messenger',
  ]),
  group('fleet', 'nav.group.fleet', ['drivers', 'vehicles', 'companies']),
  group('compliance', 'nav.group.compliance', ['documents', 'reminders', 'cargoDamage']),
  group('more', 'nav.group.more', ['flottenmonitor', 'serviceHistory', 'dsgvo']),
];

/** Default operational layout (admin, boss, accounting). */
const DEFAULT_NAV: NavGroup[] = [
  group('overview', 'nav.group.overview', [
    'dashboard',
    'assignments',
    'liveTracking',
    'flottenmonitor',
  ]),
  group('master', 'nav.group.master', ['drivers', 'vehicles', 'companies', 'documents']),
  group('operations', 'nav.group.operations', [
    'requests',
    'cargoDamage',
    'serviceHistory',
    'reminders',
    'messenger',
  ]),
  group('admin', 'nav.group.admin', ['dsgvo']),
];

function appendSettings(groups: NavGroup[], role: Role): NavGroup[] {
  if (!canManageSettings(role)) return groups;
  return [
    ...groups,
    group('settings', 'nav.group.settings', ['settings']),
  ];
}

export function getNavigationForRole(role: Role): NavGroup[] {
  const base = role === 'office' ? OFFICE_NAV : DEFAULT_NAV;
  return appendSettings(base, role);
}

export function flattenNavGroups(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
