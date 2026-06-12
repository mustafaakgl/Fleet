'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Droplets, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { fleetFuelEntriesApi, getApiErrorMessage } from '@/lib/api';
import { FLEET_LIST_CARD, FLEET_PAGE, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import type { FleetFuelEntryDetail } from '@/lib/types';

function intlLocale(language: string): string {
  if (language.startsWith('tr')) return 'tr-TR';
  if (language.startsWith('en')) return 'en-US';
  return 'de-DE';
}

export default function FleetFuelEntryDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const entryId = params?.id;
  const [entry, setEntry] = useState<FleetFuelEntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entryId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fleetFuelEntriesApi.getById(entryId);
      setEntry(result);
    } catch (e) {
      setEntry(null);
      setError(getApiErrorMessage(e, t('fuelHistory.detail.loadError', 'Yakıt girişi yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [entryId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = intlLocale(i18n.language);
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: entry?.currency || 'EUR' }),
    [locale, entry?.currency],
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

  const pricePerLiter = entry && entry.liters > 0 ? entry.totalCost / entry.liters : null;
  const usageKm =
    entry && entry.odometerKm != null && entry.previousOdometerKm != null
      ? entry.odometerKm - entry.previousOdometerKm
      : null;
  const consumptionPer100 =
    entry && usageKm != null && usageKm > 0 ? (entry.liters / usageKm) * 100 : null;

  return (
    <div className={FLEET_PAGE}>
      <div>
        <Link
          href="/fleet-analytics/fuel"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('fuelHistory.title', 'Yakıt Geçmişi')}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <Droplets className="h-6 w-6 text-primary" />
          <h1 className={FLEET_PAGE_TITLE}>
            {t('fuelHistory.detail.title', 'Yakıt Girişi')}
            {entry?.vehiclePlate ? (
              <span className="ml-2 text-base font-medium text-slate-500">{entry.vehiclePlate}</span>
            ) : null}
          </h1>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error', 'Hata')}
          subtitle={error}
          actionLabel={t('common.retry', 'Tekrar dene')}
          onAction={() => void load()}
        />
      ) : null}

      {!error && loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Yükleniyor…')}</p>
      ) : null}

      {!error && !loading && entry ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className={`${FLEET_LIST_CARD} lg:col-span-2`}>
            <CardHeader>
              <CardTitle className="text-base">
                {t('fuelHistory.detail.details', 'Detaylar')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-slate-100">
                {[
                  {
                    key: 'vehicle',
                    label: t('fuelHistory.col.vehicle', 'Araç'),
                    value: (
                      <Link
                        href={`/fleet-analytics/fuel/${entry.vehicleId}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {entry.vehiclePlate}
                      </Link>
                    ),
                  },
                  {
                    key: 'driver',
                    label: t('fuelHistory.col.driver', 'Sürücü'),
                    value: entry.driverName || '—',
                  },
                  {
                    key: 'date',
                    label: t('fuelHistory.col.date', 'Tarih'),
                    value: dateTimeFormat.format(new Date(entry.enteredAt)),
                  },
                  {
                    key: 'odometer',
                    label: t('fuelHistory.col.meter', 'Km Sayacı'),
                    value:
                      entry.odometerKm != null
                        ? `${entry.odometerKm.toLocaleString(locale, { maximumFractionDigits: 0 })} km`
                        : '—',
                  },
                  {
                    key: 'previous',
                    label: t('fuelHistory.detail.previousEntry', 'Önceki Giriş'),
                    value: entry.previousEntryAt
                      ? `${dateTimeFormat.format(new Date(entry.previousEntryAt))}${
                          entry.previousOdometerKm != null
                            ? ` · ${entry.previousOdometerKm.toLocaleString(locale, { maximumFractionDigits: 0 })} km`
                            : ''
                        }`
                      : '—',
                  },
                  {
                    key: 'fullTank',
                    label: t('fuelHistory.detail.fullTank', 'Depo Dolumu'),
                    value: entry.isFullTank
                      ? t('common.yes', 'Evet')
                      : t('common.no', 'Hayır'),
                  },
                  {
                    key: 'receipt',
                    label: t('fuelHistory.col.receipt', 'Fiş'),
                    value: entry.hasReceipt
                      ? t('fuelHistory.detail.receiptAvailable', 'Mevcut')
                      : '—',
                  },
                  {
                    key: 'created',
                    label: t('fuelHistory.detail.createdAt', 'Kayıt Tarihi'),
                    value: dateTimeFormat.format(new Date(entry.createdAt)),
                  },
                ].map((row) => (
                  <div key={row.key} className="grid grid-cols-2 gap-4 px-4 py-2.5">
                    <dt className="text-[13px] text-slate-500">{row.label}</dt>
                    <dd className="text-[13px] text-slate-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className={FLEET_LIST_CARD}>
              <CardContent className="divide-y divide-slate-100 p-0">
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500">{t('fuelHistory.col.volume', 'Hacim')}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {entry.liters.toLocaleString(locale, { maximumFractionDigits: 3 })}
                    <span className="ml-1 text-xs font-normal text-slate-500">L</span>
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500">
                    {t('fuelHistory.detail.pricePerLiter', 'Litre Fiyatı')}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {pricePerLiter != null ? currency.format(pricePerLiter) : '—'}
                    <span className="ml-1 text-xs font-normal text-slate-500">/ L</span>
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500">{t('fuelHistory.col.total', 'Toplam')}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {currency.format(entry.totalCost)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500">
                    {t('fuelHistory.detail.usage', 'Kullanım (önceki girişten)')}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {usageKm != null
                      ? `${usageKm.toLocaleString(locale, { maximumFractionDigits: 0 })} km`
                      : '—'}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500">
                    {t('fuelHistory.detail.consumption', 'Tüketim')}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {consumptionPer100 != null ? consumptionPer100.toFixed(1) : '—'}
                    <span className="ml-1 text-xs font-normal text-slate-500">L/100 km</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
