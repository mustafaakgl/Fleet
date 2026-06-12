'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Droplets, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fleetFuelAnalyticsApi, getApiErrorMessage } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import type { FleetFuelOverviewResponse } from '@/lib/types';

const PERIOD_OPTIONS = [4, 8, 12];

function monthsAgoIso(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FleetFuelAnalyticsPage() {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<FleetFuelOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = monthsAgoIso(Math.ceil(weeks / 4));
      const result = await fleetFuelAnalyticsApi.getOverview({ from, to: todayIso() });
      setData(result);
    } catch (e) {
      setData(null);
      setError(getApiErrorMessage(e, t('fleetFuelReport.loadError', 'Yakıt analitiği yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [t, weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: 'real',
        label: t('fleetFuelReport.summary.realLiters', 'Gerçek litre (fiş)'),
        value: `${data.totals.totalLiters.toFixed(1)} L`,
      },
      {
        key: 'estimated',
        label: t('fleetFuelReport.summary.estimatedLiters', 'Tahmini litre (GPS)'),
        value: `${data.totals.totalEstimatedLiters.toFixed(1)} L`,
      },
      {
        key: 'realAvg',
        label: t('fleetFuelReport.summary.realAvg', 'Gerçek L/100 km'),
        value: data.totals.avgLitersPer100Km != null ? `${data.totals.avgLitersPer100Km.toFixed(1)}` : '—',
      },
      {
        key: 'estimatedAvg',
        label: t('fleetFuelReport.summary.estimatedAvg', 'Tahmini L/100 km'),
        value:
          data.totals.avgEstimatedLitersPer100Km != null
            ? `${data.totals.avgEstimatedLitersPer100Km.toFixed(1)}`
            : '—',
      },
      {
        key: 'distance',
        label: t('fleetFuelReport.summary.tripKm', 'GPS sefer km'),
        value: `${data.totals.tripDistanceKm.toFixed(0)} km`,
      },
      {
        key: 'cost',
        label: t('fleetFuelReport.summary.fuelCost', 'Yakıt maliyeti'),
        value: `${data.totals.totalCost.toFixed(2)} €`,
      },
    ];
  }, [data, t]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Droplets className="h-6 w-6 text-primary" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fleetFuelReport.title', 'Yakıt analitiği')}</h1>
        </div>
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={weeks}
          onChange={(event) => setWeeks(Number(event.target.value))}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t('fleetFuelReport.periodWeeks', '{{count}} hafta', { count: option })}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error', 'Fehler')}
          description={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => void load()}
        />
      ) : null}

      {!error && loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Laden…')}</p>
      ) : null}

      {!error && !loading && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <Card key={card.key} className={FLEET_LIST_CARD}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetFuelReport.vehicleTable', 'Araç karşılaştırması')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.vehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('fleetFuelReport.noData', 'Seçilen dönemde yakıt veya sefer verisi yok.')}
                </p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.plate', 'Plaka')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.realAvg', 'Gerçek L/100')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.estimatedAvg', 'Tahmini L/100')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.realLiters', 'Gerçek L')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.estimatedLiters', 'Tahmini L')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.tripKm', 'Sefer km')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {data.vehicles.map((vehicle) => (
                      <TableRow key={vehicle.vehicleId} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{vehicle.plateNumber}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {vehicle.avgLitersPer100Km?.toFixed(1) ?? '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {vehicle.avgEstimatedLitersPer100Km?.toFixed(1) ?? '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{vehicle.totalLiters.toFixed(1)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {vehicle.totalEstimatedLiters.toFixed(1)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{vehicle.tripDistanceKm.toFixed(0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
