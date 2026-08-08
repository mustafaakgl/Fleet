'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MapPinned, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CardGridSkeleton,
  ChartSkeleton,
} from '@/components/loading/page-skeletons';
import type { ConnectionBannerStatus } from '@/components/connection/ConnectionBanner';
import { useRegisterConnection } from '@/components/connection/ConnectionBannerProvider';
import { tachographApi, telematicsApi, trackingApi } from '@/lib/api';
import { connectionBackoffDelay } from '@/lib/connection-backoff';
import { isInitialLoad } from '@/lib/is-initial-load';
import { usePageTitle } from '@/lib/use-page-title';
import { openSseStream } from '@/lib/sse-stream';
import type { LiveTrackingItem, LiveTrackingTrailPoint, TachographRemainingDriver, TelematicsVehicleHealthItem } from '@/lib/types';
import { LiveTrackingDetail } from './LiveTrackingDetail';
import { LocationSourceBadge } from './LocationSourceBadge';
import { LiveTrackingSidebar } from './LiveTrackingSidebar';
import { filterBySource, filterByStatus, isAlarmItem, type SourceFilter, type LiveTrackingStateFilter } from './tracking-utils';

const LiveTrackingMap = dynamic(
  () => import('./LiveTrackingMap').then((module) => module.LiveTrackingMap),
  {
    ssr: false,
    loading: () => <ChartSkeleton heightClass="min-h-[520px]" />,
  },
);

const STALE_AFTER_SEC = 300;

