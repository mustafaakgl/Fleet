'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, WifiOff, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { getUser } from '@/lib/auth';
import { EvidenceLine } from '@/components/tachograph/EvidenceLine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { driversApi, getApiErrorMessage, tachographApi } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_SIDE_DRAWER,
  FLEET_SIDE_DRAWER_OVERLAY,
} from '@/lib/fleet-table';
import { formatFleetDateTime } from '@/lib/locale-format';
import { canViewFinancials } from '@/lib/permissions';
import type { TachographInfringementDetail, TachographInfringementItem } from '@/lib/types';
import {
  INFRINGEMENT_TYPES,
  infringementTypeLabelKey,
} from '@/lib/tachograph-infringement-meta';
import {
  computeRepeatCounts,
  getRepeatCount,
  infringementAgeDays,
} from '@/lib/tachograph-repeat';
import { cn } from '@/lib/utils';
import { isInitialLoad } from '@/lib/is-initial-load';
import { usePageTitle } from '@/lib/use-page-title';
import { ChartSkeleton, KpiRowSkeleton, MatrixSkeleton } from '@/components/loading/page-skeletons';

type QueueTab = 'open' | 'closed';

function severityDotClass(severity: string): string {
  return severity === 'critical' ? 'bg-red-600' : 'bg-amber-500';
}

function ActivityTimelineBar({
  detail,
  t,
}: {
  detail: TachographInfringementDetail;
  t: (key: string) => string;
}) {
  const dayStart = new Date(detail.occurredAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayMs = 24 * 3600 * 1000;

  const segments = detail.activityTimeline.map((segment) => {
    const startMs = new Date(segment.startedAt).getTime() - dayStart.getTime();
    const endMs = new Date(segment.endedAt).getTime() - dayStart.getTime();
    return {
      ...segment,
      leftPct: Math.max(0, (startMs / dayMs) * 100),
      widthPct: Math.max(0.5, ((endMs - startMs) / dayMs) * 100),
    };
  });

  const windowStartPct = ((detail.infringementWindow.startMs - dayStart.getTime()) / dayMs) * 100;
  const windowWidthPct =
    ((detail.infringementWindow.endMs - detail.infringementWindow.startMs) / dayMs) * 100;

  function segmentClass(state: string): string {
    if (state === 'driving') return 'bg-blue-600';
    if (state === 'rest') return 'bg-emerald-500';
    if (state === 'work') return 'bg-slate-400';
    return 'bg-slate-300';
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {t('tachograph.infringements.timelineTitle')}
      </p>
      <div className="relative h-8 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className={cn('absolute top-0 h-full', segmentClass(segment.workState))}
            style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
            title={`${segment.workState} ${segment.durationFormatted}`}
          />
        ))}
        <div
          className="pointer-events-none absolute top-0 h-full rounded-sm border-2 border-red-600"
          style={{ left: `${windowStartPct}%`, width: `${Math.max(1, windowWidthPct)}%` }}
        />
      </div>
    </div>
  );
}

