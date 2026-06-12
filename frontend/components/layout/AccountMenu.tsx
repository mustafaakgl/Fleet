'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  CloudUpload,
  CreditCard,
  ImageIcon,
  KeyRound,
  LogOut,
  Settings,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  ],
  [{ labelKey: 'accountMenu.logOut', icon: LogOut, action: 'logout' }],
];

function resolveAccountLabel(user: AuthUser | null, tenantName: string | null) {
  if (tenantName?.trim()) return tenantName.trim();
  if (user?.companies?.[0]?.name?.trim()) return user.companies[0].name.trim();
  if (user?.name?.trim()) return user.name.trim();
  return user?.email ?? 'Operion';
}

export function AccountMenu() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [user] = useState<AuthUser | null>(() => getUser());
  const [tenantName, setTenantName] = useState<string | null>(null);

  const accountLabel = useMemo(() => resolveAccountLabel(user, tenantName), [tenantName, user]);

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
        className="flex max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-gray-50"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('accountMenu.openMenu')}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-400">
          <ImageIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-semibold text-gray-900">{accountLabel}</span>
        </span>
        <ChevronDown
          className={cn('hidden h-4 w-4 shrink-0 text-gray-500 transition sm:block', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,320px)] overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
        >
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-400">
              <ImageIcon className="h-4 w-4" aria-hidden />
            </span>
            <p className="truncate text-sm font-semibold text-gray-900">{accountLabel}</p>
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
