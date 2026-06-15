'use client';

import { useTranslation } from 'react-i18next';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { DriverReportsForm } from '@/components/driver-portal/DriverReportsForm';

export default function DriverReportsPage() {
  const { t } = useTranslation();

  return (
    <DriverPortalShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">{t('driverPortal.reports.pageTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('driverPortal.reports.pageSubtitle')}</p>
      </div>
      <DriverReportsForm />
    </DriverPortalShell>
  );
}
