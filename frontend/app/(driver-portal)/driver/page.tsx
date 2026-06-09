'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, ClipboardCheck, MessageSquare, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverAssignmentsPanel } from '@/components/driver-portal/DriverAssignmentsPanel';
import { DriverDayStatusBanner } from '@/components/driver-portal/DriverDayStatusBanner';
import { DriverLocationSharingCard } from '@/components/driver-portal/DriverLocationSharingCard';
import { DriverPendingTasksCard } from '@/components/driver-portal/DriverPendingTasksCard';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { driverPortalApi, messengerApi } from '@/lib/api';
import { driverTodayIso } from '@/lib/driver-portal-utils';
import type { DriverPortalAssignment } from '@/lib/types';

export default function DriverPortalHomePage() {
  const { t, i18n } = useTranslation();
  const [driverName, setDriverName] = useState<string | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [firstAssignment, setFirstAssignment] = useState<DriverPortalAssignment | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const today = driverTodayIso();
    Promise.all([
      driverPortalApi.me(),
      driverPortalApi.todayAssignments(today),
      messengerApi.getUnreadCount(),
      driverPortalApi.unreadNotifications(),
    ])
      .then(([profile, assignments, messages, notifications]) => {
        setDriverName(profile.driver.firstName);
        setDriverStatus(profile.driver.status);
        setFirstAssignment(assignments[0] ?? null);
        setUnreadMessages(messages.total);
        setUnreadNotifications(notifications.count);
      })
      .catch(() => undefined);
  }, []);

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
                {t('driverPortal.home.status')}: {driverStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <DriverDayStatusBanner />

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

        {firstAssignment ? (
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
                <Link
                  href={`/driver/handover?assignmentId=${firstAssignment.id}&vehicleId=${firstAssignment.vehicle.id}`}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.handoverPhoto')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start text-red-700 hover:text-red-800">
                <Link
                  href={`/driver/accident-report?assignmentId=${firstAssignment.id}&vehicleId=${firstAssignment.vehicle.id}`}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.reportAccident')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start text-red-700 hover:text-red-800">
                <Link
                  href={`/driver/cargo-damage-report?assignmentId=${firstAssignment.id}&vehicleId=${firstAssignment.vehicle.id}`}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {t('driverPortal.home.reportCargo')}
                </Link>
              </Button>
            </div>
            <DriverPendingTasksCard />
          </div>
        ) : null}

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
