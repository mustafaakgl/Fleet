'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { canViewOfficeQueue } from '@/lib/permissions';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/components/ui/page-error';
import {
  fetchOfficeQueueItems,
  filterOfficeQueueByCategory,
  sortOfficeQueueItems,
  type OfficeQueueCategory,
  type OfficeQueueItem,
} from '@/lib/office-queue';

const CATEGORY_KEYS: Array<{ id: OfficeQueueCategory; labelKey: string }> = [
  { id: 'all', labelKey: 'office.queue.filter.all' },
  { id: 'alert', labelKey: 'office.queue.filter.alert' },
  { id: 'transport', labelKey: 'office.queue.filter.transport' },
  { id: 'checkin', labelKey: 'office.queue.filter.checkin' },
  { id: 'handover', labelKey: 'office.queue.filter.handover' },
  { id: 'request', labelKey: 'office.queue.filter.request' },
  { id: 'document', labelKey: 'office.queue.filter.document' },
  { id: 'email', labelKey: 'office.queue.filter.email' },
];

function priorityVariant(priority: OfficeQueueItem['priority']) {
  if (priority === 'critical') return 'destructive' as const;
  if (priority === 'high') return 'default' as const;
  if (priority === 'medium') return 'secondary' as const;
  return 'outline' as const;
}

export function OfficeQueuePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const user = getUser();
    if (!user || !canViewOfficeQueue(user.role)) {
      router.replace('/dashboard');
    }
  }, [router]);
  const categoryParam = (searchParams.get('category') ?? 'all') as OfficeQueueCategory;

  const [items, setItems] = useState<OfficeQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOfficeQueueItems(t);
      setItems(data);
    } catch (e) {
      setError(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => sortOfficeQueueItems(filterOfficeQueueByCategory(items, categoryParam)),
    [categoryParam, items],
  );

  const counts = useMemo(() => {
    const map: Record<OfficeQueueCategory, number> = {
      all: items.length,
      alert: 0,
      transport: 0,
      checkin: 0,
      handover: 0,
      request: 0,
      document: 0,
      email: 0,
    };
    for (const item of items) {
      map[item.category] += 1;
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">{t('office.queue.eyebrow')}</p>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('office.queue.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('office.queue.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('errors.retry')}
        </Button>
      </header>

      {error ? (
        <PageError error={error} titleKey="office.queue.loadFailed" onRetry={() => void load()} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {CATEGORY_KEYS.map(({ id, labelKey }) => (
          <Link
            key={id}
            href={id === 'all' ? '/office/queue' : `/office/queue?category=${id}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              categoryParam === id
                ? 'border-blue-700 bg-blue-700 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t(labelKey)}
            {counts[id] > 0 ? ` (${counts[id]})` : ''}
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <Inbox className="h-10 w-10 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">{t('office.queue.empty')}</p>
          <p className="text-xs text-slate-500">{t('office.queue.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-200 hover:shadow"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={priorityVariant(item.priority)} className="capitalize">
                      {item.priority}
                    </Badge>
                    <Badge variant="outline">{t(`office.queue.category.${item.category}`)}</Badge>
                  </div>
                  <p className="mt-1 font-medium text-slate-900">{item.title}</p>
                  {item.subtitle ? (
                    <p className="mt-0.5 truncate text-sm text-slate-600">{item.subtitle}</p>
                  ) : null}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
