'use client';

import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OpenOverdueAssignmentsCard } from '@/components/invoicing/OpenOverdueAssignmentsCard';
import {
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
} from '@/lib/fleet-table';

export default function InvoicingPage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <Receipt className="h-6 w-6 shrink-0 text-slate-700" aria-hidden />
          <div className="min-w-0">
            <h1 className={FLEET_PAGE_TITLE}>{t('invoicing.title')}</h1>
            <p className="text-[13px] text-slate-600">{t('invoicing.subtitle')}</p>
          </div>
        </div>
      </div>

      <OpenOverdueAssignmentsCard />
    </div>
  );
}
