'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { DriverIncidentReportForm } from '@/components/driver-portal/DriverIncidentReportForm';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DriverAccidentReportPage() {
  const { t } = useTranslation();
  const params = useSearchParams();

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.incident.accidentTitle')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.incident.accidentSubtitle')}</p>
        </CardHeader>
        <CardContent>
          <DriverIncidentReportForm
            type="vehicle_accident"
            assignmentId={params.get('assignmentId') ?? undefined}
            vehicleId={params.get('vehicleId') ?? undefined}
          />
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
