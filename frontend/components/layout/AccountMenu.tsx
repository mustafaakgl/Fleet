'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  CircleHelp,
  CloudUpload,
  CreditCard,
  Globe,
  KeyRound,
  LogOut,
  Settings,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/i18n.client';
import { cn } from '@/lib/utils';
import { getUser, performLogout } from '@/lib/auth';
import { onboardingApi } from '@/lib/api';
import type { AuthUser, Role } from '@/lib/types';

type MenuItem = {
  href?: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: 'logout';
  roles?: Role[];
};

const MENU_SECTIONS: MenuItem[][] = [
  [
    { href: '/settings', labelKey: 'accountMenu.settings', icon: Settings },
    {
      href: '/billing',
      labelKey: 'accountMenu.billing',
      icon: CreditCard,
      roles: ['admin', 'boss'],
    },
    {
      href: '/settings/users',
      labelKey: 'accountMenu.userManagement',
      icon: Users,
      roles: ['admin', 'boss'],
    },
    {
      href: '/import',
      labelKey: 'accountMenu.imports',
      icon: CloudUpload,
      roles: ['admin', 'boss'],
    },
    {
      href: '/settings/automations',
      labelKey: 'accountMenu.automations',
      icon: Zap,
      roles: ['admin', 'boss'],
    },
  ],
  [
    { href: '/settings/profile', labelKey: 'accountMenu.userProfile', icon: UserCircle },
    { href: '/settings/notifications', labelKey: 'accountMenu.notificationSettings', icon: Bell },
    { href: '/security', labelKey: 'accountMenu.loginPassword', icon: KeyRound },
    { href: '/hilfe', labelKey: 'accountMenu.help', icon: CircleHelp },
  ],
  [{ labelKey: 'accountMenu.logOut', icon: LogOut, action: 'logout' }],
];

function resolveWorkspaceLabel(user: AuthUser | null, tenantName: string | null) {
  if (tenantName?.trim()) return tenantName.trim();
  if (user?.companies?.[0]?.name?.trim()) return user.companies[0].name.trim();
  return 'Operion';
}

function currentLanguageCode() {
  if (i18n.language.startsWith('en')) return 'en';
  if (i18n.language.startsWith('tr')) return 'tr';
  return 'de';
}

export function AccountMenu() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [user] = useState<AuthUser | null>(() => getUser());
  const [tenantName, setTenantName] = useState<string | null>(null);

  const workspaceLabel = useMemo(() => resolveWorkspaceLabel(user, tenantName), [tenantName, user]);
  const userInitial = user?.name?.charAt(0)?.toUpperCase() ?? 'U';

  useEffect(() => {
    let cancelled = false;

    onboardingApi
      .getTenant()
      .then((tenant) => {
        if (cancelled) return;
        setTenantName(tenant.name ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setTenantName(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const visibleSections = useMemo(
    () =>
      MENU_SECTIONS.map((section) =>
        section.filter((item) => {
          if (!item.roles) return true;
          return item.roles.includes((user?.role ?? 'office') as Role);
        }),
      ).filter((section) => section.length > 0),
    [user?.role],
  );

  function handleItemClick(item: MenuItem) {
    if (item.action === 'logout') {
      performLogout('/login?manual=1');
      return;
    }
    setOpen(false);
  }

  return (
    <div className="relative min-w-0" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex max-w-full items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-left transition-colors hover:bg-gray-50"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('accountMenu.openMenu')}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-semibold text-white">
          {userInitial}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-semibold text-gray-900">
            {user?.name ?? t('accountMenu.userProfile')}
          </span>
          <span className="block truncate text-xs text-gray-500">{workspaceLabel}</span>
        </span>
        <ChevronDown
          className={cn('hidden h-4 w-4 shrink-0 text-gray-500 transition sm:block', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,320px)] overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-gray-900">{user?.name ?? 'User'}</p>
            <p className="truncate text-xs capitalize text-gray-500">
              {user?.role?.replace('_', ' ') ?? ''}
            </p>
            <p className="mt-1 truncate text-xs text-gray-400">{workspaceLabel}</p>
          </div>

          <div className="border-b border-gray-100 px-4 py-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <Globe className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
              {t('accountMenu.language')}
            </label>
            <select
              value={currentLanguageCode()}
              onChange={(event) => {
                void i18n.changeLanguage(event.target.value);
              }}
              className="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none"
              aria-label={t('language.label')}
            >
              <option value="de">{t('language.german')}</option>
              <option value="en">{t('language.english')}</option>
              <option value="tr">{t('language.turkish')}</option>
            </select>
          </div>

          {visibleSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {sectionIndex > 0 ? <div className="my-2 border-t border-gray-100" /> : null}
              <ul className="py-1">
                {section.map((item) => {
                  const Icon = item.icon;
                  const content = (
                    <>
                      <span className="truncate">{t(item.labelKey)}</span>
                      <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                    </>
                  );

                  if (item.action === 'logout') {
                    return (
                      <li key={item.labelKey}>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleItemClick(item)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                        >
                          {content}
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={item.labelKey}>
                      <Link
                        href={item.href ?? '#'}
                        role="menuitem"
                        onClick={() => handleItemClick(item)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
                      >
                        {content}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
