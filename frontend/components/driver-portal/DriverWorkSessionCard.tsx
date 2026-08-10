'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Coffee, Loader2, Play, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi, type BreakCandidate, type WorkTimeShift } from '@/lib/api';
import { enqueueWorkTimeEventQueueItem } from '@/lib/driver-offline-queue';
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

function formatClock(value: string | null, locale: string): string {
  if (!value) return '–';
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(value),
    );
  } catch {
    return value.slice(11, 16);
  }
}

/** 573 → "9:33". Sayaç okunurlugu icin saat:dakika. */
function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Sunucudan gelen ozet, tarayicida saniye saniye ilerletiliyor.
 *
 * Sayac sunucudan her dakika cekilseydi ya ekran donuk gorunurdu ya da
 * gereksiz istek yagardi. Sunucu ozeti dogru referans, `tickMinutes` yalnizca
 * son cekimden bu yana gecen sureyi ekliyor.
 */
function projectShift(shift: WorkTimeShift, tickMinutes: number): {
  netMinutes: number;
  breakMinutes: number;
} {
  if (shift.state === 'working') {
    return { netMinutes: shift.netMinutes + tickMinutes, breakMinutes: shift.breakMinutes };
  }
  if (shift.state === 'on_break') {
    return { netMinutes: shift.netMinutes, breakMinutes: shift.breakMinutes + tickMinutes };
  }
  return { netMinutes: shift.netMinutes, breakMinutes: shift.breakMinutes };
}

