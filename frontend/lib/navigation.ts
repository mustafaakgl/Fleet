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
  ClipboardCheck,
  ListTodo,
  Wrench,
  Shield,
  Upload,
  CreditCard,
  Rocket,
  ScrollText,
  Clock,
  IdCard,
  Scale,
  AlertTriangle,
  Euro,
  Droplets,
  Route,
} from 'lucide-react';
import type { Role } from './types';

export type NavItem = {
  href: string;
  labelKey: string;
  icon?: LucideIcon;
  /** Extra indent when rendered inside a collapsible section (e.g. cargo under accidents). */
  nested?: boolean;
};

export type NavSection = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  items: NavItem[];
};

export type NavEntry = NavItem | NavSection;

export type NavGroup = {
  id: string;
  labelKey: string;
  items: NavEntry[];
};

export function isNavSection(entry: NavEntry): entry is NavSection {
  return 'items' in entry;
}

export function isVehicleListPath(pathname: string): boolean {
  if (pathname === '/vehicles') return true;
  if (pathname.startsWith('/vehicles/assignments')) return false;
  return pathname.startsWith('/vehicles/');
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.startsWith('/reminders/')) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === '/vehicles') return isVehicleListPath(pathname);
  if (href === '/service-history') {
    return pathname === '/service-history' || pathname.startsWith('/service-history/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavSectionActive(pathname: string, section: NavSection): boolean {
  return section.items.some((item) => isNavItemActive(pathname, item.href));
}

const ALL_ITEMS: Record<string, NavItem> = {
  dashboard: { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  officeQueue: { href: '/office/queue', labelKey: 'nav.officeQueue', icon: ListTodo },
  assignments: { href: '/assignments', labelKey: 'nav.assignments', icon: CalendarDays },
  liveTracking: { href: '/live-tracking', labelKey: 'nav.liveTracking', icon: MapPinned },
  requests: { href: '/requests', labelKey: 'nav.requests', icon: ClipboardList },
  messenger: { href: '/messenger', labelKey: 'nav.messenger', icon: MessageSquare },
  drivers: { href: '/drivers', labelKey: 'nav.drivers', icon: Users },
  companies: { href: '/companies', labelKey: 'nav.companies', icon: Building2 },
  documents: { href: '/documents', labelKey: 'nav.documents', icon: FileText },
  serviceHistory: { href: '/service-history', labelKey: 'nav.service.history', icon: Wrench },
  workSessions: { href: '/work-sessions', labelKey: 'nav.workSessions', icon: Clock },
  licenseChecks: { href: '/license-checks', labelKey: 'nav.licenseChecks', icon: IdCard },
  fines: { href: '/fines', labelKey: 'nav.fines', icon: Scale },
  departureChecks: { href: '/departure-checks', labelKey: 'nav.departureChecks', icon: ClipboardCheck },
  defects: { href: '/defects', labelKey: 'nav.defects', icon: AlertTriangle },
  costs: { href: '/costs', labelKey: 'nav.costs', icon: Euro },
  fleetFuelAnalytics: {
    href: '/fleet-analytics/fuel',
    labelKey: 'nav.fleetFuelAnalytics',
    icon: Droplets,
  },
  fleetTripHistory: {
    href: '/fleet-analytics/trips',
    labelKey: 'nav.fleetTripHistory',
    icon: Route,
  },
};

const VEHICLES_SECTION_BASE: NavItem[] = [
  { href: '/vehicles', labelKey: 'nav.vehicles.list' },
  { href: '/vehicles/assignments', labelKey: 'nav.vehicles.assignments' },
];

/** Office layout: no financial cost page. */
const VEHICLES_SECTION: NavSection = {
  id: 'vehicles',
  labelKey: 'nav.vehicles',
  icon: Truck,
  items: [
    ...VEHICLES_SECTION_BASE,
    { href: '/fleet-analytics/trips', labelKey: 'nav.fleetTripHistory' },
  ],
};

/** Full layout (admin, boss, accounting): includes vehicle costs. */
const VEHICLES_SECTION_FULL: NavSection = {
  id: 'vehicles',
  labelKey: 'nav.vehicles',
  icon: Truck,
  items: [
    ...VEHICLES_SECTION_BASE,
    { href: '/costs', labelKey: 'nav.costs' },
    { href: '/fleet-analytics/trips', labelKey: 'nav.fleetTripHistory' },
  ],
};

const CHECKS_SECTION: NavSection = {
  id: 'checks',
  labelKey: 'nav.section.checks',
  icon: ClipboardCheck,
  items: [
    { href: '/license-checks', labelKey: 'nav.licenseChecks' },
    { href: '/departure-checks', labelKey: 'nav.departureChecks' },
    { href: '/defects', labelKey: 'nav.defects' },
  ],
};

const REMINDERS_SECTION: NavSection = {
  id: 'reminders',
  labelKey: 'nav.reminders',
  icon: Bell,
  items: [
    { href: '/reminders/service', labelKey: 'nav.reminders.service' },
    { href: '/reminders/vehicle', labelKey: 'nav.reminders.vehicle' },
    { href: '/reminders/contact', labelKey: 'nav.reminders.contact' },
    { href: '/accidents', labelKey: 'nav.accidents' },
    { href: '/cargo-damage', labelKey: 'nav.cargoDamage', nested: true },
  ],
};

function item(key: keyof typeof ALL_ITEMS): NavItem {
  return ALL_ITEMS[key];
}

function group(id: string, labelKey: string, entries: NavEntry[]): NavGroup {
  return { id, labelKey, items: entries };
}

/** Office-first: daily work surfaced at the top, master data grouped below. */
const OFFICE_NAV: NavGroup[] = [
  group('daily', 'nav.group.daily', [
    item('dashboard'),
    item('officeQueue'),
    item('fleetFuelAnalytics'),
    item('assignments'),
    item('liveTracking'),
    item('requests'),
  ]),
  group('fleet', 'nav.group.fleet', [
    item('drivers'),
    VEHICLES_SECTION,
    item('companies'),
    item('serviceHistory'),
    REMINDERS_SECTION,
    item('messenger'),
  ]),
  group('compliance', 'nav.group.compliance', [
    item('documents'),
    CHECKS_SECTION,
    item('fines'),
    item('workSessions'),
  ]),
];

/** Default operational layout (admin, boss, accounting). */
const DEFAULT_NAV: NavGroup[] = [
  group('overview', 'nav.group.overview', [
    item('dashboard'),
    item('fleetFuelAnalytics'),
    item('assignments'),
    item('liveTracking'),
  ]),
  group('master', 'nav.group.master', [
    item('drivers'),
    VEHICLES_SECTION_FULL,
    item('companies'),
    item('documents'),
    item('serviceHistory'),
    REMINDERS_SECTION,
    item('messenger'),
  ]),
  group('operations', 'nav.group.operations', [
    item('requests'),
    CHECKS_SECTION,
    item('fines'),
    item('workSessions'),
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
  return groups.flatMap((group) =>
    group.items.flatMap((entry) => (isNavSection(entry) ? entry.items : [entry])),
  );
}
