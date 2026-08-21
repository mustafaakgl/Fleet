'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Download, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import {
  CATEGORY_COLORS,
  TREND_METRICS,
  buildCostDashboardCsv,
  buildInsights,
  costDashboardCsvName,
  changeSentiment,
  costDashboardErrorKey,
  formatCostPerKm,
  formatCoveragePercent,
  formatMoney,
  formatPercent,
  formatTrendValue,
  isCoverageLow,
  isTrendMetricAvailable,
  toComposition,
  toMonthlyChartData,
  toTrendSeries,
  toVehicleChartData,
  trendDirection,
  type MetricPolarity,
  type TrendMetric,
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
  /** TEK canonical secim state'i: bar, tablo, insight ve filtre ayni yeri yazar. */
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('total');
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

  /**
   * Secili aracin AY AY serisi.
   *
   * Ayri bir istek, cunku ana cevaptaki `monthlySeries` FILONUN tamamina ait.
   * Arac kirilimini istemcide uydurmak yerine ayni uctan `vehicleId` ile
   * istiyoruz — hesap TEK yerde kaliyor ve toplamlar birbirini tutuyor.
   */
  const [trend, setTrend] = useState<CostDashboardResponse['monthlySeries']>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendErrorKey, setTrendErrorKey] = useState<string | null>(null);
  const trendAbortRef = useRef<AbortController | null>(null);
  const trendSeqRef = useRef(0);

  const loadTrend = useCallback(
    async (vehicleId: string) => {
      trendAbortRef.current?.abort();
      const controller = new AbortController();
      trendAbortRef.current = controller;
      const seq = trendSeqRef.current + 1;
      trendSeqRef.current = seq;

      setTrendLoading(true);
      setTrendErrorKey(null);
      try {
        const response = await dashboardApi.getCostDashboard(
          { months, vehicleId, pageSize: 1 },
          controller.signal,
        );
        // Hizli arac degistirmede ESKI cevap yenisini EZMEZ.
        if (seq !== trendSeqRef.current) return;
        setTrend(response.monthlySeries);
      } catch (caught) {
        if (seq !== trendSeqRef.current || controller.signal.aborted) return;
        setTrendErrorKey(costDashboardErrorKey(extractApiErrorCode(caught)));
      } finally {
        if (seq === trendSeqRef.current) setTrendLoading(false);
      }
    },
    [months],
  );

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

  const selectedId = selected?.vehicleId ?? null;
  useEffect(() => {
    if (!selectedId) {
      setTrend([]);
      return;
    }
    void loadTrend(selectedId);
    return () => trendAbortRef.current?.abort();
  }, [selectedId, loadTrend]);

  const trendData = useMemo(() => toTrendSeries(trend, trendMetric), [trend, trendMetric]);
  /**
   * Mesafe verisi olmayan aracta `costPerKm` SECILEMEZ.
   * Secili haldeyken veri kaybolursa toplama geri duseriz — kullanici bos bir
   * grafige bakip "bozuk" sonucuna varmasin.
   */
  const perKmAvailable = isTrendMetricAvailable('costPerKm', trend);
  useEffect(() => {
    if (trendMetric === 'costPerKm' && trend.length > 0 && !perKmAvailable) {
      setTrendMetric('total');
    }
  }, [trendMetric, perKmAvailable, trend.length]);

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

  // Drill-down baglantilarinin tasidigi donem — GUN hassasiyeti yeterli.
  const periodFrom = data.period.from.slice(0, 10);
  const periodTo = data.period.to.slice(0, 10);

  const kpis: Array<{
    key: string;
    metric: MetricComparison | null;
    polarity: MetricPolarity;
    recognition?: 'forecast' | 'approved_actual';
  }> = [
    { key: 'totalCost', metric: data.summary.totalCost, polarity: 'cost' },
    { key: 'fuelCost', metric: data.summary.fuelCost, polarity: 'cost' },
    { key: 'serviceCost', metric: data.summary.serviceCost, polarity: 'cost' },
    { key: 'fineCost', metric: data.summary.fineCost, polarity: 'cost' },
    /**
     * TAHMIN ve GERCEK gelir AYRI KARTLARDA ve bu pazarlik disi: tek bir
     * "Gelir" karti, gorev planindaki fiyati kesilmis fatura gibi
     * gosteriyordu. Kartlarin altinda sinif METIN olarak yaziyor.
     */
    {
      key: 'estimatedRevenue',
      metric: data.summary.estimatedRevenue,
      polarity: 'income',
      recognition: 'forecast',
    },
    {
      key: 'actualRevenue',
      metric: data.summary.actualRevenue,
      polarity: 'income',
      recognition: 'approved_actual',
    },
    {
      key: 'margin',
      metric: data.summary.margin,
      polarity: 'income',
      recognition: 'approved_actual',
    },
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
        {kpis.map(({ key, metric, polarity, recognition }) => (
          <KpiCard
            key={key}
            labelKey={`costs.dashboard.kpi.${key}`}
            metric={metric}
            polarity={polarity}
            currency={currency}
            locale={locale}
            recognition={recognition}
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
            {/* HANGI araclar uzerinden hesaplandigi ACIKCA yaziyor. */}
            <p className="text-xs text-muted-foreground" data-testid="coverage-note">
              {t('costs.dashboard.coverage.note', {
                included: data.costPerKmCoverage.includedVehicleCount,
                excluded: data.costPerKmCoverage.excludedVehicleCount,
              })}
            </p>
            {isCoverageLow(data.costPerKmCoverage.costCoveragePercent) ? (
              <p
                className="mt-1 rounded border border-amber-300 bg-amber-50 p-1.5 text-xs text-amber-900"
                data-testid="coverage-warning"
              >
                {t('costs.dashboard.coverage.warning', {
                  percent: formatCoveragePercent(data.costPerKmCoverage.costCoveragePercent, locale),
                })}
              </p>
            ) : null}
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

        {/**
         * TOPLAMA GIRMEYEN GERCEK TUTARLAR.
         *
         * Ayri bir kart, cunku bunlar "maliyet" degil "henuz maliyet degil".
         * Kompozisyona ya da toplam kartina karistirmak, onaylanmamis bir
         * tutari onaylanmis gibi gosterirdi. Sifir yazip gecmek ise
         * gorunmez yapardi.
         */}
        <Card data-testid="kpi-excluded">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('costs.dashboard.excludedTitle')}
            </p>
            <dl className="mt-1 space-y-0.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {t('costs.dashboard.excluded.pendingService', {
                    count: data.summary.pendingServiceCount,
                  })}
                </dt>
                <dd className="tabular-nums">
                  {formatMoney(data.summary.pendingServiceCost, currency, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {t('costs.dashboard.excluded.disputedFines', {
                    count: data.summary.disputedFineCount,
                  })}
                </dt>
                <dd className="tabular-nums">
                  {formatMoney(data.summary.disputedFineCost, currency, locale)}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('costs.dashboard.excludedNotIncluded')}
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

      {/* Arac tablosu — grafikle AYNI secim state'ini paylasiyor. */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">{t('costs.dashboard.table.title')}</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="cost-dashboard-export"
            onClick={() => downloadDashboardCsv(data)}
          >
            <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('costs.dashboard.table.export')}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Genis tablo YATAY kayiyor; sayfanin kendisi kaymiyor. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm" data-testid="vehicle-table">
              <caption className="sr-only">{t('costs.dashboard.table.caption')}</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3">{t('costs.dashboard.table.plate')}</th>
                  <th scope="col" className="py-2 pr-3">{t('costs.dashboard.table.name')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.table.distance')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.category.fuel')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.category.service')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.category.fines')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.kpi.totalCost')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.kpi.costPerKm')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {t('costs.dashboard.kpi.estimatedRevenue')}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {t('costs.dashboard.kpi.actualRevenue')}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.kpi.margin')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('costs.dashboard.table.change')}</th>
                  <th scope="col" className="py-2 pr-3">{t('costs.dashboard.table.drilldown')}</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicleRanking.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-6 text-center text-muted-foreground">
                      {t('costs.dashboard.table.empty')}
                    </td>
                  </tr>
                ) : (
                  data.vehicleRanking.map((row) => {
                    const isSelected = selected?.vehicleId === row.vehicleId;
                    return (
                      <tr
                        key={row.vehicleId}
                        // Satir KLAVYEYLE de secilebiliyor; fare tek yol degil.
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        data-testid={`vehicle-row-${row.plateNumber}`}
                        data-selected={isSelected ? 'true' : 'false'}
                        className={cn(
                          'cursor-pointer border-b outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected && 'bg-accent',
                        )}
                        onClick={() => setSelectedVehicleId(row.vehicleId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedVehicleId(row.vehicleId);
                          }
                        }}
                      >
                        <th scope="row" className="py-2 pr-3 text-left font-medium">
                          {row.plateNumber}
                        </th>
                        <td className="max-w-[10rem] truncate py-2 pr-3 text-muted-foreground" title={row.displayName ?? undefined}>
                          {row.displayName ?? '—'}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.distanceKm === null
                            ? t('costs.dashboard.noDistance')
                            : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
                                Number(row.distanceKm),
                              )} km`}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.fuel, currency, locale)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.service, currency, locale)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.fines, currency, locale)}</td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                          {formatMoney(row.total, currency, locale)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {/* Mesafe yoksa `0` DEGIL, sebebi yaziyor. */}
                          {formatCostPerKm(row.costPerKm, currency, locale) ?? (
                            <span className="text-xs text-muted-foreground">
                              {t('costs.dashboard.noDistance')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.estimatedRevenue === null ? (
                            <span className="text-xs text-muted-foreground">
                              {t('costs.dashboard.unknownValue')}
                            </span>
                          ) : (
                            formatMoney(row.estimatedRevenue, currency, locale)
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {/* Fatura yoksa `unknown` — tire ya da sifir DEGIL:
                              ikisi de "gelir yok" diye okunurdu, oysa dogru
                              cevap "olculemedi". */}
                          {row.actualRevenue === null ? (
                            <span className="text-xs text-muted-foreground">
                              {t('costs.dashboard.unknownValue')}
                            </span>
                          ) : (
                            formatMoney(row.actualRevenue, currency, locale)
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.margin === null ? (
                            <span className="text-xs text-muted-foreground">
                              {t('costs.dashboard.marginUnknown')}
                            </span>
                          ) : (
                            formatMoney(row.margin, currency, locale)
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {/* Onceki donem sifirsa yuzde UYDURULMUYOR. */}
                          {formatPercent(row.changePercent, locale) ?? (
                            <span className="text-xs text-muted-foreground">
                              {t('costs.dashboard.noPreviousData')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {/* Donem parametreleri KORUNUYOR: acilan liste ayni araligi gosterir. */}
                          <div className="flex flex-col gap-0.5 text-xs">
                            <Link className="underline underline-offset-2" href={`/vehicles/${row.vehicleId}`}>
                              {t('costs.dashboard.table.linkVehicle')}
                            </Link>
                            <Link
                              className="underline underline-offset-2"
                              href={`/costs?tab=receipts&vehicleId=${encodeURIComponent(row.vehicleId)}&from=${periodFrom}&to=${periodTo}`}
                            >
                              {t('costs.dashboard.table.linkReceipts')}
                            </Link>
                            <Link
                              className="underline underline-offset-2"
                              href={`/service-history?vehicle_id=${encodeURIComponent(row.vehicleId)}&from=${periodFrom}&to=${periodTo}`}
                            >
                              {t('costs.dashboard.table.linkService')}
                            </Link>
                            <Link
                              className="underline underline-offset-2"
                              href={`/fines?vehicle_id=${encodeURIComponent(row.vehicleId)}&from=${periodFrom}&to=${periodTo}`}
                            >
                              {t('costs.dashboard.table.linkFines')}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('costs.dashboard.table.pagination', {
              shown: data.vehicleRanking.length,
              total: data.pagination.total,
            })}
            {/* Yatay kaydirma GIZLI bir ozellik olmamali. */}
            {' '}
            {t('costs.dashboard.table.scrollHint')}
          </p>
        </CardContent>
      </Card>

      {/* Donusturulmemis tutarlar — TOPLAMA KATILMADI. */}
      {data.unconvertedByCurrency.length > 0 ? (
        <p
          className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700"
          data-testid="unconverted-note"
        >
          {t('costs.dashboard.unconvertedNote', {
            base: data.baseCurrency,
            list: data.unconvertedByCurrency
              .map((entry) => `${entry.amount} ${entry.currency} (${entry.entryCount})`)
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

            {/* Olcut secici — TEK olcut, TEK y ekseni. */}
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={t('costs.dashboard.trend.metricLabel')}
              data-testid="trend-metric-selector"
            >
              {TREND_METRICS.map((option) => {
                const available = option === 'costPerKm' ? perKmAvailable : true;
                return (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={option === trendMetric ? 'default' : 'outline'}
                    aria-pressed={option === trendMetric}
                    // Sebep GIZLENMIYOR: neden secilemedigi yardim metninde.
                    disabled={!available}
                    title={available ? undefined : t('costs.dashboard.trend.noDistanceHint')}
                    data-testid={`trend-metric-${option}`}
                    onClick={() => setTrendMetric(option)}
                  >
                    {t(`costs.dashboard.trend.metric.${option}`)}
                  </Button>
                );
              })}
            </div>
            {!perKmAvailable && trend.length > 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="trend-nodistance-hint">
                {t('costs.dashboard.trend.noDistanceHint')}
              </p>
            ) : null}

            {trendErrorKey ? (
              <div className="space-y-2" data-testid="trend-error">
                <p role="alert" className="text-sm">{t(trendErrorKey)}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadTrend(selected.vehicleId)}>
                  {t('common.retry')}
                </Button>
              </div>
            ) : trendLoading && trend.length === 0 ? (
              <div className="h-56 animate-pulse rounded-lg bg-muted" data-testid="trend-loading" />
            ) : (
              <div
                className="h-56"
                role="img"
                aria-label={t('costs.dashboard.trend.title', { plate: selected.plateNumber })}
                data-testid="trend-chart"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    {/* TEK eksen: para ile EUR/km ayni eksene sikistirilMIYOR. */}
                    <YAxis tick={{ fontSize: 11 }} width={70} />
                    <Tooltip
                      formatter={(value: number) => [
                        formatTrendValue(value, trendMetric, currency, locale),
                        t(`costs.dashboard.trend.metric.${trendMetric}`),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={CATEGORY_COLORS.fuel}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      // Veri olmayan ay 0'a DUSURULMEZ: cizgide bosluk kalir.
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Ayni seri METIN olarak — ekran okuyucu ve yazdirma icin. */}
            <table className="w-full text-xs" data-testid="trend-table">
              <caption className="sr-only">
                {t('costs.dashboard.trend.title', { plate: selected.plateNumber })}
              </caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col">{t('costs.dashboard.month')}</th>
                  <th scope="col">{t(`costs.dashboard.trend.metric.${trendMetric}`)}</th>
                </tr>
              </thead>
              <tbody>
                {trendData.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-2 text-muted-foreground">
                      {t('costs.dashboard.trend.empty')}
                    </td>
                  </tr>
                ) : (
                  trendData.map((point) => (
                    <tr key={point.bucket}>
                      <td>{point.bucket}</td>
                      <td className="font-medium">
                        {/* Bos ay GORUNUR kaliyor — satir atlanMIYOR. */}
                        {formatTrendValue(point.value, trendMetric, currency, locale)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

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

/**
 * Dashboard CSV'si indirilir.
 *
 * EKRANDAKI VERININ AYNISI: ayri bir istek atilmiyor, dolayisiyla export
 * secili donemi ve kiracinin temel para birimini birebir tasiyor.
 */
function downloadDashboardCsv(data: CostDashboardResponse) {
  // BOM: Excel UTF-8'i dogru okusun.
  const blob = new Blob([`\uFEFF${buildCostDashboardCsv(data)}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = costDashboardCsvName(data);
  anchor.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/**
 * KPI karti.
 *
 * `recognition` ROZETI zorunlu bir parametre degil ama gelir kartlarinda
 * VERILIYOR: "Gelir" yazan iki karti birbirinden ayiran sey renk ya da
 * siralama olamaz. Rozet METIN — renk korlugu, yazdirma ve ekran okuyucu
 * icin tek guvenilir yol.
 */
function KpiCard({
  labelKey,
  metric,
  polarity,
  currency,
  locale,
  recognition,
}: {
  labelKey: string;
  metric: MetricComparison | null;
  polarity: MetricPolarity;
  currency: string;
  locale: string;
  recognition?: 'forecast' | 'approved_actual';
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
          {/* Olculemeyen deger: tire DEGIL, acikca "bilinmiyor". Tire
              "sifir" diye okunur. */}
          {metric ? (
            formatMoney(metric.current, currency, locale)
          ) : (
            <span className="text-base font-medium text-muted-foreground">
              {t('costs.dashboard.unknownValue')}
            </span>
          )}
        </p>
        {recognition ? (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t(`costs.dashboard.recognition.${recognition}`)}
          </p>
        ) : null}
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
