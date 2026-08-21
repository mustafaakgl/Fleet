'use client';

import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { dashboardApi } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import type { DashboardRevenueByCompany } from '@/lib/types';
import { cn } from '@/lib/utils';

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function currency(value: number) {
  return currencyFormatter.format(value);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Monday-based week start, matching ISO 8601 (and the backend range logic). */
function startOfIsoWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** ISO 8601 week number, used only for the human-readable range label. */
function isoWeekNumber(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function WeeklyCompanyRevenue() {
  const { t, i18n } = useTranslation();
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [data, setData] = useState<DashboardRevenueByCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const from = toDateKey(weekStart);
  const to = toDateKey(weekEnd);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void dashboardApi
      .getRevenueByCompany(from, to)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const companies = useMemo(() => data?.companies ?? [], [data]);
  /**
   * TAHMIN ve GERCEK AYRI (Faz 18B).
   *
   * `totalRevenue` diye tek bir alan yoktu artik: haftalik kapanis ekrani
   * gorev planindaki fiyati kesilmis fatura gibi gosteriyordu. Ortalama da
   * TAHMIN uzerinden hesaplaniyor cunku boleni gorev sayisi.
   */
  const totalEstimatedRevenue = data?.totalEstimatedRevenue ?? 0;
  const totalActualRevenue = data?.totalActualRevenue ?? 0;
  const totalAssignments = data?.totalAssignments ?? 0;
  const averagePerAssignment =
    totalAssignments > 0 ? totalEstimatedRevenue / totalAssignments : 0;

  const dateRangeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language || 'de-DE', {
      day: '2-digit',
      month: '2-digit',
    });
    return `${formatter.format(weekStart)} – ${formatter.format(weekEnd)}`;
  }, [i18n.language, weekStart, weekEnd]);

  const isCurrentWeek = toDateKey(startOfIsoWeek(new Date())) === from;

  const chartData = useMemo(
    () =>
      companies.slice(0, 8).map((row) => ({
        name: row.companyName.length > 16 ? `${row.companyName.slice(0, 15)}…` : row.companyName,
        estimatedRevenue: row.estimatedRevenue,
        actualRevenue: row.actualRevenue,
      })),
    [companies],
  );

  const handleExport = useCallback(async () => {
    // npm install xlsx
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      companies.map((row) => ({
        [t('weeklyRevenue.colCompany')]: row.companyName,
        [t('weeklyRevenue.colAssignments')]: row.assignments,
        // Disari aktarim EKRANLA AYNI kurallari kullanir: iki gelir sutunu
        // ayri, hicbiri digerine dusmuyor.
        [t('weeklyRevenue.colEstimatedRevenue')]: row.estimatedRevenue,
        [t('weeklyRevenue.colActualRevenue')]: row.actualRevenue,
        [t('weeklyRevenue.colMissingPrice')]: row.assignmentsWithoutEstimate,
      })),
    );
    XLSX.utils.book_append_sheet(workbook, sheet, 'Revenue');
    XLSX.writeFile(workbook, `umsatz_${from}_${to}.xlsx`);
  }, [companies, from, to, t]);

  return (
    <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-900">{t('weeklyRevenue.title')}</h3>
          <p className="text-xs text-slate-500">
            {t('weeklyRevenue.weekLabel', { week: isoWeekNumber(weekStart) })} · {dateRangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('weeklyRevenue.previousWeek')}
            onClick={() => setWeekStart((current) => addDays(current, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(startOfIsoWeek(new Date()))}
          >
            {t('weeklyRevenue.currentWeek')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('weeklyRevenue.nextWeek')}
            onClick={() => setWeekStart((current) => addDays(current, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={companies.length === 0}
            onClick={() => void handleExport()}
          >
            <Download className="mr-1 h-4 w-4" />
            {t('weeklyRevenue.export')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-3 sm:grid-cols-4">
        <SummaryCell
          label={t('weeklyRevenue.totalEstimatedRevenue')}
          value={currency(totalEstimatedRevenue)}
          strong
        />
        <SummaryCell
          label={t('weeklyRevenue.totalActualRevenue')}
          value={currency(totalActualRevenue)}
          strong
        />
        <SummaryCell label={t('weeklyRevenue.totalAssignments')} value={String(totalAssignments)} />
        <SummaryCell label={t('weeklyRevenue.averagePerAssignment')} value={currency(averagePerAssignment)} />
      </div>

      {data && data.assignmentsWithoutEstimate > 0 ? (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('weeklyRevenue.missingPriceHint', { count: data.assignmentsWithoutEstimate })}
        </p>
      ) : null}

      {chartData.length > 0 ? (
        <div className="h-52 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis hide />
              <Tooltip formatter={(value: number) => currency(value)} />
              <Bar dataKey="revenue" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className={FLEET_RAW_TABLE}>
          <thead className={FLEET_RAW_THEAD}>
            <tr>
              <th className={FLEET_RAW_TH}>{t('weeklyRevenue.colCompany')}</th>
              <th className={cn(FLEET_RAW_TH, 'text-right')}>{t('weeklyRevenue.colAssignments')}</th>
              <th className={cn(FLEET_RAW_TH, 'text-right')}>
                {t('weeklyRevenue.colEstimatedRevenue')}
              </th>
              <th className={cn(FLEET_RAW_TH, 'text-right')}>
                {t('weeklyRevenue.colActualRevenue')}
              </th>
              <th className={cn(FLEET_RAW_TH, 'text-right')}>{t('weeklyRevenue.colShare')}</th>
            </tr>
          </thead>
          <tbody className={FLEET_RAW_TBODY}>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[13px] text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[13px] text-red-700">
                  {t('weeklyRevenue.loadError')}
                </td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[13px] text-slate-500">
                  {t('common.noRecords')}
                </td>
              </tr>
            ) : (
              companies.map((row) => (
                <tr key={row.companyId} className={FLEET_RAW_TR}>
                  <td className={FLEET_RAW_TD_PRIMARY}>{row.companyName}</td>
                  <td className={cn(FLEET_RAW_TD, 'text-right')}>{row.assignments}</td>
                  <td className={cn(FLEET_RAW_TD, 'text-right font-semibold')}>
                    {currency(row.estimatedRevenue)}
                  </td>
                  <td className={cn(FLEET_RAW_TD, 'text-right font-semibold')}>
                    {currency(row.actualRevenue)}
                  </td>
                  <td className={cn(FLEET_RAW_TD, 'text-right text-slate-500')}>
                    {/* Pay TAHMIN uzerinden: iki farkli sinifi bolmek
                        anlamsiz bir oran uretirdi. */}
                    {totalEstimatedRevenue > 0
                      ? `${Math.round((row.estimatedRevenue / totalEstimatedRevenue) * 100)}%`
                      : '–'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {companies.length > 0 ? (
            <tfoot>
              <tr className="border-t border-slate-300 bg-slate-50">
                <td className={cn(FLEET_RAW_TD, 'font-semibold text-slate-900')}>{t('weeklyRevenue.total')}</td>
                <td className={cn(FLEET_RAW_TD, 'text-right font-semibold text-slate-900')}>{totalAssignments}</td>
                <td className={cn(FLEET_RAW_TD, 'text-right font-semibold text-slate-900')}>
                  {currency(totalEstimatedRevenue)}
                </td>
                <td className={cn(FLEET_RAW_TD, 'text-right font-semibold text-slate-900')}>
                  {currency(totalActualRevenue)}
                </td>
                <td className={cn(FLEET_RAW_TD, 'text-right text-slate-500')}>100%</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-1 text-xl font-bold', strong ? 'text-brand-primary' : 'text-slate-900')}>{value}</p>
    </div>
  );
}
