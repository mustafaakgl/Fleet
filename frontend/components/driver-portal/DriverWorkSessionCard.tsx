'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
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
  const [active, setActive] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [feierabendToday, setFeierabendToday] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await driverPortalApi.getCurrentWorkSession();
      setActive(current.active);
      setStartedAt(current.session?.startedAt ?? null);
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

  async function handleEndShift() {
    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.endWorkSession('manual');
      markFeierabendToday();
      setActive(false);
      setStartedAt(null);
      setFeierabendToday(true);
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
      setStartedAt(session.startedAt);
      setFeierabendToday(false);
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
          <Clock className="h-4 w-4 text-[#1a4d7a]" />
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
              {active
                ? t('driverPortal.profile.workSessionActive', {
                    time: startedAt ? formatStartedAt(startedAt, i18n.language) : '—',
                  })
                : feierabendToday
                  ? t('driverPortal.profile.workSessionEndedToday')
                  : t('driverPortal.profile.workSessionInactive')}
            </p>
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
