'use client';

import { Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { DriverPortalNav } from '@/components/driver-portal/DriverPortalNav';
import { getUser } from '@/lib/auth';

interface DriverPortalShellProps {
  children: React.ReactNode;
  hideHeader?: boolean;
}

export function DriverPortalShell({ children, hideHeader }: DriverPortalShellProps) {
  const { t } = useTranslation();
  const user = getUser();

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {!hideHeader ? (
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <MyFleetLogo height={36} href={null} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#1a4d7a]">
                  <Navigation className="h-3.5 w-3.5" />
                  {t('driverPortal.title')}
                </p>
                <p className="truncate text-sm text-slate-600">{user?.name ?? user?.email}</p>
              </div>
            </div>
          </div>
        </header>
      ) : null}
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      <DriverPortalNav />
    </div>
  );
}
