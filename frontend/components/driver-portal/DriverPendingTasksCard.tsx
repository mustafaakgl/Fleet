'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bell, Camera, FileText, Loader2, MessageSquare, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { driverPortalApi, messengerApi } from '@/lib/api';

export function DriverPendingTasksCard() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState({
    handovers: 0,
    messages: 0,
    notifications: 0,
    requests: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [handovers, messages, notifications, requests] = await Promise.all([
        driverPortalApi.listHandovers({ photoStatus: 'missing' }),
        messengerApi.getUnreadCount(),
        driverPortalApi.unreadNotifications(),
        driverPortalApi.listRequests(),
      ]);

      setCounts({
        handovers: handovers.length,
        messages: messages.total,
        notifications: notifications.count,
        requests: requests.filter((r) => r.status === 'pending').length,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const total =
    counts.handovers + counts.messages + counts.notifications + counts.requests;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('driverPortal.pending.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('driverPortal.pending.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-red-900">
          <p>{t('driverPortal.pending.loadFailed')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadCounts()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('common.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('driverPortal.pending.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {counts.handovers > 0 ? (
          <Link href="/driver/handover" className="flex items-center gap-2 text-slate-700 hover:text-brand-primary">
            <Camera className="h-4 w-4" />
            {t('driverPortal.pending.handover', { count: counts.handovers })}
          </Link>
        ) : null}
        {counts.messages > 0 ? (
          <Link href="/driver/messages" className="flex items-center gap-2 text-slate-700 hover:text-brand-primary">
            <MessageSquare className="h-4 w-4" />
            {t('driverPortal.pending.messages', { count: counts.messages })}
          </Link>
        ) : null}
        {counts.notifications > 0 ? (
          <Link href="/driver/notifications" className="flex items-center gap-2 text-slate-700 hover:text-brand-primary">
            <Bell className="h-4 w-4" />
            {t('driverPortal.pending.notifications', { count: counts.notifications })}
          </Link>
        ) : null}
        {counts.requests > 0 ? (
          <Link href="/driver/requests" className="flex items-center gap-2 text-slate-700 hover:text-brand-primary">
            <FileText className="h-4 w-4" />
            {t('driverPortal.pending.requests', { count: counts.requests })}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
