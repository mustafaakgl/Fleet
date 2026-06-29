'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Droplets,
  FileText,
  IdCard,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPinned,
  Menu,
  MessageSquare,
  Rocket,
  Route,
  Scale,
  ScrollText,
  Shield,
  Truck,
  Upload,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { OperionLogo } from '@/components/brand/OperionLogo';
import { getUser, performLogout } from '@/lib/auth';
import {
  getNavigationForRole,
  isNavItemActive,
  isNavSection,
  isNavSectionActive,
  type NavEntry,
  type NavItem,
  type NavSection,
} from '@/lib/navigation';
import type { AuthUser, Role } from '@/lib/types';
import { useTranslation } from 'react-i18next';

type SidebarRole = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';

type RoleNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: SidebarRole[];
};

const NAV_ITEMS: RoleNavItem[] = [
  { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { label: 'nav.officeQueue', href: '/office/queue', icon: ListTodo, roles: ['office'] },
  { label: 'nav.assignments', href: '/assignments', icon: CalendarDays, roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { label: 'nav.liveTracking', href: '/live-tracking', icon: MapPinned, roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { label: 'nav.reminders', href: '/reminders/service', icon: Bell, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.messenger', href: '/messenger', icon: MessageSquare, roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { label: 'nav.drivers', href: '/drivers', icon: Users, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.vehicles.list', href: '/vehicles', icon: Truck, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.vehicles.assignments', href: '/vehicles/assignments', icon: Truck, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.fleetTripHistory', href: '/fleet-analytics/trips', icon: Route, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.companies', href: '/companies', icon: Building2, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.documents', href: '/documents', icon: FileText, roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { label: 'nav.service.history', href: '/service-history', icon: Wrench, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.section.checks', href: '/license-checks', icon: ClipboardCheck, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.departureChecks', href: '/departure-checks', icon: ClipboardCheck, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.defects', href: '/defects', icon: AlertTriangle, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.reminders.vehicle', href: '/reminders/vehicle', icon: Bell, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.reminders.contact', href: '/reminders/contact', icon: Bell, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.accidents', href: '/accidents', icon: AlertTriangle, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.cargoDamage', href: '/cargo-damage', icon: AlertTriangle, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.fines', href: '/fines', icon: Scale, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.workSessions', href: '/work-sessions', icon: Clock, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.fleetFuelAnalytics', href: '/fleet-analytics/fuel', icon: Droplets, roles: ['admin', 'boss', 'accounting', 'office'] },
  { label: 'nav.requests', href: '/requests', icon: ClipboardList, roles: ['admin', 'boss', 'accounting', 'office', 'driver'] },
  { label: 'nav.costs', href: '/costs', icon: CreditCard, roles: ['admin', 'boss', 'accounting'] },
  { label: 'nav.gettingStarted', href: '/getting-started', icon: Rocket, roles: ['admin'] },
  { label: 'nav.privacy', href: '/privacy', icon: Shield, roles: ['admin'] },
  { label: 'nav.import', href: '/import', icon: Upload, roles: ['admin'] },
  { label: 'nav.billing', href: '/billing', icon: CreditCard, roles: ['admin'] },
  { label: 'nav.audit', href: '/audit', icon: ScrollText, roles: ['admin', 'boss'] },
];

const navConfig: Record<SidebarRole, RoleNavItem[]> = {
  admin: NAV_ITEMS.filter((item) => item.roles.includes('admin')),
  boss: NAV_ITEMS.filter((item) => item.roles.includes('boss')),
  accounting: NAV_ITEMS.filter((item) => item.roles.includes('accounting')),
  office: NAV_ITEMS.filter((item) => item.roles.includes('office')),
  driver: NAV_ITEMS.filter((item) => item.roles.includes('driver')),
};

const SIDEBAR_BG = 'bg-[#1E293B]';
const SIDEBAR_BORDER = 'border-slate-700';
const NAV_ROW = 'flex min-h-[40px] items-center gap-2.5 rounded-md px-3 text-[13px] leading-5 transition-colors';
const NAV_IDLE = 'text-slate-100 hover:bg-slate-700';
const NAV_ACTIVE = 'bg-blue-600 text-white rounded-md';

export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);
  const [user] = useState<AuthUser | null>(() => getUser());

  const role = useMemo<SidebarRole>(() => {
    const currentRole = user?.role;
    if (
      currentRole === 'admin' ||
      currentRole === 'boss' ||
      currentRole === 'accounting' ||
      currentRole === 'office' ||
      currentRole === 'driver'
    ) {
      return currentRole;
    }
    return 'office';
  }, [user?.role]);

  const allowedNavItems = useMemo(() => navConfig[role], [role]);
  const allowedHrefs = useMemo(() => new Set(allowedNavItems.map((item) => item.href)), [allowedNavItems]);

  const navGroups = useMemo(() => {
    const baseGroups = getNavigationForRole(role as Role);

    return baseGroups
      .map((group) => {
        const filteredEntries = group.items.flatMap((entry) => {
          if (isNavSection(entry)) {
            const sectionItems = entry.items.filter((item) => allowedHrefs.has(item.href));
            if (sectionItems.length === 0) return [];
            return [{ ...entry, items: sectionItems }];
          }

          return allowedHrefs.has(entry.href) ? [entry] : [];
        });

        return { ...group, items: filteredEntries };
      })
      .filter((group) => group.items.length > 0);
  }, [role, allowedHrefs]);
  const isFleetOps = Boolean(user?.fleet_ops);
  const navScrollRef = useRef<HTMLElement>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = { ...current };
      let changed = false;
      for (const group of navGroups) {
        if (next[group.id] === undefined) {
          next[group.id] = group.defaultExpanded ?? group.id === 'heute';
          changed = true;
        }
        if (group.collapsible !== false) {
          const groupActive = group.items.some((entry) =>
            isNavSection(entry)
              ? isNavSectionActive(pathname, entry)
              : isNavItemActive(pathname, entry.href),
          );
          if (groupActive && !next[group.id]) {
            next[group.id] = true;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [pathname, navGroups]);

  useEffect(() => {
    setExpandedSections((current) => {
      let changed = false;
      const next = { ...current };
      for (const group of navGroups) {
        for (const entry of group.items) {
          if (isNavSection(entry) && isNavSectionActive(pathname, entry) && !next[entry.id]) {
            next[entry.id] = true;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [pathname, navGroups]);

  useEffect(() => {
    const nav = navScrollRef.current;
    if (!nav) return;

    const frame = window.requestAnimationFrame(() => {
      const active = nav.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) return;
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, expandedSections, tabletCollapsed, mobileOpen, navGroups]);

  function toggleGroup(groupId: string, groupActive: boolean, collapsible?: boolean) {
    if (collapsible === false) return;
    setExpandedGroups((current) => {
      const isOpen = current[groupId] ?? groupActive;
      return { ...current, [groupId]: !isOpen };
    });
  }

  function toggleSection(sectionId: string, sectionActive: boolean) {
    setExpandedSections((current) => {
      const isOpen = current[sectionId] ?? sectionActive;
      return { ...current, [sectionId]: !isOpen };
    });
  }

  function renderNavItem(item: NavItem, nested = false) {
    const Icon = item.icon;
    const isActive = isNavItemActive(pathname, item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        data-nav-active={isActive ? 'true' : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          NAV_ROW,
          'font-medium',
          nested ? 'pl-9 pr-3' : '',
          !nested && tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
          isActive ? NAV_ACTIVE : NAV_IDLE,
        )}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-current" /> : null}
        <span className={cn(tabletCollapsed && !nested ? 'hidden lg:inline' : 'inline')}>
          {t(item.labelKey)}
        </span>
      </Link>
    );
  }

  function renderNavSection(section: NavSection) {
    const sectionActive = isNavSectionActive(pathname, section);
    const expanded = expandedSections[section.id] ?? sectionActive;
    const SectionIcon = section.icon;
    const showChildren = expanded;

    return (
      <div key={section.id} className="space-y-0.5">
        <button
          type="button"
          onClick={() => toggleSection(section.id, sectionActive)}
          className={cn(
            NAV_ROW,
            'w-full font-medium',
            tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
            sectionActive ? NAV_ACTIVE : NAV_IDLE,
          )}
        >
          <SectionIcon className="h-4 w-4 shrink-0 text-current" />
          <span className={cn('flex-1 text-left', tabletCollapsed ? 'hidden lg:inline' : 'inline')}>
            {t(section.labelKey)}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
              tabletCollapsed ? 'hidden lg:block' : 'block',
              showChildren ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>

        {showChildren ? (
          <div
            className={cn(
              'relative space-y-0.5',
              tabletCollapsed ? 'hidden lg:block' : 'block',
            )}
          >
            <span className="absolute bottom-1 left-[1.35rem] top-1 w-px bg-blue-200/20" aria-hidden />
            {section.items.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-nav-active={isActive ? 'true' : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'relative flex min-h-[36px] items-center rounded-md py-1.5 pr-3 text-[13px] leading-5 transition-colors',
                    item.nested ? 'pl-14' : 'pl-9',
                    isActive ? NAV_ACTIVE : NAV_IDLE,
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                      item.nested ? 'left-[2.35rem]' : 'left-[1.22rem]',
                      isActive ? 'bg-white' : 'bg-slate-400',
                    )}
                    aria-hidden
                  />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  function renderNavEntry(entry: NavEntry) {
    if (isNavSection(entry)) return renderNavSection(entry);
    return renderNavItem(entry);
  }

  function handleLogout() {
    performLogout('/login');
  }

  function renderFooterLink(href: string, label: string, icon: ReactNode, active = false) {
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          NAV_ROW,
          'font-medium',
          tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
          active ? NAV_ACTIVE : NAV_IDLE,
        )}
      >
        {icon}
        <span className={cn(tabletCollapsed ? 'hidden lg:inline' : 'inline')}>{label}</span>
      </Link>
    );
  }

  function renderNavContent() {
    return (
      <div className="flex h-full flex-col">
        <div className={cn('relative overflow-hidden border-b px-2 py-2', SIDEBAR_BG, SIDEBAR_BORDER)}>
          <button
            type="button"
            onClick={() => setTabletCollapsed((current) => !current)}
            className={cn(
              'absolute right-1 z-10 hidden rounded-md border p-1.5 text-slate-100 hover:bg-slate-700 md:inline-flex lg:hidden',
              SIDEBAR_BORDER,
            )}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-4 w-4 text-current" />
          </button>
          <div
            className={cn(
              'flex w-full items-center',
              tabletCollapsed ? 'justify-center lg:justify-stretch' : 'justify-stretch',
              tabletCollapsed ? 'h-12 lg:h-[4.5rem]' : 'h-[4.5rem] lg:h-[5rem]',
            )}
          >
            <OperionLogo
              href="/dashboard"
              compact={tabletCollapsed}
              variant="sidebar"
              priority
            />
          </div>
        </div>

        <nav
          ref={navScrollRef}
          className="scrollbar-hide flex-1 space-y-4 overflow-y-auto overscroll-contain px-2.5 py-3"
        >
          {navGroups.map((group) => {
            const groupActive = group.items.some((entry) =>
              isNavSection(entry)
                ? isNavSectionActive(pathname, entry)
                : isNavItemActive(pathname, entry.href),
            );
            const groupExpanded = group.collapsible === false
              ? true
              : (expandedGroups[group.id] ?? group.defaultExpanded ?? group.id === 'heute');

            return (
            <div key={group.id}>
              {group.collapsible === false ? (
                <p
                  className={cn(
                    'mb-1 px-3 text-xs font-medium text-slate-400',
                    tabletCollapsed ? 'hidden lg:block' : 'block',
                  )}
                >
                  {t(group.labelKey)}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id, groupActive, group.collapsible)}
                  className={cn(
                    'mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-xs font-medium text-slate-400 hover:bg-slate-700',
                    tabletCollapsed ? 'hidden lg:flex' : 'flex',
                  )}
                >
                  <span>{t(group.labelKey)}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      groupExpanded ? 'rotate-0' : '-rotate-90',
                    )}
                  />
                </button>
              )}
              {groupExpanded ? (
              <div className="space-y-0.5">
                {group.items.map((entry) => renderNavEntry(entry))}
              </div>
              ) : null}
            </div>
            );
          })}
        </nav>

        <div className={cn('space-y-0.5 border-t px-2.5 pb-4 pt-3', SIDEBAR_BORDER)}>
          {isFleetOps &&
            renderFooterLink(
              '/admin/tenants',
              t('nav.fleetOps'),
              <Building2 className="h-4 w-4 shrink-0 text-current" />,
              pathname === '/admin/tenants',
            )}
          <button
            onClick={handleLogout}
            className={cn(
              NAV_ROW,
              'w-full font-medium text-slate-100 hover:bg-slate-700',
              tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
            )}
          >
            <LogOut className="h-4 w-4 shrink-0 text-current" />
            <span className={cn(tabletCollapsed ? 'hidden lg:inline' : 'inline')}>{t('nav.logout')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 md:flex md:flex-col',
          SIDEBAR_BG,
          'border-r',
          SIDEBAR_BORDER,
          tabletCollapsed ? 'w-[4.5rem] lg:w-64' : 'w-64',
        )}
      >
        {renderNavContent()}
      </aside>

      <button
        type="button"
        className={cn(
          'fixed left-4 top-4 z-50 rounded-md border p-2 shadow-md lg:hidden',
          SIDEBAR_BG,
          SIDEBAR_BORDER,
          'text-slate-100',
        )}
        onClick={() => setMobileOpen(true)}
        aria-label={t('nav.openMenu')}
      >
        <Menu className="h-5 w-5 text-current" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className={cn('relative z-50 flex h-screen w-64 flex-col shadow-xl', SIDEBAR_BG)}>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-slate-100 hover:bg-slate-700"
              onClick={() => setMobileOpen(false)}
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5 text-current" />
            </button>
            {renderNavContent()}
          </aside>
        </div>
      ) : null}
    </>
  );
}
