'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, CircleHelp, LogOut, Menu, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { clearAuth, getUser } from '@/lib/auth';
import {
  getNavigationForRole,
  isNavItemActive,
  isNavSection,
  isNavSectionActive,
  type NavEntry,
  type NavItem,
  type NavSection,
} from '@/lib/navigation';
import { useRouter } from 'next/navigation';
import type { AuthUser, Role } from '@/lib/types';
import { useTranslation } from 'react-i18next';

export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
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
          'flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors',
          nested ? 'pl-9 pr-3' : 'px-3',
          !nested && tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
          isActive
            ? nested
              ? 'bg-blue-50 text-blue-700'
              : 'bg-blue-50 text-blue-700'
            : nested
              ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        )}
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
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
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
            sectionActive
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
          )}
        >
          <SectionIcon className="h-5 w-5 shrink-0" />
          <span className={cn('flex-1 text-left', tabletCollapsed ? 'hidden lg:inline' : 'inline')}>
            {t(section.labelKey)}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform',
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
            <span className="absolute bottom-1 left-[1.35rem] top-1 w-px bg-slate-200" aria-hidden />
            {section.items.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'relative flex items-center rounded-lg py-2 pl-9 pr-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-[1.22rem] top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white',
                      isActive ? 'bg-blue-600' : 'bg-slate-300',
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
    clearAuth();
    router.push('/login');
  }

  function renderNavContent() {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-5">
          <MyFleetLogo
            height={tabletCollapsed ? 32 : 36}
            href={null}
            className={cn(tabletCollapsed && 'lg:mx-auto')}
          />
          {!tabletCollapsed || mobileOpen ? (
            <span className="hidden text-xs font-medium uppercase tracking-wide text-blue-600 lg:inline">
              {role === 'office' ? t('nav.roleBadge.office') : user?.role}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setTabletCollapsed((current) => !current)}
            className="ml-auto hidden rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-100 md:inline-flex lg:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.id}>
              <p
                className={cn(
                  'mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400',
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

        <div className="border-t border-gray-100 px-3 pb-4 pt-3 space-y-0.5">
          {isFleetOps && (
            <Link
              href="/admin/tenants"
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
                tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
                pathname === '/admin/tenants' ? 'bg-blue-50 text-blue-700' : '',
              )}
            >
              <Building2 className="h-5 w-5" />
              <span className={cn(tabletCollapsed ? 'hidden lg:inline' : 'inline')}>
                {t('nav.fleetOps')}
              </span>
            </Link>
          )}
          <Link
            href="/hilfe"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
              tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
              pathname === '/hilfe' ? 'bg-blue-50 text-blue-700' : '',
            )}
          >
            <CircleHelp className="h-5 w-5" />
            <span className={cn(tabletCollapsed ? 'hidden lg:inline' : 'inline')}>{t('nav.help')}</span>
          </Link>
          <button
            onClick={handleLogout}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600',
              tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
            )}
          >
            <LogOut className="h-5 w-5" />
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
          'hidden min-h-screen border-r border-gray-200 bg-white md:flex md:flex-col',
          tabletCollapsed ? 'w-20 lg:w-64' : 'w-64',
        )}
      >
        {renderNavContent()}
      </aside>

      <button
        type="button"
        className="fixed left-4 top-4 z-50 rounded-md border border-gray-200 bg-white p-2 shadow-md lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label={t('nav.openMenu')}
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative z-50 min-h-screen w-64 bg-white shadow-xl">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 hover:bg-gray-100"
              onClick={() => setMobileOpen(false)}
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
            {renderNavContent()}
          </aside>
        </div>
      ) : null}
    </>
  );
}
