'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Camera, ClipboardCheck, ExternalLink, Loader2, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DriverAssignmentRouteMap } from '@/components/driver-portal/DriverAssignmentRouteMap';
import { driverPortalApi } from '@/lib/api';
import { buildAssignmentRouteName } from '@/lib/address-format';
import { openMapsAddress } from '@/lib/driver-maps';
import { driverAssignmentStatusClass } from '@/lib/driver-portal-utils';
import type { DriverPortalAssignment } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function DriverAssignmentDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [assignment, setAssignment] = useState<DriverPortalAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = params.id;
    if (!id) return;

    let active = true;
    setLoading(true);
    driverPortalApi
      .assignmentById(id)
      .then((row) => {
        if (!active) return;
        setAssignment(row);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setAssignment(null);
        setError(err instanceof Error ? err.message : t('driverPortal.assignments.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.id, t]);

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('driverPortal.assignments.loading')}
        </div>
      ) : error || !assignment ? (
        <p className="text-sm text-red-600">{error ?? t('driverPortal.assignments.notFound')}</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">
                  {assignment.vehicle.plateNumber} · {assignment.company.name}
                </CardTitle>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    driverAssignmentStatusClass(assignment.status),
                  )}
                >
                  {assignment.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {assignment.startTime} – {assignment.endTime} · {assignment.cargoName}
              </p>
              {assignment.cargoOwner ? (
                <p className="text-sm text-slate-500">
                  {t('driverPortal.assignments.cargoOwner')}: {assignment.cargoOwner}
                </p>
              ) : null}
              <p className="text-sm font-medium text-[#1a4d7a]">
                {assignment.routeName ||
                  buildAssignmentRouteName(assignment.pickupAddress, assignment.deliveryAddress)}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('driverPortal.assignments.routeMap')}
                </p>
                <div className="mt-2">
                  <DriverAssignmentRouteMap
                    pickupAddress={assignment.pickupAddress}
                    deliveryAddress={assignment.deliveryAddress}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('driverPortal.assignments.pickup')}
                </p>
                <p className="mt-1 text-sm text-slate-900">{assignment.pickupAddress}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => openMapsAddress(assignment.pickupAddress)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('driverPortal.assignments.openInMaps')}
                </Button>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('driverPortal.assignments.delivery')}
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-900">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1a4d7a]" />
                  {assignment.deliveryAddress}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 bg-[#1a4d7a] hover:bg-[#163a5c]"
                  onClick={() => openMapsAddress(assignment.deliveryAddress)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('driverPortal.assignments.navigateDelivery')}
                </Button>
              </div>

              {assignment.notes ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('driverPortal.assignments.notes')}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{assignment.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('driverPortal.home.quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="justify-start">
                <Link href="/driver/morning-checkin">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.morningCheckin')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link
                  href={`/driver/handover?assignmentId=${assignment.id}&vehicleId=${assignment.vehicle.id}`}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.handoverPhoto')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start text-red-700">
                <Link
                  href="/driver/reports"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.reportAccident')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start text-red-700">
                <Link
                  href="/driver/reports"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.reportCargo')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </DriverPortalShell>
  );
}
