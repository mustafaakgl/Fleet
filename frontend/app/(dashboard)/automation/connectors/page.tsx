'use client';

import { Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OrdivanConnectorScreen } from '@/components/ordivan/OrdivanConnectorScreen';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function OrdivanConnectorsPage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <Plug className="h-8 w-8 text-blue-700" />
        <h1 className={FLEET_PAGE_TITLE}>{t('automation.connector.title')}</h1>
      </div>
      <OrdivanConnectorScreen />
    </div>
  );
}
