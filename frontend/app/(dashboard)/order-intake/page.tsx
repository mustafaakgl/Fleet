'use client';

import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OrderIntakeScreen } from '@/components/order-intake/OrderIntakeScreen';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function OrderIntakePage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <Inbox className="h-8 w-8 text-blue-700" />
        <h1 className={FLEET_PAGE_TITLE}>{t('orderIntake.title')}</h1>
      </div>
      <OrderIntakeScreen />
    </div>
  );
}
