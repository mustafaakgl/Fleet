import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  Clock,
  Cpu,
  CreditCard,
  Plug,
  Droplets,
  Euro,
  FileText,
  IdCard,
  LayoutDashboard,
  ListTodo,
  MapPinned,
  MessageSquare,
  Receipt,
  Rocket,
  Route,
  Scale,
  ScrollText,
  Shield,
  Truck,
  Upload,
  Users,
  Wallet,
  Wrench,
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
  collapsible?: boolean;
  defaultExpanded?: boolean;
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
  assignments: { href: '/assignments', labelKey: 'nav.assignments', icon: CalendarDays },
  assignmentsDailyOverview: { href: '/assignments/daily-overview', labelKey: 'nav.assignments.dailyOverview', icon: CalendarDays },
  assignmentsPlanning: { href: '/assignments/planning', labelKey: 'nav.assignments.planning', icon: CalendarDays },
  assignmentsMorningCheckins: { href: '/assignments/morning-checkins', labelKey: 'nav.assignments.morningCheckins', icon: CalendarDays },
  assignmentsVehicleHandovers: { href: '/assignments/vehicle-handovers', labelKey: 'nav.assignments.vehicleHandovers', icon: CalendarDays },
  assignmentsCompanyNotifications: { href: '/assignments/company-notifications', labelKey: 'nav.assignments.companyNotifications', icon: CalendarDays },
  assignmentsVacationPlanner: { href: '/assignments/vacation-planner', labelKey: 'nav.assignments.vacationPlanner', icon: CalendarDays },
  assignmentsRevenueSummary: { href: '/assignments/revenue-summary', labelKey: 'nav.assignments.revenueSummary', icon: CalendarDays },
  officeQueue: { href: '/office/queue', labelKey: 'nav.officeQueue', icon: ListTodo },
  liveTracking: { href: '/live-tracking', labelKey: 'nav.liveTracking', icon: MapPinned },
  requests: { href: '/requests', labelKey: 'nav.requests', icon: ClipboardList },
  messenger: { href: '/messenger', labelKey: 'nav.messenger', icon: MessageSquare },
  notifications: { href: '/notifications', labelKey: 'nav.notifications', icon: Bell },
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
  fleetFuelCard: {
    href: '/fleet-analytics/fuel-card',
    labelKey: 'nav.fleetFuelCard',
    icon: CreditCard,
  },
  fleetTripHistory: {
    href: '/fleet-analytics/trips',
    labelKey: 'nav.fleetTripHistory',
    icon: Route,
  },
  telematicsDriverScores: {
    href: '/telematics/driver-scores',
    labelKey: 'nav.telematics.driverScores',
    icon: IdCard,
  },
  telematicsVehicleHealth: {
    href: '/telematics/vehicle-health',
    labelKey: 'nav.telematics.vehicleHealth',
    icon: Wrench,
  },
  devices: {
    href: '/devices',
    labelKey: 'nav.devices',
    icon: Cpu,
  },
  tachoRemaining: {
    href: '/tachograph/remaining-driving-time',
    labelKey: 'nav.tachograph.remainingDrivingTime',
    icon: Clock,
  },
  tachoInfringements: {
    href: '/tachograph/infringements',
    labelKey: 'nav.tachograph.infringements',
    icon: AlertTriangle,
  },
  tachoDdd: {
    href: '/tachograph/ddd-archive',
    labelKey: 'nav.tachograph.dddArchive',
    icon: FileText,
  },
  tachoCompliance: {
    href: '/tachograph/compliance',
    labelKey: 'nav.tachograph.compliance',
    icon: ClipboardCheck,
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

function group(
  id: string,
  labelKey: string,
  entries: NavEntry[],
  options?: { collapsible?: boolean; defaultExpanded?: boolean },
): NavGroup {
  return { id, labelKey, items: entries, ...options };
}

/** Telematik cihazlardan (FMC130/FMC650) gelen veriler. */
const TELEMATIK_ITEMS: NavEntry[] = [
  item('liveTracking'),
  item('fleetTripHistory'),
  item('fleetFuelAnalytics'),
  item('fleetFuelCard'),
  item('telematicsDriverScores'),
  item('telematicsVehicleHealth'),
  item('devices'),
];

/** Tachograph (FMC650) verileri — uyum / compliance. */
const TACHOGRAPH_ITEMS: NavEntry[] = [
  item('tachoCompliance'),
  item('tachoInfringements'),
  item('tachoRemaining'),
  item('tachoDdd'),
];

const VEHICLES_SECTION_BRIEF: NavSection = {
  id: 'vehicles',
  labelKey: 'nav.vehicles',
  icon: Truck,
  items: [...VEHICLES_SECTION_BASE],
};

const REMINDERS_HUB_ITEM: NavItem = {
  href: '/reminders/service',
  labelKey: 'nav.reminders',
  icon: Bell,
};

/** Office-first: daily work surfaced at the top, master data grouped below. */
const OFFICE_NAV: NavGroup[] = [
  group(
    'heute',
    'nav.group.heute',
    [
      item('dashboard'),
      item('officeQueue'),
      item('assignments'),
      REMINDERS_HUB_ITEM,
      item('messenger'),
      item('notifications'),
    ],
    { collapsible: false, defaultExpanded: true },
  ),
  group(
    'flotte',
    'nav.group.flotte',
    [
      item('drivers'),
      VEHICLES_SECTION,
      item('companies'),
      item('documents'),
      item('serviceHistory'),
    ],
    { collapsible: true, defaultExpanded: true },
  ),
  group('telematik', 'nav.group.telematik', TELEMATIK_ITEMS, { collapsible: true, defaultExpanded: true }),
  group('tachograph', 'nav.group.tachograph', TACHOGRAPH_ITEMS, { collapsible: true, defaultExpanded: false }),
  group(
    'verwaltung',
    'nav.group.verwaltung',
    [
      CHECKS_SECTION,
      REMINDERS_SECTION,
      item('fines'),
      item('workSessions'),
      item('requests'),
    ],
    { collapsible: true, defaultExpanded: false },
  ),
];

/** Heute / Flotte / Verwaltung layout for admin-style roles. */
const DEFAULT_NAV: NavGroup[] = [
  group(
    'heute',
    'nav.group.heute',
    [
      item('dashboard'),
      item('assignments'),
      REMINDERS_HUB_ITEM,
      item('messenger'),
      item('notifications'),
    ],
    { collapsible: false, defaultExpanded: true },
  ),
  group(
    'flotte',
    'nav.group.flotte',
    [
      item('drivers'),
      VEHICLES_SECTION_BRIEF,
      item('companies'),
      item('documents'),
      item('serviceHistory'),
    ],
    { collapsible: true, defaultExpanded: true },
  ),
  group('telematik', 'nav.group.telematik', TELEMATIK_ITEMS, { collapsible: true, defaultExpanded: true }),
  group('tachograph', 'nav.group.tachograph', TACHOGRAPH_ITEMS, { collapsible: true, defaultExpanded: false }),
  group(
    'verwaltung',
    'nav.group.verwaltung',
    [
      CHECKS_SECTION,
      REMINDERS_SECTION,
      item('fines'),
      item('workSessions'),
      item('costs'),
      item('requests'),
    ],
    { collapsible: true, defaultExpanded: false },
  ),
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

/** Stripe subscription for our own product — labelled distinctly from the
 *  "Abrechnung" section it sits in, so it does not read as a duplicate. */
const BILLING_ITEM: NavItem = {
  href: '/billing',
  labelKey: 'nav.billing.subscription',
  icon: CreditCard,
};

/** Outgoing invoices — separate from the Stripe subscription page at /billing. */
const INVOICING_ITEM: NavItem = {
  href: '/invoicing',
  labelKey: 'nav.invoicing',
  icon: Receipt,
};

/** Lohnvorbereitung — DATEV Lohn tarafi; /invoicing (Rechnungswesen) ayri. */
const PAYROLL_ITEM: NavItem = {
  href: '/payroll',
  labelKey: 'nav.payroll',
  icon: Wallet,
};

const AUTOMATION_SECTION_ITEMS: NavItem[] = [
  { href: '/automation/queue', labelKey: 'nav.automation.queue', icon: Inbox },
  { href: '/automation/connectors', labelKey: 'nav.automation.connectors', icon: Plug },
];

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

  if (role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office') {
    // Abrechnung "Heute" grubunda: fatura ve Lohnvorbereitung gunluk isler,
    // ayda bir acilan bir ayar sayfasi degil. Verwaltung altinda kapali bir
    // bolumun icinde duruyordu ve her seferinde iki tik uzaktaydi.
    //
    // Grup collapsible: false — yani bu bolum her zaman gorunur durumda aciliyor.
    const heuteGroup = groups.find((g) => g.id === 'heute');
    if (heuteGroup) {
      // Accounting reaches outgoing invoices through here. The Stripe subscription
      // page is admin-only and shares the section rather than sitting loose in the group.
      const billingSection: NavSection = {
        id: 'billing',
        labelKey: 'nav.billing',
        icon: CreditCard,
        items:
          role === 'admin'
            ? [BILLING_ITEM, INVOICING_ITEM, PAYROLL_ITEM]
            : role === 'office'
              // Office yalnizca giden faturalari goruyor; Lohnvorbereitung
              // maas verisi tasidigi icin finans rollerinde kaliyor.
              ? [INVOICING_ITEM]
              : [INVOICING_ITEM, PAYROLL_ITEM],
      };
      heuteGroup.items.push(billingSection);
    }
  }

  if (role === 'admin' || role === 'boss') {
    const verwaltungGroup = groups.find((g) => g.id === 'verwaltung');
    if (verwaltungGroup) {
      if (role === 'admin') {
        verwaltungGroup.items.unshift(GETTING_STARTED_ITEM);
        verwaltungGroup.items.push(PRIVACY_ITEM, IMPORT_ITEM);
      }
      // Ordivan yalnizca admin/boss: makineye yetki veren ve ajan onerisini
      // onaylayan ekranlar gunluk operasyon degil, yetki devri.
      verwaltungGroup.items.push({
        id: 'automation',
        labelKey: 'nav.automation',
        icon: Bot,
        items: AUTOMATION_SECTION_ITEMS,
      } as NavSection);
      verwaltungGroup.items.push(AUDIT_ITEM);
    }
  }

  return groups;
}

export function flattenNavGroups(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) =>
    group.items.flatMap((entry) => (isNavSection(entry) ? entry.items : [entry])),
  );
}
