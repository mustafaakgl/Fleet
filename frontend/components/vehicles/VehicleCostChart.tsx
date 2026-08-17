'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vehiclesApi } from '@/lib/api';
import { formatFleetDateTime } from '@/lib/locale-format';

/**
 * Para bicimi ARTIK SABIT DEGIL (Faz 8).
 *
 * Onceki hali `de-DE` + `EUR` sabitliyordu; TRY bir kiracida her tutar yanlis
 * sembolle ve yanlis ayraclarla gorunurdu. Locale kullanicinin dilinden, para
 * birimi ise verinin kendisinden geliyor.
 */
function formatAmount(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

const COLORS = {
  fuel: '#2563eb',
  service: '#64748b',
  fine: '#dc2626',
} as const;

export function VehicleCostChart({
  vehicleId,
  /**
   * Kiracinin temel para birimi. Varsayilan EUR yalnizca cagiran taraf henuz
   * gecirmiyorsa; sabit sembol DEGIL, gecirilebilir bir varsayilan.
   */
  currency = 'EUR',
}: {
  vehicleId: string;
  currency?: string;
}) {
  const { t, i18n } = useTranslation();
  const costsQuery = useQuery({
    queryKey: ['vehicle-costs', vehicleId],
    queryFn: () => vehiclesApi.getCosts(vehicleId, { months: 6 }),
    staleTime: 60_000,
  });

  const chartData = useMemo(() => {
    return (costsQuery.data?.months ?? []).map((month) => ({
      month: formatFleetDateTime(month.monthStart).slice(0, 7),
      fuelEur: month.fuelEur,
      serviceEur: month.serviceEur,
      fineEur: month.fineEur,
    }));
  }, [costsQuery.data?.months]);

  const serviceUnavailable = costsQuery.data?.serviceCostUnavailable ?? false;

  return (
    <Card data-testid="vehicle-cost-chart">
      <CardHeader>
        <CardTitle>{t('vehicleDetail.costsTitle')}</CardTitle>
        {costsQuery.data ? (
          <p className="text-sm text-slate-600">
            {t('vehicleDetail.costsSummary', {
              total: formatAmount(costsQuery.data.totalEur, currency, i18n.language),
              average: formatAmount(costsQuery.data.monthlyAverageEur, currency, i18n.language),
            })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {costsQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : costsQuery.isError ? (
          <p className="text-sm text-slate-500">{t('vehicleDetail.costsLoadError')}</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-slate-500">{t('vehicleDetail.costsEmpty')}</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    width={48}
                    tickFormatter={(value) => formatAmount(value, currency, i18n.language).replace(/\s/g, '')}
                  />
                  <Tooltip formatter={(value: number) => formatAmount(value, currency, i18n.language)} />
                  <Legend />
                  <Bar dataKey="fuelEur" stackId="costs" fill={COLORS.fuel} name={t('vehicleDetail.costsFuel')} />
                  {!serviceUnavailable ? (
                    <Bar
                      dataKey="serviceEur"
                      stackId="costs"
                      fill={COLORS.service}
                      name={t('vehicleDetail.costsService')}
                    />
                  ) : null}
                  <Bar dataKey="fineEur" stackId="costs" fill={COLORS.fine} name={t('vehicleDetail.costsFine')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {serviceUnavailable ? (
              <p className="mt-2 text-xs text-slate-500" data-testid="vehicle-cost-service-unavailable">
                {t('vehicleDetail.costsServiceUnavailable')}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
