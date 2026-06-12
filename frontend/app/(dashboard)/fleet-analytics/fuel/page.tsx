'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Droplets, Plus, Receipt, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fleetFuelAnalyticsApi, fleetFuelEntriesApi, getApiErrorMessage } from '@/lib/api';
import { FLEET_FUEL_PERIOD_WEEKS, fleetFuelDateRange } from '@/lib/fleet-fuel-report';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import type { FleetFuelEntry, FleetFuelOverviewResponse } from '@/lib/types';

function intlLocale(language: string): string {
  if (language.startsWith('tr')) return 'tr-TR';
  if (language.startsWith('en')) return 'en-US';
  return 'de-DE';
}

export default function FleetFuelAnalyticsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<FleetFuelOverviewResponse | null>(null);
  const [entries, setEntries] = useState<FleetFuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = fleetFuelDateRange(weeks);
      const [overview, entryList] = await Promise.all([
        fleetFuelAnalyticsApi.getOverview(range),
        fleetFuelEntriesApi.list(range),
      ]);
      setData(overview);
      setEntries(entryList);
    } catch (e) {
      setData(null);
      setEntries([]);
      setError(getApiErrorMessage(e, t('fleetFuelReport.loadError', 'Yakıt analitiği yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [t, weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = intlLocale(i18n.language);
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      }),
    [locale],
  );
  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  const statCards = useMemo(() => {
    if (!data) return [];
    const avgPricePerLiter =
      data.totals.totalLiters > 0 ? data.totals.totalCost / data.totals.totalLiters : null;
    return [
      {
        key: 'cost',
        label: t('fuelHistory.stats.totalCost', 'Toplam Yakıt Maliyeti'),
        value: currency.format(data.totals.totalCost),
        unit: null as string | null,
      },
      {
        key: 'volume',
        label: t('fuelHistory.stats.totalVolume', 'Toplam Hacim'),
        value: data.totals.totalLiters.toLocaleString(locale, { maximumFractionDigits: 1 }),
        unit: t('fuelHistory.unit.liters', 'litre'),
      },
      {
        key: 'realAvg',
        label: t('fuelHistory.stats.avgEconomy', 'Ort. Tüketim (Gerçek)'),
        value:
          data.totals.avgLitersPer100Km != null ? data.totals.avgLitersPer100Km.toFixed(1) : '—',
        unit: 'L/100 km',
      },
      {
        key: 'estimatedAvg',
        label: t('fuelHistory.stats.avgEconomyEstimated', 'Ort. Tüketim (GPS)'),
        value:
          data.totals.avgEstimatedLitersPer100Km != null
            ? data.totals.avgEstimatedLitersPer100Km.toFixed(1)
            : '—',
        unit: 'L/100 km',
      },
      {
        key: 'avgPrice',
        label: t('fuelHistory.stats.avgCost', 'Ort. Maliyet'),
        value: avgPricePerLiter != null ? currency.format(avgPricePerLiter) : '—',
        unit: t('fuelHistory.unit.perLiter', '/ litre'),
      },
    ];
  }, [data, currency, locale, t]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Droplets className="h-6 w-6 text-primary" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fuelHistory.title', 'Yakıt Geçmişi')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-[13px]"
            value={weeks}
            onChange={(event) => setWeeks(Number(event.target.value))}
          >
            {FLEET_FUEL_PERIOD_WEEKS.map((option) => (
              <option key={option} value={option}>
                {t('fleetFuelReport.periodWeeks', '{{count}} hafta', { count: option })}
              </option>
            ))}
          </select>
          <Button asChild size="sm">
            <Link href="/fleet-analytics/fuel/new">
              <Plus className="mr-1.5 h-4 w-4" />
              {t('fuelHistory.addEntry', 'Yakıt Girişi Ekle')}
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error', 'Fehler')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => void load()}
        />
      ) : null}

      {!error && loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Laden…')}</p>
      ) : null}

      {!error && !loading && data ? (
        <>
          <Card className={FLEET_LIST_CARD}>
            <CardContent className="grid grid-cols-2 gap-px bg-slate-100 p-0 sm:grid-cols-3 xl:grid-cols-5">
              {statCards.map((card) => (
                <div key={card.key} className="bg-white px-4 py-3">
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {card.value}
                    {card.unit ? (
                      <span className="ml-1 text-xs font-normal text-slate-500">{card.unit}</span>
                    ) : null}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className={`${FLEET_LIST_CARD} mt-4`}>
            <CardContent className="overflow-x-auto p-0">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.vehicle', 'Araç')}
                    </TableHead>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.date', 'Tarih')}
                    </TableHead>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.driver', 'Sürücü')}
                    </TableHead>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.meter', 'Km Sayacı')}
                    </TableHead>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.volume', 'Hacim')}
                    </TableHead>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.total', 'Toplam')}
                    </TableHead>
                    <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                      {t('fuelHistory.col.receipt', 'Fiş')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD} aria-hidden />
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="px-4 py-6 text-center text-sm text-muted-foreground"
                      >
                        {t('fuelHistory.noEntries', 'Seçilen dönemde yakıt girişi yok.')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => {
                      const pricePerLiter = entry.liters > 0 ? entry.totalCost / entry.liters : null;
                      return (
                        <TableRow
                          key={entry.id}
                          className={FLEET_TABLE_ROW_CLICKABLE}
                          onClick={() => router.push(`/fleet-analytics/fuel/entries/${entry.id}`)}
                        >
                          <TableCell className={`${FLEET_TABLE_CELL_PRIMARY} whitespace-nowrap`}>
                            {entry.vehiclePlate ?? '—'}
                          </TableCell>
                          <TableCell className={`${FLEET_TABLE_CELL_MUTED} whitespace-nowrap`}>
                            {dateTimeFormat.format(new Date(entry.enteredAt))}
                          </TableCell>
                          <TableCell className={`${FLEET_TABLE_CELL} whitespace-nowrap`}>
                            {entry.driverName ?? '—'}
                          </TableCell>
                          <TableCell className={`${FLEET_TABLE_CELL} whitespace-nowrap`}>
                            {entry.odometerKm != null
                              ? `${entry.odometerKm.toLocaleString(locale, { maximumFractionDigits: 0 })} km`
                              : '—'}
                          </TableCell>
                          <TableCell className={`${FLEET_TABLE_CELL} whitespace-nowrap`}>
                            {entry.liters.toLocaleString(locale, { maximumFractionDigits: 3 })}{' '}
                            <span className="text-slate-500">L</span>
                          </TableCell>
                          <TableCell className={`${FLEET_TABLE_CELL} whitespace-nowrap`}>
                            <div className="font-medium text-slate-900">
                              {currency.format(entry.totalCost)}
                            </div>
                            {pricePerLiter != null ? (
                              <div className="text-xs text-slate-500">
                                {currency.format(pricePerLiter)} / L
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className={FLEET_TABLE_CELL}>
                            {entry.hasReceipt ? (
                              <Receipt className="h-4 w-4 text-emerald-600" aria-hidden />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className={FLEET_TABLE_CELL}>
                            <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
                      <TableHead className={FLEET_TABLE_HEAD} aria-hidden />
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {data.vehicles.map((vehicle) => (
                      <TableRow key={vehicle.vehicleId} className={FLEET_TABLE_ROW_CLICKABLE}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <Link
                            href={`/fleet-analytics/fuel/${vehicle.vehicleId}`}
                            className="inline-flex items-center gap-1 hover:text-primary"
                          >
                            {vehicle.plateNumber}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </TableCell>
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
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Link
                            href={`/fleet-analytics/fuel/${vehicle.vehicleId}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {t('fleetFuelReport.openDetail', 'Detay')}
                          </Link>
                        </TableCell>
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
