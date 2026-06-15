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

function HeaderIconLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof CircleHelp;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 sm:h-10 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden text-xs font-medium xl:inline">{label}</span>
    </Link>
  );
}

export function Header({ title }: HeaderProps) {
  const [user] = useState<AuthUser | null>(() => getUser());
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200 bg-white px-3 py-2 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[12rem] sm:flex-none lg:min-w-[14rem]">
          <AccountMenu />
          {title ? (
            <h1 className="truncate text-base font-semibold text-gray-900 md:hidden">{title}</h1>
          ) : null}
        </div>

        <div className="order-last min-w-0 w-full sm:order-none sm:w-auto sm:min-w-[10rem] sm:flex-1 sm:max-w-md lg:max-w-lg xl:max-w-xl">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5 lg:gap-2">
          <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 sm:h-10">
            <Globe className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
            <span className="hidden font-medium sm:inline">{t('language.label')}</span>
            <select
              value={i18n.language.startsWith('en') ? 'en' : i18n.language.startsWith('tr') ? 'tr' : 'de'}
              onChange={(event) => {
                void i18n.changeLanguage(event.target.value);
              }}
              className="max-w-[5.5rem] bg-transparent text-xs text-gray-700 outline-none sm:max-w-none"
              aria-label={t('language.label')}
            >
              <option value="en">{t('language.english')}</option>
              <option value="de">{t('language.german')}</option>
              <option value="tr">{t('language.turkish')}</option>
            </select>
          </div>

          <HeaderIconLink href="/hilfe" label={t('nav.help')} icon={CircleHelp} />
          <HeaderIconLink href="/security" label={t('nav.security')} icon={ShieldCheck} />

          <NotificationCenter />

          <div className="flex shrink-0 items-center gap-2 pl-0.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium leading-none text-gray-900">{user?.name ?? 'User'}</p>
              <p className="mt-0.5 truncate text-xs capitalize text-gray-500">
                {user?.role?.replace('_', ' ') ?? ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
