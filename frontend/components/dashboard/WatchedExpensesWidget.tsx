'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, ChevronRight, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useExpenseWatchlist } from '@/hooks/useExpenseWatchlist';
import { serviceRecordsApi } from '@/lib/api';
import type { ServiceRecord } from '@/lib/types';

function formatAmount(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function WatchedExpensesWidget() {
  const { t, i18n } = useTranslation();
  const { watchedIds } = useExpenseWatchlist();
  const [entries, setEntries] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (watchedIds.length === 0) {
      setEntries([]);
      return;
    }

    let active = true;
    setLoading(true);
    Promise.all(
      watchedIds.slice(0, 8).map((id) =>
        serviceRecordsApi.getById(id).catch(() => null),
      ),
    )
      .then((rows) => {
        if (!active) return;
        setEntries(rows.filter((row): row is ServiceRecord => row !== null));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [watchedIds]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{t('dashboard.watchedExpenses.title')}</h2>
        {watchedIds.length > 0 ? (
          <Link
            href="/service-history?watched=1"
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
          >
            {t('dashboard.watchedExpenses.viewAll')}
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <Card className="rounded-lg border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bell className="h-4 w-4 text-emerald-600" />
            {t('dashboard.watchedExpenses.subtitle', { count: watchedIds.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : watchedIds.length === 0 ? (
            <p className="text-sm text-slate-500">{t('dashboard.watchedExpenses.empty')}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500">{t('dashboard.watchedExpenses.unavailable')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/service-history/${entry.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {entry.vehicle_plate} · {entry.service_type}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(entry.date, i18n.language)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-slate-700">
                      {formatAmount(entry.cost_amount, i18n.language)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {watchedIds.length > 0 ? (
            <Link
              href="/service-history?watched=1"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline"
            >
              <Wallet className="h-4 w-4" />
              {t('expenseHistory.title')}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
