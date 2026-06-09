'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, Camera, FileText, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi, messengerApi } from '@/lib/api';

export function DriverPendingTasksCard() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState({
    handovers: 0,
    messages: 0,
    notifications: 0,
    requests: 0,
  });

  useEffect(() => {
    Promise.all([
      driverPortalApi.listHandovers({ photoStatus: 'missing' }),
      messengerApi.getUnreadCount(),
      driverPortalApi.unreadNotifications(),
      driverPortalApi.listRequests(),
    ])
      .then(([handovers, messages, notifications, requests]) => {
        setCounts({
          handovers: handovers.length,
          messages: messages.total,
          notifications: notifications.count,
          requests: requests.filter((r) => r.status === 'pending').length,
        });
      })
      .catch(() => undefined);
  }, []);

  const total =
    counts.handovers + counts.messages + counts.notifications + counts.requests;
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('driverPortal.pending.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {counts.handovers > 0 ? (
          <Link href="/driver/handover" className="flex items-center gap-2 text-slate-700 hover:text-[#1a4d7a]">
            <Camera className="h-4 w-4" />
            {t('driverPortal.pending.handover', { count: counts.handovers })}
          </Link>
        ) : null}
        {counts.messages > 0 ? (
          <Link href="/driver/messages" className="flex items-center gap-2 text-slate-700 hover:text-[#1a4d7a]">
            <MessageSquare className="h-4 w-4" />
            {t('driverPortal.pending.messages', { count: counts.messages })}
          </Link>
        ) : null}
        {counts.notifications > 0 ? (
          <Link href="/driver/notifications" className="flex items-center gap-2 text-slate-700 hover:text-[#1a4d7a]">
            <Bell className="h-4 w-4" />
            {t('driverPortal.pending.notifications', { count: counts.notifications })}
          </Link>
        ) : null}
        {counts.requests > 0 ? (
          <Link href="/driver/requests" className="flex items-center gap-2 text-slate-700 hover:text-[#1a4d7a]">
            <FileText className="h-4 w-4" />
            {t('driverPortal.pending.requests', { count: counts.requests })}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
