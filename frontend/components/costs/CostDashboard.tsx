'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import {
  CATEGORY_COLORS,
  buildInsights,
  changeSentiment,
  costDashboardErrorKey,
  formatCostPerKm,
  formatMoney,
  formatPercent,
  toComposition,
  toMonthlyChartData,
  toVehicleChartData,
  trendDirection,
  type MetricPolarity,
} from '@/lib/cost-dashboard-view';
import { cn } from '@/lib/utils';
import type { CostDashboardResponse, MetricComparison } from '@/lib/types';

const PERIODS = [1, 3, 6, 12] as const;
const SORTS = ['total', 'costPerKm', 'margin', 'change'] as const;

/**
 * Arac maliyeti dashboard'u.
 *
 * Grafikler DEKORATIF DEGIL: her biri bir soruya cevap veriyor ve tiklaninca
 * arac secimi/filtre uyguluyor. Kesin rakamlar her zaman METIN olarak da
 * duruyor — grafik tek bilgi kaynagi olmamali (renk korlugu, ekran okuyucu,
 * yazdirma).
 *
 * PARA SEMBOLU HARD-CODE EDILMIYOR: `baseCurrency` backend'den geliyor ve
 * Intl.NumberFormat hem sembolu hem ayraclari locale'e gore seciyor.
 */
