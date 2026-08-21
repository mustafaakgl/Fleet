'use client';

import { Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DispatchQueueScreen } from '@/components/dispatch/DispatchQueueScreen';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function DispatchPage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <Route className="h-8 w-8 text-blue-700" aria-hidden="true" />
        <h1 className={FLEET_PAGE_TITLE}>{t('dispatch.title')}</h1>
      </div>
      <DispatchQueueScreen />
    </div>
  );
}
