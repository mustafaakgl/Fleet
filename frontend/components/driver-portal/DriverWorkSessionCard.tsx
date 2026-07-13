'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import {
  clearFeierabendPause,
  isFeierabendPausedToday,
  markFeierabendToday,
} from '@/lib/work-session-feierabend';

function formatStartedAt(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(value));
  } catch {
    return value.slice(0, 16).replace('T', ' ');
  }
}

export function DriverWorkSessionCard() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Awaited<ReturnType<typeof driverPortalApi.getCurrentWorkSession>>['session']>(null);
  const [active, setActive] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [feierabendToday, setFeierabendToday] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await driverPortalApi.getCurrentWorkSession();
      setActive(current.active);
      setNeedsReconciliation(Boolean(current.needsReconciliation));
      setSession(current.session);
      setFeierabendToday(isFeierabendPausedToday());
    } catch {
      setError(t('driverPortal.profile.workSessionLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        void driverPortalApi.heartbeatWorkSession().catch(() => undefined);
      }
    };

    const onVisibilityChange = () => {
      heartbeat();
    };

    const timer = window.setInterval(heartbeat, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    heartbeat();

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active]);

  async function handleEndShift() {
    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.endWorkSession('manual');
      markFeierabendToday();
      setFeierabendToday(true);
      await reload();
    } catch {
      setError(t('driverPortal.profile.workSessionEndFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartShift() {
    setBusy(true);
    setError(null);
    try {
      clearFeierabendPause();
      const session = await driverPortalApi.startWorkSession();
      setActive(true);
      setSession(session);
      setFeierabendToday(false);
      await driverPortalApi.heartbeatWorkSession().catch(() => undefined);
      await reload();
    } catch {
      setError(t('driverPortal.profile.workSessionStartFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-brand-primary" />
          {t('driverPortal.profile.workSessionTitle')}
        </CardTitle>
        <p className="text-sm text-slate-600">{t('driverPortal.profile.workSessionHint')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('driverPortal.assignments.loading')}
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-900">
              {active && session
                ? t('driverPortal.profile.workSessionActive', {
                    time: formatStartedAt(session.startedAt, i18n.language),
                  })
                : feierabendToday
                  ? t('driverPortal.profile.workSessionEndedToday')
                  : t('driverPortal.profile.workSessionInactive')}
            </p>
            {needsReconciliation && session ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-2">
                    <p>{t('driverPortal.profile.workSessionReconcileHint')}</p>
                    <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white">
                      <Link href={`/driver/work-session/reconcile?sessionId=${session.id}`}>
                        {t('driverPortal.profile.workSessionReconcileAction')}
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {active ? (
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={busy}
                onClick={() => void handleEndShift()}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('driverPortal.profile.endWorkSession')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void handleStartShift()}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {feierabendToday
                  ? t('driverPortal.profile.restartWorkSession')
                  : t('driverPortal.profile.startWorkSession')}
              </Button>
            )}
          </>
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
