'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  payrollApi,
  type PayrollExportRow,
  type PayrollLateChange,
  type PayrollPeriodDetail,
  type PayrollPeriodRow,
} from '@/lib/api';
import { downloadBlob } from '@/lib/download-blob';

function formatHours(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Sunucudan gelen hata kodunu kullaniciya anlatilabilir metne cevirir.
 *
 * Onay kapilari kod donuyor (`payroll_period_has_unmapped_days` gibi) cunku
 * ekranin ne yapilmasi gerektigini soyleyebilmesi lazim; ham HTTP hatasi
 * "bir seyler ters gitti" demekten oteye gecmezdi.
 */
function errorCodeOf(error: unknown): string | null {
  const response = (error as { response?: { data?: { code?: string } } })?.response;
  return response?.data?.code ?? null;
}

export function PayrollPeriodPanel() {
  const { t, i18n } = useTranslation();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  });
  const [period, setPeriod] = useState<PayrollPeriodDetail | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriodRow[]>([]);
  const [lateChanges, setLateChanges] = useState<PayrollLateChange[]>([]);
  const [exports, setExports] = useState<PayrollExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opened = await payrollApi.openPeriod(cursor.year, cursor.month);
      const [detail, all, late, exportRows] = await Promise.all([
        payrollApi.getPeriod(opened.id),
        payrollApi.listPeriods(),
        payrollApi.listLateChanges(opened.id).catch(() => ({ events: [] as PayrollLateChange[] })),
        payrollApi.listExports(opened.id).catch(() => [] as PayrollExportRow[]),
      ]);
      setPeriod(detail);
      setPeriods(all);
      setLateChanges(late.events);
      setExports(exportRows);
    } catch {
      setPeriod(null);
      setError(t('payroll.loadError'));
    } finally {
      setLoading(false);
    }
  }, [cursor, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, fallbackKey: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      const code = errorCodeOf(caught);
      setError(code ? t(`payroll.error.${code}`, { defaultValue: t(fallbackKey) }) : t(fallbackKey));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(row: PayrollExportRow) {
    setBusy(true);
    try {
      const blob = await payrollApi.downloadExport(row.id);
      downloadBlob(blob, `lohn-${period?.year}-${period?.month}.csv`);
    } catch {
      setError(t('payroll.downloadError'));
    } finally {
      setBusy(false);
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

  /**
   * Duzeltmenin kaynagi: bu aydan ONCEKI, dondurulmus donemler. Duzeltme her
   * zaman acik bir aya yazilir, kilitli ay degismez.
   */
  const correctableSources = useMemo(
    () =>
      periods.filter(
        (row) =>
          ['approved', 'exported', 'locked'].includes(row.status) &&
          row.year * 12 + row.month < cursor.year * 12 + cursor.month,
      ),
    [periods, cursor],
  );

  const status = period?.status;
  const regular = (period?.entries ?? []).filter((entry) => entry.kind === 'regular');
  const totals = regular.reduce(
    (sum, entry) => ({
      target: sum.target + entry.targetMinutes,
      worked: sum.worked + entry.workedMinutes,
      overtime: sum.overtime + entry.overtimeMinutes,
    }),
    { target: 0, worked: 0, overtime: 0 },
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{monthLabel}</CardTitle>
            {status ? (
              <p className="mt-1 text-sm text-slate-600">
                {t('payroll.periodStatus', { status: t(`workTime.status.${status}`) })}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('workTime.previousMonth')}
              onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('workTime.nextMonth')}
              onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-600">{t('payroll.summary.drivers')}</p>
                  <p className="text-xl font-semibold">{regular.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">{t('workTime.column.target')}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatHours(totals.target)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">{t('workTime.column.actual')}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatHours(totals.worked)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">{t('workTime.column.balance')}</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatHours(totals.overtime)}
                  </p>
                </div>
              </div>

              {/* Akis: taslak → inceleme → onay → ihracat → kilit. Her adimda
                  yalnizca o adimin dugmesi etkin; sunucu da ayni kapilari
                  uyguluyor, buradaki gizleme sadece kullaniciyi yormamak icin. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || !period || !['draft', 'review'].includes(status ?? '')}
                  onClick={() => void run(() => payrollApi.recompute(period!.id), 'payroll.recomputeError')}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {t('workTime.recompute')}
                </Button>
                <Button
                  disabled={busy || status !== 'draft'}
                  onClick={() => void run(() => payrollApi.submit(period!.id), 'payroll.submitError')}
                >
                  {t('payroll.action.submit')}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || status !== 'review'}
                  onClick={() => void run(() => payrollApi.reopen(period!.id), 'payroll.reopenError')}
                >
                  {t('payroll.action.reopen')}
                </Button>
                <Button
                  disabled={busy || status !== 'review'}
                  onClick={() => void run(() => payrollApi.approve(period!.id), 'payroll.approveError')}
                >
                  {t('payroll.action.approve')}
                </Button>
                <Button
                  disabled={busy || !['approved', 'exported'].includes(status ?? '')}
                  onClick={() => void run(() => payrollApi.exportPeriod(period!.id), 'payroll.exportError')}
                >
                  {t('payroll.action.export')}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || status !== 'exported'}
                  onClick={() => void run(() => payrollApi.lockPeriod(period!.id), 'payroll.lockError')}
                >
                  {t('payroll.action.lock')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {lateChanges.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              {t('payroll.lateChanges', { count: lateChanges.length })}
            </CardTitle>
            <p className="text-sm text-slate-600">{t('payroll.lateChangesHint')}</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-slate-700">
              {lateChanges.slice(0, 10).map((change) => (
                <li key={change.id} className="flex flex-wrap gap-x-3">
                  <span className="tabular-nums">{change.occurredAt.slice(0, 16).replace('T', ' ')}</span>
                  <span>{t(`payroll.eventType.${change.type}`, { defaultValue: change.type })}</span>
                  <span className="text-slate-500">{change.source}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {correctableSources.length > 0 && ['draft', 'review'].includes(status ?? '') ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('payroll.corrections.title')}</CardTitle>
            <p className="text-sm text-slate-600">{t('payroll.corrections.hint')}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {correctableSources.slice(0, 6).map((source) => (
              <div key={source.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-700">
                  {source.year}-{String(source.month).padStart(2, '0')}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => payrollApi.createCorrections(period!.id, source.id),
                      'payroll.correctionsError',
                    )
                  }
                >
                  {t('payroll.corrections.action')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {exports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('payroll.exports.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {exports.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="text-slate-900">
                    {t(`payroll.format.${row.format}`, { defaultValue: row.format })}
                  </p>
                  {/* Kontrol toplami: gonderilen dosyanin uretilen dosya
                      oldugunu sonradan kanitlayabilmek icin gosteriliyor. */}
                  <p className="font-mono text-xs text-slate-500">{row.fileSha256.slice(0, 16)}…</p>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleDownload(row)}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('payroll.exports.download')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
