'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coffee, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { breakCandidatesApi, type BreakCandidate } from '@/lib/api';

/**
 * Takografin gordugu ama Zeiterfassung'a girmemis dinlenmeler.
 *
 * Ofis burada BASKA birinin gunune karar veriyor; her karar denetim kaydina
 * yaziliyor. Panel bilerek ayri bir kart: vardiya listesi ham kayit gosteriyor,
 * burasi ise henuz kayit OLMAYAN bir iddiayi gosteriyor ve ikisinin
 * karistirilmamasi gerekiyor.
 *
 * Liste bos oldugunda kart HIC cizilmiyor — "0 aday" satiri her gun ekranda
 * yer kaplardi ve dikkat cekmesi gereken sey tam olarak dolu olmasi.
 */

interface BreakCandidatePanelProps {
  driverId: string;
  dateFrom: string;
  dateTo: string;
  /** driverId → gorunen ad. Aday yalnizca kimlik tasiyor. */
  driverNames: Map<string, string>;
}

function formatClock(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(value),
    );
  } catch {
    return value.slice(11, 16);
  }
}

function formatDay(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

export function BreakCandidatePanel({
  driverId,
  dateFrom,
  dateTo,
  driverNames,
}: BreakCandidatePanelProps) {
  const { t, i18n } = useTranslation();
  const [candidates, setCandidates] = useState<BreakCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCandidates(
        await breakCandidatesApi.list({
          driver_id: driverId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
      );
    } catch {
      setError(t('breakCandidates.loadError'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, driverId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'confirm' | 'dismiss') {
    setDecidingId(id);
    setError(null);
    try {
      await breakCandidatesApi.decide(id, decision);
      setCandidates((current) => current.filter((candidate) => candidate.id !== id));
    } catch {
      setError(t('breakCandidates.decideError'));
    } finally {
      setDecidingId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('breakCandidates.loading')}
        </CardContent>
      </Card>
    );
  }

  if (candidates.length === 0 && !error) {
    return null;
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="h-4 w-4 text-amber-600" />
          {t('breakCandidates.title', { count: candidates.length })}
        </CardTitle>
        <p className="text-sm text-slate-600">{t('breakCandidates.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="min-w-[220px]">
              <p className="text-sm font-medium text-slate-900">
                {driverNames.get(candidate.driverId) ?? candidate.driverId}
              </p>
              <p className="text-sm text-slate-600">
                {formatDay(candidate.startedAt, i18n.language)} ·{' '}
                <span className="tabular-nums">
                  {formatClock(candidate.startedAt, i18n.language)}–
                  {formatClock(candidate.endedAt, i18n.language)}
                </span>{' '}
                · {t('breakCandidates.minutes', { minutes: candidate.durationMinutes })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={decidingId !== null}
                onClick={() => void decide(candidate.id, 'confirm')}
              >
                {decidingId === candidate.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Coffee className="mr-2 h-4 w-4" />
                )}
                {t('breakCandidates.confirm')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={decidingId !== null}
                onClick={() => void decide(candidate.id, 'dismiss')}
              >
                {t('breakCandidates.dismiss')}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
