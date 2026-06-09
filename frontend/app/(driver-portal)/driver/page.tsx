'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverAssignmentsPanel } from '@/components/driver-portal/DriverAssignmentsPanel';
import { DriverLocationSharingCard } from '@/components/driver-portal/DriverLocationSharingCard';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { driverPortalApi } from '@/lib/api';

export default function DriverPortalHomePage() {
  const { t } = useTranslation();
  const [driverName, setDriverName] = useState<string | null>(null);

  useEffect(() => {
    driverPortalApi
      .me()
      .then((profile) => setDriverName(profile.driver.firstName))
      .catch(() => setDriverName(null));
  }, []);

  return (
    <DriverPortalShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {t('driverPortal.greeting', { name: driverName ?? t('driverPortal.driver') })}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t('driverPortal.subtitle')}</p>
        </div>

        <DriverLocationSharingCard />
        <DriverAssignmentsPanel />
      </div>
    </DriverPortalShell>
  );
}
