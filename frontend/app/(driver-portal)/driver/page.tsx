'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Camera, ClipboardCheck, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverAssignmentsPanel } from '@/components/driver-portal/DriverAssignmentsPanel';
import { DriverDayStatusBanner } from '@/components/driver-portal/DriverDayStatusBanner';
import { DriverLocationSharingCard } from '@/components/driver-portal/DriverLocationSharingCard';
import { DriverPendingTasksCard } from '@/components/driver-portal/DriverPendingTasksCard';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { DriverWorkSessionCard } from '@/components/driver-portal/DriverWorkSessionCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { driverPortalApi, messengerApi } from '@/lib/api';
import { driverTodayIso, translateStatus } from '@/lib/driver-portal-utils';

export default function DriverPortalHomePage() {
  const { t, i18n } = useTranslation();
  const [driverName, setDriverName] = useState<string | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [pendingHandover, setPendingHandover] = useState<{
    assignmentId: string;
    vehicleId: string;
  } | null>(null);
  const [pendingEquipmentIssuanceId, setPendingEquipmentIssuanceId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const today = driverTodayIso();
    let active = true;
    Promise.allSettled([
      driverPortalApi.me(),
      driverPortalApi.todayAssignments(today),
      driverPortalApi.listHandovers({ date: today, photoStatus: 'missing' }),
      driverPortalApi.listEquipmentIssuances(),
      messengerApi.getUnreadCount(),
      driverPortalApi.unreadNotifications(),
    ])
      .then((results) => {
        if (!active) return;
        const [profile, assignments, handovers, equipmentIssuances, messages, notifications] = results;

        const loadErrors: string[] = [];

        if (profile.status === 'fulfilled') {
          setDriverName(profile.value.driver.firstName);
          setDriverStatus(profile.value.driver.status);
        } else {
          loadErrors.push(t('driverPortal.home.loadErrorProfile'));
        }

        if (assignments.status !== 'fulfilled') {
          loadErrors.push(t('driverPortal.home.loadErrorAssignments'));
        }

        if (handovers.status === 'fulfilled') {
          const pending = handovers.value.find((row) => row.photoRequired && row.status !== 'completed');
          setPendingHandover(
            pending?.assignmentId && pending.vehicleId
              ? { assignmentId: pending.assignmentId, vehicleId: pending.vehicleId }
              : null,
          );
        } else {
          setPendingHandover(null);
          loadErrors.push(t('driverPortal.home.loadErrorHandovers'));
        }

        if (equipmentIssuances.status === 'fulfilled') {
          setPendingEquipmentIssuanceId(
            equipmentIssuances.value.find((row) => row.status === 'pending_signature')?.id ?? null,
          );
        } else {
          setPendingEquipmentIssuanceId(null);
          loadErrors.push(t('driverPortal.home.loadErrorEquipment'));
        }

        if (messages.status === 'fulfilled') {
          setUnreadMessages(messages.value.total);
        } else {
          setUnreadMessages(0);
          loadErrors.push(t('driverPortal.home.loadErrorMessages'));
        }

        if (notifications.status === 'fulfilled') {
          setUnreadNotifications(notifications.value.count);
        } else {
          setUnreadNotifications(0);
          loadErrors.push(t('driverPortal.home.loadErrorNotifications'));
        }

        setLoadError(loadErrors.length > 0 ? t('driverPortal.home.loadErrorSummary') : null);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(t('driverPortal.home.loadErrorSummary'));
      });

    return () => {
      active = false;
    };
  }, [t]);

  const todayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <DriverPortalShell>
      <div className="space-y-5">
        <Card className="overflow-hidden border-[#1a4d7a]/15 bg-[#1a4d7a] text-white">
          <CardContent className="p-4">
            <p className="text-lg font-bold">
              {t('driverPortal.greeting', { name: driverName ?? t('driverPortal.driver') })}
            </p>
            <p className="mt-1 text-sm text-slate-200">{todayLabel}</p>
            {driverStatus ? (
              <p className="mt-2 inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold">
                {t('driverPortal.home.status')}: {t(translateStatus('driver', driverStatus))}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {loadError ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold text-red-900">{t('driverPortal.home.loadErrorTitle')}</p>
                <p className="text-sm text-red-800">{loadError}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                {t('common.retry')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <DriverWorkSessionCard />

        <DriverDayStatusBanner />

        {pendingEquipmentIssuanceId ? (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold text-amber-900">
                {t('driverPortal.home.equipmentIssuanceTaskTitle')}
              </p>
              <p className="text-sm text-amber-800">
                {t('driverPortal.home.equipmentIssuanceTaskBody')}
              </p>
              <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
                <Link href={`/driver/equipment-issuance?id=${pendingEquipmentIssuanceId}`}>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.equipmentIssuance')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <DriverLocationSharingCard />

        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/driver/messages"
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:bg-slate-50"
          >
            <span className="flex items-center gap-2 text-slate-700">
              <MessageSquare className="h-4 w-4 text-[#1a4d7a]" />
              {t('driverPortal.home.summaryMessages')}
            </span>
            <span className="font-semibold text-[#1a4d7a]">{unreadMessages}</span>
          </Link>
          <Link
            href="/driver/notifications"
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:bg-slate-50"
          >
            <span className="flex items-center gap-2 text-slate-700">
              <Bell className="h-4 w-4 text-[#1a4d7a]" />
              {t('driverPortal.home.summaryNotifications')}
            </span>
            <span className="font-semibold text-[#1a4d7a]">{unreadNotifications}</span>
          </Link>
        </div>

        <DriverAssignmentsPanel />

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">{t('driverPortal.home.quickActions')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/driver/morning-checkin">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                {t('driverPortal.home.morningCheckin')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={pendingHandover ? `/driver/handover?assignmentId=${pendingHandover.assignmentId}&vehicleId=${pendingHandover.vehicleId}` : '/driver/handover'}>
                <Camera className="mr-2 h-4 w-4" />
                {t('driverPortal.home.handoverPhoto')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={pendingEquipmentIssuanceId ? `/driver/equipment-issuance?id=${pendingEquipmentIssuanceId}` : '/driver/equipment-issuance'}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                {t('driverPortal.home.equipmentIssuance')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start text-red-700 hover:text-red-800">
              <Link href="/driver/reports">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {t('driverPortal.home.reportAccident')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start text-red-700 hover:text-red-800">
              <Link href="/driver/reports">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {t('driverPortal.home.reportCargo')}
              </Link>
            </Button>
          </div>
          <DriverPendingTasksCard />
        </div>

        <Link
          href="/driver/requests"
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {t('driverPortal.home.openRequests')}
          <span className="text-slate-400">→</span>
        </Link>
      </div>
    </DriverPortalShell>
  );
}
