'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDriverPortalServiceWorker } from '@/hooks/useDriverPortalServiceWorker';

export function DriverPortalUpdateBanner() {
  const { t } = useTranslation();
  const { updateAvailable, acknowledgeUpdate } = useDriverPortalServiceWorker();

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="font-medium">{t('driverPortal.pwa.updateAvailable')}</p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800"
          onClick={() => {
            acknowledgeUpdate();
            window.location.reload();
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('driverPortal.pwa.reload')}
        </button>
      </div>
    </div>
  );
}
