'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverFuelReceiptsScreen } from '@/components/driver-portal/DriverFuelReceiptsScreen';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';

/**
 * Ince kabuk: tum davranis DriverFuelReceiptsScreen'de.
 *
 * Bilincli — vitest yalnizca `components/**` ve `lib/**` topluyor (bkz.
 * vitest.config.mts); mantik bilesende durunca gercek testlerle civilenebiliyor.
 *
 * `?fuelingIntentId=` OPSIYONEL: aktif yakit duragi kartindan gelindiginde fis
 * o yakit alimina baglanir. Parametre YOKSA ekran aynen calisir — bagimsiz fis
 * yukleme yolu hicbir kosulda kapanmaz.
 */
function DriverFuelReceiptsContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const fuelingIntentId = searchParams?.get('fuelingIntentId')?.trim() || undefined;

  return (
    <>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <h1 className="mb-3 text-xl font-bold text-slate-900">
        {t('driverPortal.fuelReceipts.title')}
      </h1>
      <DriverFuelReceiptsScreen fuelingIntentId={fuelingIntentId} />
    </>
  );
}

export default function DriverFuelReceiptsPage() {
  return (
    <DriverPortalShell>
      {/* useSearchParams Next 15'te Suspense siniri istiyor. */}
      <Suspense fallback={null}>
        <DriverFuelReceiptsContent />
      </Suspense>
    </DriverPortalShell>
  );
}