function InfringementDetailDrawer({
  infringementId,
  onClose,
  onAcknowledged,
  onPayrollChanged,
  canManagePayroll,
}: {
  infringementId: string;
  onClose: () => void;
  onAcknowledged: () => void;
  onPayrollChanged: () => void;
  canManagePayroll: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [driverContacted, setDriverContacted] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['tachograph', 'infringement', infringementId],
    queryFn: () => tachographApi.getInfringement(infringementId),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () => tachographApi.acknowledgeInfringement(infringementId, note.trim()),
    onSuccess: () => {
      onAcknowledged();
      onClose();
    },
  });

  const payrollMutation = useMutation({
    mutationFn: (nextValue: boolean) => tachographApi.setInfringementPayrollFlag(infringementId, nextValue),
    onSuccess: () => {
      onPayrollChanged();
    },
  });

  const detail = detailQuery.data;
  const canSubmit = note.trim().length >= 10 && driverContacted && detail?.status === 'open';

  return (
    <aside className={cn(FLEET_SIDE_DRAWER, 'h-[calc(100vh-4rem)] lg:h-[calc(100vh-6rem)]')}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{t('tachograph.infringements.reviewTitle')}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {detailQuery.isLoading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}
        {detail ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('inline-block h-2 w-2 rounded-full', severityDotClass(detail.severity))} />
                <p className="text-sm font-medium text-slate-900">{t(detail.typeLabelKey)}</p>
              </div>
              <p className="text-xs text-slate-400">{detail.article}</p>
              <p className="text-sm text-slate-700">
                {detail.driver ? `${detail.driver.firstName} ${detail.driver.lastName}` : '—'}
                {detail.vehicle ? ` · ${detail.vehicle.plateNumber}` : ''}
              </p>
              <p className="text-sm text-slate-600">{formatFleetDateTime(detail.occurredAt)}</p>
            </div>

            <ActivityTimelineBar detail={detail} t={t} />

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('tachograph.infringements.evidenceTitle')}
              </p>
              <EvidenceLine type={detail.type} evidence={detail.evidence} />
            </div>

            {canManagePayroll ? (
              <div className="rounded-md border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={detail.payrollRelevant}
                    disabled={payrollMutation.isPending}
                    onChange={(event) => payrollMutation.mutate(event.target.checked)}
                  />
                  {t('tachograph.infringements.payrollRelevant')}
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  {detail.payrollMarkedBy
                    ? t('tachograph.infringements.payrollMarkedBy', { name: detail.payrollMarkedBy.fullName })
                    : t('tachograph.infringements.payrollNotMarked')}
                </p>
                {payrollMutation.error ? (
                  <p className="mt-2 text-sm text-red-600">
                    {getApiErrorMessage(payrollMutation.error, t('tachograph.infringements.payrollToggleFailed'))}
                  </p>
                ) : null}
              </div>
            ) : null}

            {detail.status === 'open' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="ack-note">{t('tachograph.infringements.noteLabel')}</Label>
                  <textarea
                    id="ack-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={t('tachograph.infringements.notePlaceholder')}
                  />
                  <p className="mt-1 text-xs text-slate-500">{t('tachograph.infringements.noteHint')}</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={driverContacted}
                    onChange={(event) => setDriverContacted(event.target.checked)}
                  />
                  {t('tachograph.infringements.driverContacted')}
                </label>
                {acknowledgeMutation.error ? (
                  <p className="text-sm text-red-600">
                    {getApiErrorMessage(acknowledgeMutation.error, t('tachograph.infringements.acknowledgeFailed'))}
                  </p>
                ) : null}
                <Button
                  type="button"
                  disabled={!canSubmit || acknowledgeMutation.isPending}
                  onClick={() => acknowledgeMutation.mutate()}
                >
                  {t('tachograph.infringements.acknowledgeAndClose')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-emerald-700">{t('tachograph.infringements.alreadyAcknowledged')}</p>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function QueueRow({
  row,
  repeatCount,
  onReview,
  t,
}: {
  row: TachographInfringementItem;
  repeatCount: number;
  onReview: () => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const ageDays = infringementAgeDays(row.occurredAt);
  const ageClass = ageDays >= 3 ? 'text-amber-700' : 'text-slate-500';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', severityDotClass(row.severity))} aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{t(row.typeLabelKey)}</span>
          <span className="text-xs text-slate-400">{row.article}</span>
          {row.acknowledgementSlaOverdue ? (
            <Badge className="border-red-200 bg-red-50 text-[10px] text-red-700">
              {t('tachograph.infringements.slaOverdue')}
            </Badge>
          ) : null}
          {row.payrollRelevant ? (
            <Badge className="border-slate-200 bg-slate-100 text-[10px] text-slate-700">
              {t('tachograph.infringements.payrollRelevantBadge')}
            </Badge>
          ) : null}
          {repeatCount >= 3 ? (
            <Badge
              className="border-red-200 bg-red-50 text-[10px] text-red-700"
              title={t('tachograph.infringements.repeatTooltip')}
            >
              {t('tachograph.infringements.repeatBadge', { count: repeatCount })}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-slate-600">
          {row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : '—'}
          {row.vehicle ? ` · ${row.vehicle.plateNumber}` : ''}
          {row.dddFile?.signatureValid === false ? (
            <span className="ml-1" title={t('tachograph.infringements.unsignedWarning')}>
              ⚠️
            </span>
          ) : null}
        </p>
      </div>

      <span className={cn('shrink-0 text-xs tabular-nums', ageClass)}>
        {ageDays >= 3
          ? t('tachograph.infringements.ageDays', { days: ageDays })
          : t('tachograph.infringements.ageRecent')}
      </span>

      {row.status === 'open' ? (
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onReview}>
          {t('tachograph.infringements.reviewAction')}
        </Button>
      ) : null}
    </div>
  );
}

export default function InfringementsPage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.tachograph.infringements'));
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const currentUser = useMemo(() => getUser(), []);
  const canManagePayroll = currentUser ? canViewFinancials(currentUser.role) : false;

  const [tab, setTab] = useState<QueueTab>((searchParams.get('tab') as QueueTab) || 'open');
  const [driverId, setDriverId] = useState(searchParams.get('driverId') ?? '');
  const [severity, setSeverity] = useState(searchParams.get('severity') ?? '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const nextTab = searchParams.get('tab') as QueueTab | null;
    if (nextTab === 'open' || nextTab === 'closed') setTab(nextTab);
    setDriverId(searchParams.get('driverId') ?? '');
    setTypeFilter(searchParams.get('type') ?? '');
  }, [searchParams]);

  const driversQuery = useQuery({
    queryKey: ['drivers', 'infringement-filter'],
    queryFn: () => driversApi.list({ limit: 200 }),
    staleTime: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ['tachograph', 'infringements', 'queue-all'],
    queryFn: () => tachographApi.listInfringements({ limit: 200 }),
    staleTime: 15_000,
  });

  const allItems = listQuery.data?.items ?? [];
  const repeatCounts = useMemo(
    () =>
      computeRepeatCounts(
        allItems.map((item) => ({ ...item, driverId: item.driver?.id ?? null })),
      ),
    [allItems],
  );

  const openItems = useMemo(
    () => allItems.filter((row) => row.status === 'open'),
    [allItems],
  );
  const closedItems = useMemo(
    () => allItems.filter((row) => row.status === 'acknowledged'),
    [allItems],
  );

  const filteredItems = useMemo(() => {
    const base = tab === 'open' ? openItems : closedItems;
    return base
      .filter((row) => {
        if (driverId && row.driver?.id !== driverId) return false;
        if (severity && row.severity !== severity) return false;
        if (typeFilter && row.type !== typeFilter) return false;
        if (dateFrom && row.occurredAt < dateFrom) return false;
        if (dateTo && row.occurredAt > `${dateTo}T23:59:59`) return false;
        return true;
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [tab, openItems, closedItems, driverId, severity, typeFilter, dateFrom, dateTo]);

  const chartData = useMemo(() => {
    const scoped = tab === 'open' ? openItems : closedItems;
    const byType = new Map<string, { count: number; dominantSeverity: 'medium' | 'critical' }>();
    for (const row of scoped) {
      const existing = byType.get(row.type);
      if (!existing) {
        byType.set(row.type, { count: 1, dominantSeverity: row.severity });
      } else {
        existing.count += 1;
        if (row.severity === 'critical') existing.dominantSeverity = 'critical';
      }
    }
    return Array.from(byType.entries()).map(([type, value]) => ({
      key: t(infringementTypeLabelKey(type)),
      count: value.count,
      fill: value.dominantSeverity === 'critical' ? '#dc2626' : '#f59e0b',
    }));
  }, [openItems, closedItems, tab, t]);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tachograph'] });
  }, [queryClient]);

  const error = listQuery.error
    ? getApiErrorMessage(listQuery.error, t('tachograph.infringements.loadError'))
    : null;
  const showSkeleton = isInitialLoad(listQuery.isLoading, Boolean(listQuery.data));

  const drivers = driversQuery.data?.data ?? [];

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <AlertTriangle className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{t('nav.tachograph.infringements')}</h1>
          <p className="text-sm text-slate-600">{t('tachograph.infringements.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('open')}
          className={cn(
            'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            tab === 'open' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700',
          )}
        >
          {t('tachograph.infringements.tabs.open', { count: openItems.length })}
        </button>
        <button
          type="button"
          onClick={() => setTab('closed')}
          className={cn(
            'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            tab === 'closed' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700',
          )}
        >
          {t('tachograph.infringements.tabs.closed', { count: closedItems.length })}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>{t('tachograph.infringements.filters.driver')}</Label>
          <Select className={FLEET_FILTER_SELECT} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.first_name} {driver.last_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('tachograph.infringements.filters.type')}</Label>
          <Select className={FLEET_FILTER_SELECT} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {INFRINGEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(infringementTypeLabelKey(type))}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('tachograph.infringements.filters.severity')}</Label>
          <div className="flex gap-1">
            {(['', 'critical', 'medium'] as const).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setSeverity(value)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium',
                  severity === value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                {value === '' ? t('common.all') : t(`tachograph.severity.${value}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>{t('tachograph.infringements.filters.from')}</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-36" />
        </div>
        <div>
          <Label>{t('tachograph.infringements.filters.to')}</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-36" />
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => void listQuery.refetch()}
        />
      ) : null}

      {!error && showSkeleton ? (
        <div className="space-y-4" data-testid="page-skeleton">
          <KpiRowSkeleton count={4} className="xl:grid-cols-4" />
          <ChartSkeleton />
          <MatrixSkeleton rows={8} columns={8} />
        </div>
      ) : null}

      {!error && !showSkeleton && chartData.length > 0 ? (
        <Card className={FLEET_LIST_CARD}>
          <CardHeader>
            <CardTitle>{t('tachograph.infringements.chartTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {!error && !showSkeleton ? (
        <Card className={FLEET_LIST_CARD}>
          <CardHeader>
            <CardTitle>{t('tachograph.infringements.queueTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredItems.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={AlertTriangle}
                  title={t('tachograph.infringements.emptyTitle')}
                  subtitle={t('tachograph.infringements.emptySubtitle')}
                />
              </div>
            ) : (
              filteredItems.map((row) => (
                <QueueRow
                  key={row.id}
                  row={row}
                  repeatCount={getRepeatCount(repeatCounts, row.driver?.id, row.type)}
                  onReview={() => setSelectedId(row.id)}
                  t={t}
                />
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {selectedId ? (
        <>
          <div className={FLEET_SIDE_DRAWER_OVERLAY} onClick={() => setSelectedId(null)} aria-hidden />
          <InfringementDetailDrawer
            infringementId={selectedId}
            onClose={() => setSelectedId(null)}
            onAcknowledged={() => {
              invalidateAll();
              setTab('closed');
            }}
            onPayrollChanged={invalidateAll}
            canManagePayroll={canManagePayroll}
          />
        </>
      ) : null}
    </div>
  );
}
