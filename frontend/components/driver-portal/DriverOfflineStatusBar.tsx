'use client';

import { useTranslation } from 'react-i18next';
import { useDriverOfflineQueue } from '@/hooks/useDriverOfflineQueue';

export function DriverOfflineStatusBar() {
  const { t } = useTranslation();
  const { offline, pendingCount, syncing } = useDriverOfflineQueue();

  if ((!offline || pendingCount === 0) && !syncing) {
    return null;
  }

  const label = offline
    ? t('driverPortal.pwa.offlineStatus', { count: pendingCount })
    : t('driverPortal.pwa.syncingStatus', { count: pendingCount });

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 px-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-slate-200 bg-slate-950/95 px-4 py-2 text-sm text-white shadow-2xl backdrop-blur">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-slate-300">{t('driverPortal.pwa.appShellOnly')}</span>
      </div>
    </div>
  );
}
