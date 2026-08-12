'use client';

import { useTranslation } from 'react-i18next';
import { DriverFuelStationsScreen } from '@/components/driver-portal/DriverFuelStationsScreen';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';

/**
 * Ince kabuk: tum davranis DriverFuelStationsScreen'de.
 *
 * Bilincli — vitest yalnizca `components/**` ve `lib/**` topluyor (bkz.
 * vitest.config.mts), sayfa/route testleri kapsam disi. Mantik bilesende
 * durunca gercek testlerle civilenebiliyor.
 */
export default function DriverFuelStationsPage() {
  const { t } = useTranslation();

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <h1 className="mb-3 text-xl font-bold text-slate-900">
        {t('driverPortal.fuelStations.title')}
      </h1>
      <DriverFuelStationsScreen />
    </DriverPortalShell>
  );
}
