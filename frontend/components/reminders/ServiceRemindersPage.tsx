'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Filter,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ServiceReminderDetailDrawer } from '@/components/reminders/ServiceReminderDetailDrawer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { remindersApi, serviceRecordsApi, vehiclesApi } from '@/lib/api';
import { fetchActiveReminders, formatRelativeDueDate } from '@/lib/reminder-utils';
import {
  buildServiceReminderRows,
  COMMON_SERVICE_TASKS,
  filterServiceReminderRows,
  matchesServiceTaskFilter,
  serviceReminderCounts,
  type ServiceReminderRow,
  type ServiceReminderTab,
} from '@/lib/service-reminders';
import type { Vehicle } from '@/lib/types';
import { vehicleAbbreviation } from '@/lib/timeline-utils';
import {
  FLEET_LINK_ACTION,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TH,
  FLEET_RAW_TH_CHECKBOX,
  FLEET_RAW_THEAD,
} from '@/lib/fleet-table';
import { cn, formatDate } from '@/lib/utils';

const PAGE_SIZE = 50;
const WATCHLIST_KEY = 'fleet:service-reminder-watchlist';

function readWatchlist(): Set<string> {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeWatchlist(ids: Set<string>) {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-9 appearance-none rounded-full border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {options.map((option) => (
          <option key={option.value || '__all__'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function vehicleStatusDot(status: ServiceReminderRow['vehicleStatus']) {
  if (status === 'active') return 'bg-blue-500';
  if (status === 'maintenance') return 'bg-orange-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
}

function statusLabel(status: ServiceReminderRow['status'], t: (key: string) => string) {
  if (status === 'due_soon') return t('serviceReminders.statusDueSoon');
  if (status === 'overdue') return t('serviceReminders.statusOverdue');
  if (status === 'snoozed') return t('serviceReminders.statusSnoozed');
  return t('serviceReminders.statusScheduled');
}

function statusClass(status: ServiceReminderRow['status']) {
  if (status === 'overdue') return 'text-red-700';
  if (status === 'due_soon') return 'text-orange-600';
  if (status === 'snoozed') return 'text-slate-600';
  return 'text-slate-700';
}

export function ServiceRemindersPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as ServiceReminderTab | null) ?? 'due_soon';
  const [tab, setTab] = useState<ServiceReminderTab>(
    ['all', 'due_soon', 'overdue', 'snoozed'].includes(initialTab) ? initialTab : 'due_soon',
  );
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rows, setRows] = useState<ServiceReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState(searchParams.get('vehicle_id') ?? '');
  const [taskFilter, setTaskFilter] = useState(searchParams.get('task') ?? '');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<ServiceReminderRow | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setWatchlist(readWatchlist());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehiclePage, serviceRecords, rawReminders] = await Promise.all([
        vehiclesApi.list({ limit: 200 }),
        serviceRecordsApi.list(),
        fetchActiveReminders(),
      ]);
      setVehicles(vehiclePage.data);
      setRows(
        buildServiceReminderRows(
          vehiclePage.data,
          serviceRecords,
          rawReminders as unknown as Record<string, unknown>[],
          i18n.language,
        ),
      );
    } catch (e) {
      setVehicles([]);
      setRows([]);
      setError(e instanceof Error ? e.message : t('serviceReminders.loadError'));
    } finally {
      setLoading(false);
    }
  }, [i18n.language, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [tab, search, vehicleFilter, taskFilter]);

  useEffect(() => {
    setSelectedRow((current) => {
      if (!current) return null;
      return rows.find((row) => row.id === current.id) ?? null;
    });
  }, [rows]);

  const counts = useMemo(() => serviceReminderCounts(rows), [rows]);

  const vehicleOptions = useMemo(
    () =>
      [...vehicles]
        .sort((a, b) => a.plate_number.localeCompare(b.plate_number))
        .map((vehicle) => ({ id: vehicle.id, plate: vehicle.plate_number })),
    [vehicles],
  );

  const filteredRows = useMemo(() => {
    let list = filterServiceReminderRows(rows, tab);
    const needle = search.trim().toLowerCase();
    if (vehicleFilter) list = list.filter((row) => row.vehicleId === vehicleFilter);
    if (taskFilter) list = list.filter((row) => matchesServiceTaskFilter(row.serviceTask, taskFilter));
    if (needle) {
      list = list.filter((row) =>
        `${row.vehiclePlate} ${row.serviceTask} ${row.intervalLabel}`.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, tab, search, vehicleFilter, taskFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filteredRows.length, (page + 1) * PAGE_SIZE);

  async function handleResolve(row: ServiceReminderRow) {
    if (!row.reminderId) return;
    try {
      await remindersApi.resolve(row.reminderId);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('reminders.resolveError'));
    }
  }

  function toggleWatch(rowId: string) {
    setWatchlist((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      writeWatchlist(next);
      return next;
    });
  }

  const tabs: Array<{ id: ServiceReminderTab; count: number; tone?: 'orange' | 'red' | 'slate' }> = [
    { id: 'all', count: counts.all },
    { id: 'due_soon', count: counts.dueSoon, tone: 'orange' },
    { id: 'overdue', count: counts.overdue, tone: 'red' },
    { id: 'snoozed', count: counts.snoozed, tone: 'slate' },
  ];

  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('serviceReminders.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
            <Sparkles className="h-4 w-4" />
            {t('serviceReminders.enableForecasting')}
          </button>
          <Button type="button" variant="outline" size="icon" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => router.push('/service-history')}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('serviceReminders.addReminder')}
          </Button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
              tab === item.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t(`serviceReminders.tab.${item.id}`)}
            <span
              className={cn(
                'ml-1',
                item.tone === 'orange' && 'text-orange-600',
                item.tone === 'red' && 'text-red-600',
                item.tone === 'slate' && 'text-slate-500',
              )}
            >
              ({item.count})
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('serviceReminders.searchPlaceholder')}
              className="h-9 pl-9"
            />
          </div>
          <FilterPill
            label={t('serviceReminders.filterVehicle')}
            value={vehicleFilter}
            onChange={setVehicleFilter}
            options={[
              { value: '', label: t('serviceReminders.filterVehicle') },
              ...vehicleOptions.map((vehicle) => ({ value: vehicle.id, label: vehicle.plate })),
            ]}
          />
          <FilterPill
            label={t('serviceReminders.filterTask')}
            value={taskFilter}
            onChange={setTaskFilter}
            options={[
              { value: '', label: t('serviceReminders.filterTask') },
              ...COMMON_SERVICE_TASKS.map((task) => ({ value: task, label: task })),
            ]}
          />
          <div className="relative">
            <select
              value=""
              disabled
              aria-label={t('expenseHistory.filterWatcher')}
              className="h-9 cursor-not-allowed appearance-none rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-sm text-slate-400"
            >
              <option value="">{t('expenseHistory.filterWatcher')}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          </div>
          <Button type="button" variant="outline" className="h-9 rounded-full px-3 text-sm">
            <Filter className="mr-1.5 h-4 w-4" />
            {t('expenseHistory.filters')}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>
            {t('expenseHistory.pagination', {
              from: rangeStart,
              to: rangeEnd,
              total: filteredRows.length,
            })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="hidden text-slate-500 sm:inline">{t('serviceReminders.groupNone')}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={t('expenseHistory.tableSettings')}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('serviceReminders.statOverdueVehicles')} value={String(counts.overdueVehicles)} />
        <StatCard label={t('serviceReminders.statDueSoonVehicles')} value={String(counts.dueSoonVehicles)} tone="orange" />
        <StatCard label={t('serviceReminders.statSnoozedVehicles')} value={String(counts.snoozedVehicles)} />
        <StatCard
          label={t('serviceReminders.statCompliance')}
          value={t('serviceReminders.complianceValue', { value: counts.averageCompliance })}
          tone="blue"
        />
      </div>

      <div className="flex min-h-[420px] overflow-hidden rounded-b-xl bg-white">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : error ? (
            <div className="p-6">
              <EmptyState
                icon={Wrench}
                title={t('serviceReminders.loadError')}
                subtitle={error}
                actionLabel={t('reminders.retry')}
                onAction={() => void load()}
              />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wrench}
                title={t('serviceReminders.emptyTitle')}
                subtitle={t('serviceReminders.emptySubtitle')}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={FLEET_RAW_TABLE}>
                <thead className={FLEET_RAW_THEAD}>
                  <tr>
                    <th className={FLEET_RAW_TH_CHECKBOX}>
                      <input type="checkbox" aria-label={t('expenseHistory.selectAll')} />
                    </th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colVehicle')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colServiceTask')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colStatus')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colNextDue')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colWorkOrder')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colLastCompleted')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colCompliance')}</th>
                    <th className={FLEET_RAW_TH}>{t('expenseHistory.colWatchers')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colAssignee')}</th>
                    <th className={FLEET_RAW_TH}>{t('serviceReminders.colAssignedAt')}</th>
                  </tr>
                </thead>
                <tbody className={FLEET_RAW_TBODY}>
                  {pageRows.map((row) => {
                    const badge = vehicleAbbreviation(row.vehicleBrand, row.vehicleModel, row.vehiclePlate);
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'cursor-pointer hover:bg-slate-50/80',
                          isSelected && 'bg-blue-50/60',
                        )}
                        onClick={() => setSelectedRow(row)}
                      >
                        <td className={FLEET_RAW_TD} onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() =>
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className={FLEET_RAW_TD}>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded bg-slate-100 px-1.5 text-[10px] font-bold uppercase text-slate-600">
                              {badge}
                            </span>
                            <span className={cn('inline-block h-2 w-2 rounded-full', vehicleStatusDot(row.vehicleStatus))} />
                            <span className="font-semibold text-blue-700">{row.vehiclePlate}</span>
                          </div>
                        </td>
                        <td className={FLEET_RAW_TD}>
                          <span className="font-medium text-blue-700">{row.serviceTask}</span>
                          <p className="mt-0.5 text-[11px] text-slate-500">{row.intervalLabel}</p>
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'font-medium', statusClass(row.status))}>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                row.status === 'overdue' && 'bg-red-500',
                                row.status === 'due_soon' && 'bg-orange-500',
                                row.status === 'snoozed' && 'bg-slate-400',
                                row.status === 'scheduled' && 'bg-blue-500',
                              )}
                            />
                            {statusLabel(row.status, t)}
                          </span>
                        </td>
                        <td className={cn(FLEET_RAW_TD, statusClass(row.status))}>
                          <div>{formatRelativeDueDate(row.nextDueDate, i18n.language)}</div>
                          {row.remainingKm != null ? (
                            <div className="text-xs">
                              {t('serviceReminders.detail.remainingKm', {
                                value: row.remainingKm.toLocaleString(i18n.language),
                              })}
                            </div>
                          ) : (
                            <div className="text-xs">{formatDate(row.nextDueDate)}</div>
                          )}
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'text-slate-400')}>—</td>
                        <td className={FLEET_RAW_TD}>
                          {row.lastCompletedDate ? (
                            <>
                              <div>{formatDate(row.lastCompletedDate)}</div>
                              {row.lastCompletedMileage != null ? (
                                <div className="text-xs text-slate-500">
                                  {row.lastCompletedMileage.toLocaleString(i18n.language)} km
                                </div>
                              ) : null}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'font-medium')}>{row.compliancePercent}%</td>
                        <td className={cn(FLEET_RAW_TD, 'text-slate-400')}>—</td>
                        <td className={FLEET_RAW_TD} onClick={(event) => event.stopPropagation()}>
                          {row.reminderId ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleResolve(row)}>
                              {t('reminders.resolve')}
                            </Button>
                          ) : (
                            <Link
                              href={`/service-history?vehicle_id=${row.vehicleId}`}
                              className={FLEET_LINK_ACTION}
                            >
                              {t('serviceReminders.logService')}
                            </Link>
                          )}
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'text-slate-400')}>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedRow ? (
          <ServiceReminderDetailDrawer
            row={selectedRow}
            watched={watchlist.has(selectedRow.id)}
            onClose={() => setSelectedRow(null)}
            onToggleWatch={() => toggleWatch(selectedRow.id)}
            onResolve={() => void handleResolve(selectedRow)}
          />
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'orange' | 'blue';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold text-slate-900',
          tone === 'orange' && 'text-orange-600',
          tone === 'blue' && 'text-blue-600',
        )}
      >
        {value}
      </p>
    </div>
  );
}
