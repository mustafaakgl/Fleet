'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { driverPortalApi, type DriverWorkSessionState } from '@/lib/api';

function toDatetimeLocal(value: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 16);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatSessionLabel(session: DriverWorkSessionState, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(session.startedAt));
  } catch {
    return session.startedAt.slice(0, 16).replace('T', ' ');
  }
}

export default function DriverWorkSessionReconcilePage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DriverWorkSessionState | null>(null);
  const [endedAt, setEndedAt] = useState(() => toDatetimeLocal(null));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    driverPortalApi
      .getCurrentWorkSession()
      .then((current) => {
        if (!active) {
          return;
        }
        if (!current.active || !current.needsReconciliation || !current.session) {
          router.replace('/driver');
          return;
        }
        setSession(current.session);
        setEndedAt(toDatetimeLocal(current.session.endedAt ?? current.session.lastSeenAt ?? current.session.startedAt));
      })
      .catch(() => setError(t('driverPortal.profile.workSessionLoadError')))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router, t]);

  async function handleSubmit() {
    if (!session) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.reconcileWorkSession({
        ended_at: new Date(endedAt).toISOString(),
        reason: reason.trim(),
        note: note.trim() || undefined,
      });
      router.replace('/driver');
    } catch {
      setError(t('driverPortal.profile.workSessionReconcileFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <div className="space-y-5">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-950">
              <TriangleAlert className="h-4 w-4" />
              {t('driverPortal.profile.workSessionReconcileTitle')}
            </CardTitle>
            <p className="text-sm text-amber-900">{t('driverPortal.profile.workSessionReconcileHint')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('driverPortal.assignments.loading')}
              </div>
            ) : session ? (
              <>
                <div className="rounded-lg border border-amber-200 bg-white p-4 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{formatSessionLabel(session, i18n.language)}</p>
                  <p className="mt-1 text-slate-600">
                    {t('driverPortal.profile.workSessionReconcileCurrent', {
                      time: session.lastSeenAt ? session.lastSeenAt : session.startedAt,
                    })}
                  </p>
                </div>
                <div className="grid gap-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">{t('driverPortal.profile.workSessionEndedAt')}</span>
                    <Input
                      type="datetime-local"
                      value={endedAt}
                      onChange={(e) => setEndedAt(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">{t('driverPortal.profile.workSessionReconcileReason')}</span>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">{t('driverPortal.profile.workSessionReconcileNote')}</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-[#1a4d7a] focus:ring-2 focus:ring-[#1a4d7a]/15"
                    />
                  </label>
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button
                  type="button"
                  className="w-full bg-[#1a4d7a] hover:bg-[#163f64]"
                  disabled={busy || !reason.trim() || !endedAt}
                  onClick={() => void handleSubmit()}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                  {t('driverPortal.profile.workSessionReconcileAction')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-amber-900">{t('driverPortal.profile.workSessionReconcileMissing')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DriverPortalShell>
  );
}