export function LiveTrackingPage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.liveTracking'));
  const searchParams = useSearchParams();
  const [items, setItems] = useState<LiveTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LiveTrackingStateFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [includeOffline, setIncludeOffline] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [trailPoints, setTrailPoints] = useState<LiveTrackingTrailPoint[]>([]);
  const [followMode, setFollowMode] = useState(false);
  const [selectedRemaining, setSelectedRemaining] = useState<TachographRemainingDriver | null>(null);
  const [selectedVehicleHealth, setSelectedVehicleHealth] = useState<TelematicsVehicleHealthItem | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [fitBoundsRequestId, setFitBoundsRequestId] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionBannerStatus>('reconnecting');
  const retryAttemptRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  useRegisterConnection('live-tracking', connectionStatus, lastFetchedAt);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const driverId = searchParams.get('driver');
    if (driverId) setSelectedDriverId(driverId);
  }, [searchParams]);

  const fetchLiveTracking = useCallback(
    async (options?: { manual?: boolean; fitMap?: boolean; initial?: boolean }) => {
      if (options?.manual) setRefreshing(true);
      else if (options?.initial && !hasLoadedOnceRef.current) setLoading(true);

      try {
        const data = await trackingApi.getLive({
          staleAfterSec: STALE_AFTER_SEC,
          includeOffline,
          search: debouncedSearch || undefined,
        });
        setItems(data);
        setLastFetchedAt(new Date());
        hasLoadedOnceRef.current = true;
        setConnectionStatus('connected');
        setError(null);
        if (options?.fitMap) setFitBoundsRequestId((current) => current + 1);
      } catch (fetchError) {
        if (!hasLoadedOnceRef.current) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load live tracking');
        } else {
          setConnectionStatus('disconnected');
        }
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
    let cancelled = false;
    let stopStream: (() => void) | null = null;
    let retryTimer: number | null = null;

    const params = new URLSearchParams({
      staleAfterSec: String(STALE_AFTER_SEC),
      includeOffline: String(includeOffline),
    });
    if (debouncedSearch) params.set('search', debouncedSearch);

    const streamUrl = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'}/tracking/live/stream?${params.toString()}`;

    const connect = () => {
      if (cancelled) return;
      setConnectionStatus((current) => (current === 'connected' ? current : 'reconnecting'));

      stopStream?.();
      stopStream = openSseStream<LiveTrackingItem[]>(streamUrl, {
        onMessage: (payload) => {
          retryAttemptRef.current = 0;
          setItems(payload);
          setLastFetchedAt(new Date());
          hasLoadedOnceRef.current = true;
          setLoading(false);
          setRefreshing(false);
          setError(null);
          setConnectionStatus('connected');
        },
        onError: () => {
          setConnectionStatus('disconnected');
          stopStream?.();
          stopStream = null;
          void fetchLiveTracking();
          const delay = connectionBackoffDelay(retryAttemptRef.current);
          retryAttemptRef.current += 1;
          retryTimer = window.setTimeout(connect, delay);
        },
      });
    };

    connect();

    const onVisibilityChange = () => {
      if (!document.hidden) void fetchLiveTracking();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      stopStream?.();
      if (retryTimer != null) window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [debouncedSearch, fetchLiveTracking, includeOffline]);

  useEffect(() => {
    if (items.length === 0) {
      if (selectedDriverId !== null) {
        setSelectedDriverId(null);
      }
      return;
    }

    if (!selectedDriverId || !items.some((item) => item.driverId === selectedDriverId)) {
      setSelectedDriverId(items[0]?.driverId ?? null);
    }
  }, [items, selectedDriverId]);

  const filteredItems = useMemo(
    () => filterByStatus(filterBySource(items, sourceFilter), statusFilter),
    [items, sourceFilter, statusFilter],
  );

  const sourceFilteredItems = useMemo(() => filterBySource(items, sourceFilter), [items, sourceFilter]);
  const selectedItem = items.find((item) => item.driverId === selectedDriverId) ?? null;
  const idleWatchItems = useMemo(
    () =>
      sourceFilteredItems
        .filter(
          (item) =>
            item.motionState === 'idle'
            && item.idleSinceMs != null
            && Date.now() - item.idleSinceMs >= 10 * 60 * 1000,
        )
        .sort((a, b) => (a.idleSinceMs ?? 0) - (b.idleSinceMs ?? 0)),
    [sourceFilteredItems],
  );

  const statusCounters = useMemo(
    () => ({
      moving: sourceFilteredItems.filter((item) => item.motionState === 'moving').length,
      idle: sourceFilteredItems.filter((item) => item.motionState === 'idle').length,
      stopped: sourceFilteredItems.filter((item) => item.motionState === 'stopped').length,
      alarm: sourceFilteredItems.filter((item) => isAlarmItem(item)).length,
      offline: sourceFilteredItems.filter((item) => item.motionState === 'offline').length,
    }),
    [sourceFilteredItems],
  );

  useEffect(() => {
    if (!selectedDriverId) {
      setTrailPoints([]);
      setSelectedRemaining(null);
      setSelectedVehicleHealth(null);
      return;
    }

    setTrailPoints([]);
    void (async () => {
      try {
        const [trail, remaining, health] = await Promise.all([
          trackingApi.getTrail(selectedDriverId, 30),
          tachographApi.getRemaining({ driverId: selectedDriverId }),
          telematicsApi.getVehicleHealth(),
        ]);
        setTrailPoints(trail.points);
        setSelectedRemaining(remaining.drivers.find((driver) => driver.driverId === selectedDriverId) ?? null);

        const selectedVehicleId = items.find((item) => item.driverId === selectedDriverId)?.vehicleId;
        setSelectedVehicleHealth(health.items.find((item) => item.vehicleId === selectedVehicleId) ?? null);
      } catch {
        setTrailPoints([]);
      }
    })();
  }, [items, selectedDriverId]);

  const mappableCount = filteredItems.filter(
    (item) => item.latitude !== null && item.longitude !== null,
  ).length;

  const showInitialSkeleton = isInitialLoad(loading, items.length > 0);

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <MapPinned className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.liveTracking')}</h1>
            <p className="text-sm text-slate-500">
              {lastFetchedAt
                ? t('liveTracking.lastUpdated', {
                    time: new Intl.DateTimeFormat(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(lastFetchedAt),
                  })
                : t('liveTracking.waitingForUpdate')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LocationSourceBadge source="mobile" />
              <span className="text-xs text-slate-500">{t('liveTracking.legend.mobile')}</span>
              <LocationSourceBadge source="telematics" />
              <span className="text-xs text-slate-500">{t('liveTracking.legend.telematics')}</span>
            </div>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={() => void fetchLiveTracking({ manual: true, fitMap: true })} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('errors.retry')}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {showInitialSkeleton ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
          <CardGridSkeleton count={4} className="grid-cols-1" />
          <ChartSkeleton heightClass="min-h-[380px]" />
          <CardGridSkeleton count={3} className="grid-cols-1" />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title={t('liveTracking.emptyTitle')}
          subtitle={
            includeOffline ? t('liveTracking.emptyFiltered') : t('liveTracking.emptyNoLocations')
          }
          actionLabel={t('errors.retry')}
          onAction={() => void fetchLiveTracking({ manual: true, fitMap: true })}
        />
      ) : (
        <>
          <div className="hidden flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 md:flex lg:order-none" data-testid="live-status-strip">
            {(
              [
                { value: 'moving', color: 'bg-emerald-500', label: t('liveTracking.motion.moving'), count: statusCounters.moving },
                { value: 'idle', color: 'bg-amber-500', label: t('liveTracking.motion.idle'), count: statusCounters.idle },
                { value: 'stopped', color: 'bg-slate-400', label: t('liveTracking.motion.stopped'), count: statusCounters.stopped },
                { value: 'alarm', color: 'bg-red-600', label: t('liveTracking.motion.alarm'), count: statusCounters.alarm },
                { value: 'offline', color: 'bg-slate-600', label: t('liveTracking.motion.offline'), count: statusCounters.offline },
              ] as const
            ).map((chip) => {
              const isActive = statusFilter === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  disabled={chip.count === 0}
                  onClick={() => setStatusFilter((current) => (current === chip.value ? 'all' : chip.value))}
                  data-testid={`live-status-chip-${chip.value}`}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${isActive ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'} ${chip.count === 0 ? 'cursor-not-allowed opacity-50' : 'hover:border-slate-300'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${chip.color}`} />
                  <span>{chip.label}</span>
                  <span className="tabular-nums">{chip.count}</span>
                </button>
              );
            })}
          </div>

          <div className="order-1 grid min-h-0 flex-1 gap-4 -mx-4 sm:-mx-7 lg:order-none lg:mx-0 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
          <LiveTrackingSidebar
            items={filteredItems}
            idleWatchItems={idleWatchItems}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            includeOffline={includeOffline}
            onIncludeOfflineChange={setIncludeOffline}
            selectedDriverId={selectedDriverId}
            onSelect={(item) => setSelectedDriverId(item.driverId)}
            lastFetchedAt={lastFetchedAt}
            className="order-2 lg:order-none"
          />

          <div className="order-first min-h-0 lg:order-none">
            {mappableCount === 0 ? (
              <div className="flex h-[380px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
                {t('liveTracking.noCoordinates')}
              </div>
            ) : (
              <LiveTrackingMap
                items={filteredItems}
                trailPoints={trailPoints}
                selectedDriverId={selectedDriverId}
                onSelect={(item) => setSelectedDriverId(item.driverId)}
                followMode={followMode}
                onFollowModeChange={setFollowMode}
                fitBoundsRequestId={fitBoundsRequestId}
              />
            )}
          </div>

            <div className="order-3 min-h-0 overflow-y-auto lg:order-none">
              <LiveTrackingDetail
                item={selectedItem}
                remaining={selectedRemaining}
                vehicleHealth={selectedVehicleHealth}
                followMode={followMode}
                onFollowModeChange={setFollowMode}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
