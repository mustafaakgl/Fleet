'use client';

import Link from 'next/link';
import { CircleHelp, Globe, ShieldCheck } from 'lucide-react';
import { getUser } from '@/lib/auth';
import { useState } from 'react';
import type { AuthUser } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/i18n.client';
import { NotificationCenter } from './NotificationCenter';
import { GlobalSearch } from './GlobalSearch';
import { AccountMenu } from './AccountMenu';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const [user] = useState<AuthUser | null>(() => getUser());
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
      {/* Left: account / tenant */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <AccountMenu />
        {title ? (
          <h1 className="truncate text-base font-semibold text-gray-900 sm:text-xl md:hidden">{title}</h1>
        ) : null}
      </div>

      {/* Center: global search — constrained width, never overlaps siblings */}
      <div className="hidden min-w-0 shrink md:block md:w-full md:max-w-xs lg:max-w-sm xl:max-w-md">
        <GlobalSearch />
      </div>

      {/* Right: language, links, notifications, user */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
        <div className="hidden items-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 lg:flex">
          <Globe className="h-3.5 w-3.5 text-gray-500" />
          <span>{t('language.label')}</span>
          <select
            value={i18n.language.startsWith('en') ? 'en' : i18n.language.startsWith('tr') ? 'tr' : 'de'}
            onChange={(event) => {
              void i18n.changeLanguage(event.target.value);
            }}
            className="bg-transparent text-xs text-gray-700 outline-none"
            aria-label={t('language.label')}
          >
            <option value="en">{t('language.english')}</option>
            <option value="de">{t('language.german')}</option>
            <option value="tr">{t('language.turkish')}</option>
          </select>
        </div>

        <Link
          href="/hilfe"
          className="hidden items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 lg:inline-flex"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          {t('nav.help')}
        </Link>

        <Link
          href="/security"
          className="hidden items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 xl:inline-flex"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('nav.security')}
        </Link>

        <NotificationCenter />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
            {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-medium leading-none text-gray-900">{user?.name ?? 'User'}</p>
            <p className="mt-0.5 truncate text-xs capitalize text-gray-500">{user?.role?.replace('_', ' ') ?? ''}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
