'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import type { DriverPortalNotification } from '@/lib/types';

function notificationHref(item: DriverPortalNotification): string | null {
  if (item.relatedEntityType === 'conversation' && item.relatedEntityId) {
    return `/driver/messages/${item.relatedEntityId}`;
  }
  if (item.relatedEntityType === 'assignment' && item.relatedEntityId) {
    return `/driver/assignments/${item.relatedEntityId}`;
  }
  if (item.type?.includes('request')) return '/driver/requests';
  return null;
}

export default function DriverNotificationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<DriverPortalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await driverPortalApi.listNotifications();
    setItems(rows);
  }

  useEffect(() => {
    load()
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  async function markAllRead() {
    setBusy(true);
    try {
      await driverPortalApi.markAllNotificationsRead();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id: string) {
    await driverPortalApi.markNotificationRead(id);
    await load();
  }

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{t('driverPortal.notifications.title')}</CardTitle>
            <p className="text-sm text-slate-600">{t('driverPortal.notifications.subtitle')}</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void markAllRead()}>
            {t('driverPortal.notifications.markAll')}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('driverPortal.assignments.loading')}
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">{t('driverPortal.notifications.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => {
                const href = notificationHref(item);
                const content = (
                  <div className="py-3">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                );
                return (
                  <li key={item.id}>
                    {href ? (
                      <Link
                        href={href}
                        className="block hover:bg-slate-50"
                        onClick={() => void markRead(item.id)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="block w-full text-left hover:bg-slate-50"
                        onClick={() => void markRead(item.id)}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
