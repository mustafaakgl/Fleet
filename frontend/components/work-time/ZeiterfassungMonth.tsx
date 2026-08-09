'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  payrollApi,
  type PayrollDayRow,
  type PayrollEntryRow,
  type PayrollPeriodDetail,
} from '@/lib/api';
import {
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

/** −120 → "−2:00". Bakiye negatif olabildigi icin isaret ayrica yaziliyor. */
function formatSignedHours(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

function formatHours(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function driverName(entry: PayrollEntryRow): string {
  return entry.driver ? `${entry.driver.firstName} ${entry.driver.lastName}`.trim() : entry.driverId;
}

function formatDay(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Zeiterfassung'un aylik gorunumu.
 *
 * Kaynagi bordro donemi: Soll/Ist/Pause/Uberstunden zaten orada hesaplaniyor
 * ve burada ikinci bir hesap yapmak iki rakamin birbirinden kaymasi demek
 * olurdu. Ekran yalnizca gosteriyor.
 */
export function ZeiterfassungMonth() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  }));
  const [period, setPeriod] = useState<PayrollPeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [days, setDays] = useState<PayrollDayRow[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpandedDriverId(null);
    try {
      // Ay yoksa acilir: donem kaydi olmadan gosterilecek bir sey yok ve
      // kullaniciya "once donem olustur" dedirtmenin faydasi yok.
      const opened = await payrollApi.openPeriod(cursor.year, cursor.month);
      setPeriod(await payrollApi.getPeriod(opened.id));
    } catch {
      setPeriod(null);
      setError(t('workTime.loadError'));
    } finally {
      setLoading(false);
    }
  }, [cursor, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRecompute() {
    if (!period) return;
    setBusy(true);
    setError(null);
    try {
      await payrollApi.recompute(period.id);
      await load();
    } catch {
      setError(t('workTime.recomputeError'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDriver(driverId: string) {
    if (!period) return;
    if (expandedDriverId === driverId) {
      setExpandedDriverId(null);
      return;
    }
    setExpandedDriverId(driverId);
    setDaysLoading(true);
    try {
      setDays(await payrollApi.getDriverDays(period.id, driverId));
    } catch {
      setDays([]);
      setError(t('workTime.daysLoadError'));
    } finally {
      setDaysLoading(false);
    }
  }

  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
        new Date(Date.UTC(cursor.year, cursor.month - 1, 1)),
      );
    } catch {
      return `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;
    }
  }, [cursor, i18n.language]);

  // Duzeltme kalemleri ayri gosteriliyor: bu ayin saatleri degil, gecmis bir
  // ayin sonradan degisen farki. Toplamlariyla karistirmak yanlis olurdu.
  const regular = (period?.entries ?? []).filter((entry) => entry.kind === 'regular');
  const corrections = (period?.entries ?? []).filter((entry) => entry.kind === 'correction');

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t('workTime.title')}</CardTitle>
          <p className="mt-1 text-sm text-slate-600">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('workTime.previousMonth')}
            onClick={() => setCursor((current) => previousMonth(current.year, current.month))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('workTime.nextMonth')}
            onClick={() => setCursor((current) => nextMonth(current.year, current.month))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" disabled={busy || !period} onClick={() => void handleRecompute()}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('workTime.recompute')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {period ? (
          <p className="text-sm text-slate-600">
            {t('workTime.periodStatus', { status: t(`workTime.status.${period.status}`) })}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : regular.length === 0 ? (
          <p className="text-sm text-slate-600">{t('workTime.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={FLEET_TABLE}>
              <thead>
                <tr className={FLEET_TABLE_HEADER_ROW}>
                  <th className={FLEET_TABLE_HEAD}>{t('workTime.column.driver')}</th>
                  <th className={FLEET_TABLE_HEAD}>{t('workTime.column.target')}</th>
                  <th className={FLEET_TABLE_HEAD}>{t('workTime.column.actual')}</th>
                  <th className={FLEET_TABLE_HEAD}>{t('workTime.column.break')}</th>
                  <th className={FLEET_TABLE_HEAD}>{t('workTime.column.balance')}</th>
                </tr>
              </thead>
              <tbody className={FLEET_TABLE_BODY}>
                {regular.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cn(FLEET_TABLE_ROW, 'cursor-pointer')}
                    onClick={() => void toggleDriver(entry.driverId)}
                  >
                    <td className={FLEET_TABLE_CELL_PRIMARY}>{driverName(entry)}</td>
                    <td className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                      {formatHours(entry.targetMinutes)}
                    </td>
                    <td className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                      {formatHours(entry.workedMinutes)}
                    </td>
                    <td className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                      {/* Kalemde sutun degil: mola bordroya girmiyor, calisilan
                          sure zaten molalar dusulmus halde. Sunucu gun
                          satirlarindan toplayip ekliyor. */}
                      {formatHours(entry.breakMinutes ?? 0)}
                    </td>
                    <td
                      className={cn(
                        FLEET_TABLE_CELL,
                        'tabular-nums font-medium',
                        entry.balanceMinutes < 0 ? 'text-red-600' : 'text-emerald-700',
                      )}
                    >
                      {formatSignedHours(entry.balanceMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expandedDriverId ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-900">{t('workTime.dayBreakdown')}</p>
            {daysLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ul className="space-y-1">
                {days
                  // Bos gunler listeyi bogmasin; ilgi ceken sey calisilan veya
                  // isaretlenmis gunler.
                  .filter(
                    (day) =>
                      day.workedMinutes > 0 ||
                      (day.dayType !== 'off' && day.dayType !== null) ||
                      (day.anomalies?.length ?? 0) > 0,
                  )
                  .map((day) => (
                    <li
                      key={day.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700"
                    >
                      <span className="w-12 shrink-0 tabular-nums font-medium">
                        {formatDay(day.date, i18n.language)}
                      </span>
                      <span className="tabular-nums">{formatHours(day.workedMinutes)}</span>
                      {day.breakMinutes > 0 ? (
                        <span className="text-slate-500">
                          {t('workTime.dayBreak', { duration: formatHours(day.breakMinutes) })}
                        </span>
                      ) : null}
                      {day.dayType && day.dayType !== 'work' ? (
                        <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-700">
                          {t(`workTime.dayType.${day.dayType}`)}
                        </span>
                      ) : null}
                      {day.dayTypeSource === 'unmapped' ? (
                        <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">
                          {t('workTime.anomaly.calendar_code_unmapped', {
                            code: day.calendarCode ?? '',
                          })}
                        </span>
                      ) : null}
                      {(day.anomalies ?? []).map((anomaly) => (
                        <span
                          key={anomaly}
                          className="flex items-center gap-1 rounded bg-amber-100 px-1.5 text-xs text-amber-900"
                        >
                          <TriangleAlert className="h-3 w-3" />
                          {t(`workTime.anomaly.${anomaly}`, { defaultValue: anomaly })}
                        </span>
                      ))}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : null}

        {corrections.length > 0 ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-medium text-slate-900">
              {t('workTime.corrections', { count: corrections.length })}
            </p>
            <ul className="space-y-1 text-sm text-slate-700">
              {corrections.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-3">
                  <span>{driverName(entry)}</span>
                  <span className="tabular-nums">{formatSignedHours(entry.workedMinutes)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