export function CostDashboard() {
  const { t, i18n } = useTranslation();

  const [months, setMonths] = useState<number>(6);
  const [sort, setSort] = useState<(typeof SORTS)[number]>('total');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [data, setData] = useState<CostDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** Eski cevap yenisinin uzerine YAZMAMALI. */
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = seqRef.current + 1;
    seqRef.current = seq;

    setLoading(true);
    setErrorKey(null);
    try {
      const response = await dashboardApi.getCostDashboard({ months, sort }, controller.signal);
      if (seq !== seqRef.current) return;
      setData(response);
    } catch (caught) {
      if (seq !== seqRef.current || controller.signal.aborted) return;
      setErrorKey(costDashboardErrorKey(extractApiErrorCode(caught)));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [months, sort]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const currency = data?.baseCurrency ?? 'EUR';
  const locale = i18n.language;

  const monthly = useMemo(() => toMonthlyChartData(data?.monthlySeries ?? []), [data]);
  const composition = useMemo(
    () => (data ? toComposition(data.composition) : []),
    [data],
  );
  const vehicleChart = useMemo(
    () => toVehicleChartData(data?.vehicleRanking ?? []).slice(0, 10),
    [data],
  );
  const insights = useMemo(() => buildInsights(data), [data]);

  /** Secili arac yoksa en pahali arac — bu karar EKRANDA yaziyor. */
  const selected = useMemo(() => {
    if (!data) return null;
    return (
      data.vehicleRanking.find((row) => row.vehicleId === selectedVehicleId) ??
      data.vehicleRanking[0] ??
      null
    );
  }, [data, selectedVehicleId]);

  if (loading && !data) {
    return (
      <div className="space-y-4" data-testid="cost-dashboard-loading">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (errorKey) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p role="alert" className="text-sm">{t(errorKey)}</p>
          <Button type="button" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const kpis: Array<{ key: string; metric: MetricComparison | null; polarity: MetricPolarity }> = [
    { key: 'totalCost', metric: data.summary.totalCost, polarity: 'cost' },
    { key: 'fuelCost', metric: data.summary.fuelCost, polarity: 'cost' },
    { key: 'serviceCost', metric: data.summary.serviceCost, polarity: 'cost' },
    { key: 'fineCost', metric: data.summary.fineCost, polarity: 'cost' },
    { key: 'revenue', metric: data.summary.revenue, polarity: 'income' },
    { key: 'margin', metric: data.summary.margin, polarity: 'income' },
  ];

  return (
    <div className="space-y-4" data-testid="cost-dashboard">
      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('costs.dashboard.period')}>
          {PERIODS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={option === months ? 'default' : 'outline'}
              aria-pressed={option === months}
              onClick={() => setMonths(option)}
            >
              {t('costs.dashboard.months', { count: option })}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {t('costs.dashboard.comparedTo', {
            from: new Date(data.comparisonPeriod.from).toLocaleDateString(locale),
            to: new Date(data.comparisonPeriod.to).toLocaleDateString(locale),
          })}
        </span>
      </div>

      {/* KPI kartlari */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpi-row">
        {kpis.map(({ key, metric, polarity }) => (
          <KpiCard
            key={key}
            labelKey={`costs.dashboard.kpi.${key}`}
            metric={metric}
            polarity={polarity}
            currency={currency}
            locale={locale}
          />
        ))}

        {/* Maliyet/km — deger yoksa `0 €/km` DEGIL "yetersiz veri". */}
        <Card data-testid="kpi-costPerKm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('costs.dashboard.kpi.costPerKm')}
            </p>
            <p className="text-2xl font-bold">
              {formatCostPerKm(data.summary.costPerKm?.current ?? null, currency, locale) ?? (
                <span className="text-base font-medium text-muted-foreground">
                  {t('costs.dashboard.noDistance')}
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Bekleyen fisler: TOPLAMA DAHIL DEGIL, yalnizca adet. */}
        <Card data-testid="kpi-pending">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('costs.dashboard.kpi.pendingReceipts')}
            </p>
            <p className="text-2xl font-bold">{data.summary.pendingReceiptCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('costs.dashboard.pendingNotIncluded')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aylik gelisim + dagilim */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('costs.dashboard.monthlyTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72" role="img" aria-label={t('costs.dashboard.monthlyTitle')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatMoney(value, currency, locale),
                      t(`costs.dashboard.category.${name}`),
                    ]}
                  />
                  <Legend formatter={(value: string) => t(`costs.dashboard.category.${value}`)} />
                  {/* 3D ve gereksiz animasyon YOK. */}
                  <Bar dataKey="fuel" stackId="cost" fill={CATEGORY_COLORS.fuel} isAnimationActive={false} />
                  <Bar dataKey="service" stackId="cost" fill={CATEGORY_COLORS.service} isAnimationActive={false} />
                  <Bar dataKey="fines" stackId="cost" fill={CATEGORY_COLORS.fines} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Grafik TEK bilgi kaynagi degil: ayni veri tablo olarak da var. */}
            <table className="mt-3 w-full text-xs" data-testid="monthly-table">
              <caption className="sr-only">{t('costs.dashboard.monthlyTitle')}</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col">{t('costs.dashboard.month')}</th>
                  <th scope="col">{t('costs.dashboard.category.fuel')}</th>
                  <th scope="col">{t('costs.dashboard.category.service')}</th>
                  <th scope="col">{t('costs.dashboard.category.fines')}</th>
                  <th scope="col">{t('costs.dashboard.kpi.totalCost')}</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlySeries.map((point) => (
                  <tr key={point.bucket}>
                    <td>{point.bucket}</td>
                    <td>{formatMoney(point.fuel, currency, locale)}</td>
                    <td>{formatMoney(point.service, currency, locale)}</td>
                    <td>{formatMoney(point.fines, currency, locale)}</td>
                    <td className="font-medium">{formatMoney(point.total, currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('costs.dashboard.compositionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52" role="img" aria-label={t('costs.dashboard.compositionTitle')}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={composition}
                    dataKey="value"
                    nameKey="key"
                    innerRadius="55%"
                    outerRadius="85%"
                    isAnimationActive={false}
                  >
                    {composition.map((slice) => (
                      <Cell key={slice.key} fill={CATEGORY_COLORS[slice.key]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Kesin tutar ve yuzdeler METIN olarak. */}
            <dl className="space-y-1 text-sm" data-testid="composition-list">
              {composition.map((slice) => (
                <div key={slice.key} className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[slice.key] }}
                    />
                    {t(`costs.dashboard.category.${slice.key}`)}
                  </dt>
                  <dd className="font-medium">
                    {formatMoney(slice.value, currency, locale)}
                    {slice.percent === null
                      ? ''
                      : ` · ${slice.percent.toFixed(1)}%`}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Arac siralamasi + notlar */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">{t('costs.dashboard.rankingTitle')}</CardTitle>
            <div className="flex flex-wrap gap-1">
              {SORTS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={option === sort ? 'default' : 'outline'}
                  aria-pressed={option === sort}
                  onClick={() => setSort(option)}
                >
                  {t(`costs.dashboard.sort.${option}`)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80" role="img" aria-label={t('costs.dashboard.rankingTitle')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleChart} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  {/* Plaka KESILMIYOR: genis eksen. */}
                  <YAxis type="category" dataKey="plateNumber" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatMoney(value, currency, locale),
                      t(`costs.dashboard.category.${name}`),
                    ]}
                  />
                  <Legend formatter={(value: string) => t(`costs.dashboard.category.${value}`)} />
                  <Bar
                    dataKey="fuel"
                    stackId="v"
                    fill={CATEGORY_COLORS.fuel}
                    isAnimationActive={false}
                    onClick={(entry: { vehicleId?: string }) =>
                      entry.vehicleId && setSelectedVehicleId(entry.vehicleId)
                    }
                  />
                  <Bar dataKey="service" stackId="v" fill={CATEGORY_COLORS.service} isAnimationActive={false} />
                  <Bar dataKey="fines" stackId="v" fill={CATEGORY_COLORS.fines} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('costs.dashboard.insightsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* AI DEGIL: her not sayilabilir bir gercege dayaniyor. */}
            <ul className="space-y-2 text-sm" data-testid="insight-list">
              {insights.length === 0 ? (
                <li className="text-muted-foreground">{t('costs.dashboard.noInsights')}</li>
              ) : (
                insights.map((insight) => (
                  <li key={insight.key}>
                    <button
                      type="button"
                      className="w-full rounded-md border p-2 text-left hover:bg-accent"
                      disabled={!insight.vehicleId}
                      onClick={() =>
                        insight.vehicleId && setSelectedVehicleId(insight.vehicleId)
                      }
                    >
                      {t(`costs.dashboard.insights.${insight.key}`, insight.params ?? {})}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Donusturulmemis tutarlar — TOPLAMA KATILMADI. */}
      {data.unconvertedByCurrency.length > 0 ? (
        <p
          className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700"
          data-testid="unconverted-note"
        >
          {t('costs.dashboard.unconvertedNote', {
            base: data.baseCurrency,
            list: data.unconvertedByCurrency
              .map((entry) => `${entry.fuelAmount} ${entry.currency} (${entry.entryCount})`)
              .join(', '),
          })}
        </p>
      ) : null}

      {/* Secili arac — hangi aracin gosterildigi ACIKCA yaziyor. */}
      {selected ? (
        <Card data-testid="selected-vehicle">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('costs.dashboard.selectedVehicle', { plate: selected.plateNumber })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selectedVehicleId === null ? (
              <p className="text-xs text-muted-foreground">
                {t('costs.dashboard.defaultSelection')}
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label={t('costs.dashboard.category.fuel')} value={formatMoney(selected.fuel, currency, locale)} />
              <Metric label={t('costs.dashboard.category.service')} value={formatMoney(selected.service, currency, locale)} />
              <Metric label={t('costs.dashboard.category.fines')} value={formatMoney(selected.fines, currency, locale)} />
              <Metric
                label={t('costs.dashboard.kpi.costPerKm')}
                value={
                  formatCostPerKm(selected.costPerKm, currency, locale) ??
                  t('costs.dashboard.noDistance')
                }
              />
            </dl>
            <Button asChild variant="outline" size="sm">
              <Link href={`/vehicles/${selected.vehicleId}`}>
                {t('costs.dashboard.openVehicle')}
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function KpiCard({
  labelKey,
  metric,
  polarity,
  currency,
  locale,
}: {
  labelKey: string;
  metric: MetricComparison | null;
  polarity: MetricPolarity;
  currency: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const direction = trendDirection(metric);
  const sentiment = changeSentiment(direction, polarity);
  const percent = formatPercent(metric?.percentChange ?? null, locale);

  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;

  return (
    <Card data-testid={`kpi-${labelKey.split('.').pop()}`}>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(labelKey)}
        </p>
        <p className="text-2xl font-bold">
          {metric ? formatMoney(metric.current, currency, locale) : '—'}
        </p>
        {metric ? (
          <p
            className={cn(
              'flex items-center gap-1 text-xs',
              sentiment === 'bad' && 'text-red-600',
              sentiment === 'good' && 'text-emerald-600',
              sentiment === 'neutral' && 'text-muted-foreground',
            )}
          >
            {/* Renk TEK BASINA anlam tasimiyor: ok + metin de var. */}
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span>
              {percent ?? t('costs.dashboard.noPreviousData')}
              {' · '}
              {t('costs.dashboard.previous', {
                value: formatMoney(metric.previous, currency, locale),
              })}
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
