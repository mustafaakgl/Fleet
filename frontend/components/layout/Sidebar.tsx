'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, CircleHelp, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { clearAuth, getUser } from '@/lib/auth';
import { getNavigationForRole } from '@/lib/navigation';
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
  const navGroups = getNavigationForRole(role);
  const isFleetOps = Boolean(user?.fleet_ops);

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
                {group.items.map(({ href, labelKey, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        tabletCollapsed ? 'md:justify-center lg:justify-start' : '',
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className={cn(tabletCollapsed ? 'hidden lg:inline' : 'inline')}>
                        {t(labelKey)}
                      </span>
                    </Link>
                  );
                })}
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
