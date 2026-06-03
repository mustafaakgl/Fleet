'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MapPinned, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { trackingApi } from '@/lib/api';
import type { LiveTrackingItem } from '@/lib/types';
import { LiveTrackingSidebar } from './LiveTrackingSidebar';
import { filterByStatus, type StatusFilter } from './tracking-utils';

const LiveTrackingMap = dynamic(
  () => import('./LiveTrackingMap').then((module) => module.LiveTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading map...
      </div>
    ),
  },
);

const VISIBLE_POLL_MS = 15_000;
const HIDDEN_POLL_MS = 60_000;
const STALE_AFTER_SEC = 300;

export function LiveTrackingPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<LiveTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [includeOffline, setIncludeOffline] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [fitBoundsRequestId, setFitBoundsRequestId] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const driverId = searchParams.get('driver');
    if (driverId) {
      setSelectedDriverId(driverId);
    }
  }, [searchParams]);

  const fetchLiveTracking = useCallback(
    async (options?: { manual?: boolean; fitMap?: boolean; initial?: boolean }) => {
      if (options?.manual) {
        setRefreshing(true);
      } else if (options?.initial) {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await trackingApi.getLive({
          staleAfterSec: STALE_AFTER_SEC,
          includeOffline,
          search: debouncedSearch || undefined,
        });
        setItems(data);
        setLastFetchedAt(new Date());
        if (options?.fitMap) {
          setFitBoundsRequestId((current) => current + 1);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load live tracking');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, includeOffline],
  );

  useEffect(() => {
    void fetchLiveTracking({ initial: true, fitMap: true });
  }, [debouncedSearch, includeOffline, fetchLiveTracking]);

  useEffect(() => {
    let intervalId: number | undefined;

    const schedulePoll = () => {
      window.clearInterval(intervalId);
      const delay = document.hidden ? HIDDEN_POLL_MS : VISIBLE_POLL_MS;
      intervalId = window.setInterval(() => {
        void fetchLiveTracking();
      }, delay);
    };

    schedulePoll();

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void fetchLiveTracking();
      }
      schedulePoll();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchLiveTracking]);

  const filteredItems = useMemo(
    () => filterByStatus(items, statusFilter),
    [items, statusFilter],
  );

  const mappableCount = filteredItems.filter(
    (item) => item.latitude !== null && item.longitude !== null,
  ).length;

  const handleSelect = (item: LiveTrackingItem) => {
    setSelectedDriverId(item.driverId);
  };

  const handleManualRefresh = () => {
    void fetchLiveTracking({ manual: true, fitMap: true });
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <MapPinned className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('nav.liveTracking')}</h1>
            <p className="text-sm text-slate-500">
              {lastFetchedAt
                ? `Updated ${new Intl.DateTimeFormat(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }).format(lastFetchedAt)}`
                : 'Waiting for first update...'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleManualRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Loading live tracking...
          </div>
          <div className="min-h-[520px] rounded-lg border border-slate-200 bg-slate-50" />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title="No live locations"
          subtitle={
            includeOffline
              ? 'No drivers match your filters. Try adjusting search or status filters.'
              : 'No drivers are currently reporting location. Enable "Include offline drivers" or wait for mobile updates.'
          }
          actionLabel="Refresh"
          onAction={handleManualRefresh}
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <LiveTrackingSidebar
            items={filteredItems}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            includeOffline={includeOffline}
            onIncludeOfflineChange={setIncludeOffline}
            selectedDriverId={selectedDriverId}
            onSelect={handleSelect}
            lastFetchedAt={lastFetchedAt}
          />

          <div className="min-h-0">
            {mappableCount === 0 ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
                Drivers are listed on the left, but none have GPS coordinates yet.
              </div>
            ) : (
              <LiveTrackingMap
                items={filteredItems}
                selectedDriverId={selectedDriverId}
                onSelect={handleSelect}
                fitBoundsRequestId={fitBoundsRequestId}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
