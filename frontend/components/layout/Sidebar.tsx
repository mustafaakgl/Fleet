'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, CircleHelp, LogOut, Menu, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
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

const SIDEBAR_BG = 'bg-[#0b2342]';
const SIDEBAR_BORDER = 'border-[#163a5c]';
const NAV_ROW = 'flex min-h-[40px] items-center gap-2.5 rounded-md px-3 text-[13px] leading-5 transition-colors';
const NAV_IDLE = 'text-blue-100/80 hover:bg-white/10 hover:text-white';
const NAV_ACTIVE = 'bg-[#1a4d7a] text-white shadow-sm';

export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);
  const [user] = useState<AuthUser | null>(() => getUser());

  const role = (user?.role ?? 'office') as Role;
  const navGroups = useMemo(() => getNavigationForRole(role), [role]);
  const isFleetOps = Boolean(user?.fleet_ops);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

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
        onClick={() => setMobileOpen(false)}
        className={cn(
          NAV_ROW,
          'font-medium',
          nested ? 'pl-9 pr-3' : '',
          !nested && tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
          isActive ? NAV_ACTIVE : NAV_IDLE,
        )}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-90" /> : null}
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
          <SectionIcon className="h-4 w-4 shrink-0 opacity-90" />
          <span className={cn('flex-1 text-left', tabletCollapsed ? 'hidden lg:inline' : 'inline')}>
            {t(section.labelKey)}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-blue-200/50 transition-transform',
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
                      isActive ? 'bg-white' : 'bg-blue-200/35',
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
              'absolute right-1 z-10 hidden rounded-md border p-1.5 text-blue-100/80 hover:bg-white/10 md:inline-flex lg:hidden',
              SIDEBAR_BORDER,
            )}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div
            className={cn(
              'w-full',
              tabletCollapsed ? 'h-9 md:h-9 lg:h-[5.25rem]' : 'h-[5.25rem] lg:h-[6.25rem]',
            )}
          >
            <MyFleetLogo href={null} priority fillWidth />
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
          {navGroups.map((group) => (
            <div key={group.id}>
              <p
                className={cn(
                  'mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200/45',
                  tabletCollapsed ? 'hidden lg:block' : 'block',
                )}
              >
                {t(group.labelKey)}
              </p>
              <div className="space-y-0.5">
                {group.items.map((entry) => renderNavEntry(entry))}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn('space-y-0.5 border-t px-2.5 pb-4 pt-3', SIDEBAR_BORDER)}>
          {isFleetOps &&
            renderFooterLink(
              '/admin/tenants',
              t('nav.fleetOps'),
              <Building2 className="h-4 w-4 shrink-0 opacity-90" />,
              pathname === '/admin/tenants',
            )}
          {renderFooterLink(
            '/hilfe',
            t('nav.help'),
            <CircleHelp className="h-4 w-4 shrink-0 opacity-90" />,
            pathname === '/hilfe',
          )}
          <button
            onClick={handleLogout}
            className={cn(
              NAV_ROW,
              'w-full font-medium text-blue-100/80 hover:bg-red-500/15 hover:text-red-100',
              tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
            )}
          >
            <LogOut className="h-4 w-4 shrink-0 opacity-90" />
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
          'hidden min-h-screen md:flex md:flex-col',
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
          'text-blue-100',
        )}
        onClick={() => setMobileOpen(true)}
        aria-label={t('nav.openMenu')}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className={cn('relative z-50 min-h-screen w-64 shadow-xl', SIDEBAR_BG)}>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-blue-100/80 hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
            {renderNavContent()}
          </aside>
        </div>
      ) : null}
    </>
  );
}
