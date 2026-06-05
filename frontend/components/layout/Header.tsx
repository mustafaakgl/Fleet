'use client';

import Link from 'next/link';
import { CircleHelp, Globe } from 'lucide-react';
import { getUser } from '@/lib/auth';
import { useState } from 'react';
import type { AuthUser } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/i18n.client';
import { NotificationCenter } from './NotificationCenter';
import { GlobalSearch } from './GlobalSearch';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const [user] = useState<AuthUser | null>(() => getUser());
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200 lg:px-8">
      {/* Left: title or search */}
      <div className="flex items-center gap-4">
        {title && (
          <h1 className="text-xl font-semibold text-gray-900 sm:hidden">{title}</h1>
        )}
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        <div className="hidden md:block">
          <GlobalSearch />
        </div>

        <div className="hidden items-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 md:flex">
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
          className="hidden items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:inline-flex"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          {t('nav.help')}
        </Link>

        <NotificationCenter />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
            {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-none">{user?.name ?? 'User'}</p>
            <p className="text-xs text-gray-500 mt-0.5 capitalize">{user?.role?.replace('_', ' ') ?? ''}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
