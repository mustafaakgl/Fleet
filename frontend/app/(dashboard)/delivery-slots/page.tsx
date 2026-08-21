'use client';

import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SlotManagementScreen } from '@/components/delivery-slots/SlotManagementScreen';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function DeliverySlotsPage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <CalendarClock className="h-8 w-8 text-blue-700" aria-hidden="true" />
        <h1 className={FLEET_PAGE_TITLE}>{t('slots.title')}</h1>
      </div>
      <SlotManagementScreen />
    </div>
  );
}