export function DriverWorkSessionCard() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Awaited<ReturnType<typeof driverPortalApi.getCurrentWorkSession>>['session']>(null);
  const [shift, setShift] = useState<WorkTimeShift | null>(null);
  const [active, setActive] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [feierabendToday, setFeierabendToday] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [candidates, setCandidates] = useState<BreakCandidate[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [current, time, breakCandidates] = await Promise.all([
        driverPortalApi.getCurrentWorkSession(),
        driverPortalApi.getWorkTimeShift().catch(() => ({ active: false, shift: null })),
        // Aday listesi COKERSE kart yine calismali: bu bir oneri, vardiya
        // ekraninin calismasinin sarti degil.
        driverPortalApi.listBreakCandidates().catch(() => ({ active: false, candidates: [] })),
      ]);
      setActive(current.active);
      setNeedsReconciliation(Boolean(current.needsReconciliation));
      setSession(current.session);
      setShift(time.shift);
      setCandidates(breakCandidates.candidates);
      setFetchedAt(Date.now());
      setNow(Date.now());
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

  // Sayac yalnizca vardiya suruyorken ilerliyor; kapali gunde tik atmak
  // bataryayi bosuna yiyor.
  useEffect(() => {
    if (!shift || shift.state === 'off') {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [shift]);

  const projected = useMemo(() => {
    if (!shift) return null;
    const tickMinutes = Math.max(0, Math.floor((now - fetchedAt) / 60_000));
    return projectShift(shift, tickMinutes);
  }, [shift, now, fetchedAt]);

  async function handleBreak(kind: 'break_start' | 'break_end') {
    setBusy(true);
    setError(null);
    try {
      // Cevrimdisi kuyruga yaziliyor: sebeke varsa aninda gidiyor, yoksa
      // baglanti gelince ayni kimlikle gonderilip ikinci kez yazilmiyor.
      await enqueueWorkTimeEventQueueItem({
        eventType: kind,
        occurredAt: new Date().toISOString(),
      });
      await reload();
    } catch {
      setError(
        t(
          kind === 'break_start'
            ? 'driverPortal.profile.breakStartFailed'
            : 'driverPortal.profile.breakEndFailed',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

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
      const started = await driverPortalApi.startWorkSession();
      setActive(true);
      setSession(started);
      setFeierabendToday(false);
      await driverPortalApi.heartbeatWorkSession().catch(() => undefined);
      await reload();
    } catch {
      setError(t('driverPortal.profile.workSessionStartFailed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Aday karari. Onay molayi yazdigi icin vardiya ozeti de yenileniyor —
   * sayaç ekranda aninda dogru degeri gostermeli.
   */
  async function decideCandidate(id: string, decision: 'confirm' | 'dismiss') {
    setDecidingId(id);
    setError(null);
    try {
      const result = await driverPortalApi.decideBreakCandidate(id, decision);
      setCandidates((current) => current.filter((candidate) => candidate.id !== id));
      if (result.shift) {
        setShift(result.shift);
        setFetchedAt(Date.now());
        setNow(Date.now());
      }
    } catch {
      setError(t('driverPortal.breakCandidate.error'));
    } finally {
      setDecidingId(null);
    }
  }

  const onBreak = shift?.state === 'on_break';

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

            {active && projected ? (
              <div
                className={
                  onBreak
                    ? 'rounded-lg border border-amber-200 bg-amber-50 p-3'
                    : 'rounded-lg border border-slate-200 bg-slate-50 p-3'
                }
              >
                {onBreak ? (
                  <>
                    <p className="text-sm text-amber-900">{t('driverPortal.profile.breakRunning')}</p>
                    <p className="text-2xl font-semibold tabular-nums text-amber-900">
                      {formatDuration(projected.breakMinutes)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      {t('driverPortal.profile.workedSoFar')}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">
                      {formatDuration(projected.netMinutes)}
                    </p>
                    {projected.breakMinutes > 0 ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {t('driverPortal.profile.breakTotal', {
                          duration: formatDuration(projected.breakMinutes),
                        })}
                      </p>
                    ) : null}
                  </>
                )}
                {/* ArbZG §4: 6 saati asan iste 30, 9 saati asanda 45 dakika. */}
                {shift && shift.requiredBreakMinutes > projected.breakMinutes ? (
                  <p className="mt-2 text-sm text-amber-800">
                    {t('driverPortal.profile.breakRequiredHint', {
                      minutes: shift.requiredBreakMinutes,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Takograf DELIL uretir, kayit degil: bu kutu bir soru soruyor,
                onaylanana kadar hicbir sayi degismiyor. */}
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-lg border border-sky-200 bg-sky-50 p-3"
                data-testid="break-candidate"
              >
                <p className="text-sm text-sky-900">
                  {t('driverPortal.breakCandidate.question', {
                    from: formatClock(candidate.startedAt, i18n.language),
                    to: formatClock(candidate.endedAt, i18n.language),
                    minutes: candidate.durationMinutes,
                  })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={decidingId !== null}
                    onClick={() => void decideCandidate(candidate.id, 'confirm')}
                  >
                    {decidingId === candidate.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Coffee className="mr-2 h-4 w-4" />
                    )}
                    {t('driverPortal.breakCandidate.confirm')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decidingId !== null}
                    onClick={() => void decideCandidate(candidate.id, 'dismiss')}
                  >
                    {t('driverPortal.breakCandidate.dismiss')}
                  </Button>
                </div>
              </div>
            ))}

            {!active && shift && shift.state === 'off' && shift.startedAt && feierabendToday ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-slate-900">
                  {t('driverPortal.profile.feierabendSummary')}
                </p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">{t('driverPortal.profile.shiftStart')}</dt>
                    <dd className="tabular-nums text-slate-900">
                      {formatClock(shift.startedAt, i18n.language)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">{t('driverPortal.profile.shiftBreak')}</dt>
                    <dd className="tabular-nums text-slate-900">
                      {formatDuration(shift.breakMinutes)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">{t('driverPortal.profile.shiftEnd')}</dt>
                    <dd className="tabular-nums text-slate-900">
                      {formatClock(shift.endedAt, i18n.language)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-medium">
                    <dt className="text-slate-900">{t('driverPortal.profile.shiftNet')}</dt>
                    <dd className="tabular-nums text-slate-900">
                      {formatDuration(shift.netMinutes)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

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
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void handleBreak(onBreak ? 'break_end' : 'break_start')}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : onBreak ? (
                    <Play className="mr-2 h-4 w-4" />
                  ) : (
                    <Coffee className="mr-2 h-4 w-4" />
                  )}
                  {onBreak
                    ? t('driverPortal.profile.resumeWork')
                    : t('driverPortal.profile.startBreak')}
                </Button>
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
              </div>
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
