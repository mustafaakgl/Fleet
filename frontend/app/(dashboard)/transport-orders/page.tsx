'use client';

import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TransportOrderScreen } from '@/components/transport-orders/TransportOrderScreen';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function TransportOrdersPage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <ClipboardList className="h-8 w-8 text-blue-700" />
        <h1 className={FLEET_PAGE_TITLE}>{t('transportOrders.title')}</h1>
      </div>
      <TransportOrderScreen />
    </div>
  );
}
