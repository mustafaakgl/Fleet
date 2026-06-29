'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
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
import { VehiclePlateDisplay } from '@/components/vehicles/VehiclePlateDisplay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { remindersApi, serviceRecordsApi, vehiclesApi } from '@/lib/api';
import { BRAND_BTN_PRIMARY } from '@/lib/brand-colors';
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
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
  FLEET_LINK_ACTION,
  FLEET_LIST_CARD,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_SIDE_DRAWER_OVERLAY,
  FLEET_SPLIT_PANEL,
  FLEET_TAB_BAR,
  FLEET_TAB_ITEM,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
  FLEET_TOOLBAR,
} from '@/lib/fleet-table';
import { MobileDataCard, MobileField, MobileFieldGrid } from '@/components/ui/MobileDataCard';
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
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className={cn('min-w-[9rem]', FLEET_FILTER_SELECT, className)}
    >
      {options.map((option) => (
        <option key={option.value || '__all__'} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
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

  const initialTab = (searchParams.get('tab') as ServiceReminderTab | null) ?? 'all';
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
    const reload = () => void load();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
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
    <div className="space-y-4 sm:space-y-6">
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{t('serviceReminders.title')}</h1>
          {!loading && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">{counts.all}</span>
          )}
        </div>
        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-primary hover:underline"
          >
            <Sparkles className="h-4 w-4" />
            {t('serviceReminders.enableForecasting')}
          </button>
          <Button type="button" variant="outline" size="icon" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button type="button" className={cn(BRAND_BTN_PRIMARY, 'w-full sm:w-auto')} onClick={() => router.push('/reminders/service/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('serviceReminders.addReminder')}
          </Button>
        </div>
      </div>

      <Card className={cn(FLEET_LIST_CARD, 'overflow-hidden')}>
        <div className={cn(FLEET_TAB_BAR, 'gap-0 px-4 sm:gap-1 sm:px-5')}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                FLEET_TAB_ITEM,
                'inline-flex items-center gap-2 px-2 sm:px-3',
                tab === item.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <span>{t(`serviceReminders.tab.${item.id}`)}</span>
              <span
                className={cn(
                  'inline-flex min-w-[1.375rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none',
                  tab === item.id
                    ? 'bg-brand-primary text-white'
                    : 'bg-slate-100 text-slate-600',
                  item.tone === 'orange' && tab !== item.id && 'text-orange-600',
                  item.tone === 'red' && tab !== item.id && 'text-red-600',
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className={cn(FLEET_TOOLBAR, 'flex-1')}>
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('serviceReminders.searchPlaceholder')}
                className={cn('pl-9', FLEET_FILTER_INPUT)}
              />
            </div>
            <FilterPill
              label={t('serviceReminders.filterVehicle')}
              value={vehicleFilter}
              onChange={setVehicleFilter}
              className="w-full sm:w-40"
              options={[
                { value: '', label: t('serviceReminders.filterVehicle') },
                ...vehicleOptions.map((vehicle) => ({ value: vehicle.id, label: vehicle.plate })),
              ]}
            />
            <FilterPill
              label={t('serviceReminders.filterTask')}
              value={taskFilter}
              onChange={setTaskFilter}
              className="w-full sm:w-44"
              options={[
                { value: '', label: t('serviceReminders.filterTask') },
                ...COMMON_SERVICE_TASKS.map((task) => ({ value: task, label: task })),
              ]}
            />
            <Button type="button" variant="outline" className={cn('w-full sm:w-auto', FLEET_FILTER_SELECT)}>
              <Filter className="mr-2 h-4 w-4" />
              {t('expenseHistory.filters')}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-slate-600">
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
            <FilterPill
              label={t('serviceReminders.groupNone')}
              value=""
              onChange={() => {}}
              className="hidden min-w-[8rem] lg:block"
              options={[{ value: '', label: t('serviceReminders.groupNone') }]}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label={t('expenseHistory.tableSettings')}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-200 px-4 py-3 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
          <StatCard label={t('serviceReminders.statOverdueVehicles')} value={String(counts.overdueVehicles)} tone="red" />
          <StatCard label={t('serviceReminders.statDueSoonVehicles')} value={String(counts.dueSoonVehicles)} tone="orange" />
          <StatCard label={t('serviceReminders.statSnoozedVehicles')} value={String(counts.snoozedVehicles)} />
          <StatCard
            label={t('serviceReminders.statCompliance')}
            value={t('serviceReminders.complianceValue', { value: counts.averageCompliance })}
            tone="brand"
          />
        </div>

      <div className={cn(FLEET_SPLIT_PANEL, 'rounded-none border-0 border-t border-slate-200')}>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`sr-skeleton-${index}`} className="grid grid-cols-6 gap-2">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4">
              <EmptyState
                icon={Wrench}
                title={t('serviceReminders.loadError')}
                subtitle={error}
                actionLabel={t('reminders.retry')}
                onAction={() => void load()}
              />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Wrench}
                title={t('serviceReminders.emptyTitle')}
                subtitle={t('serviceReminders.emptySubtitle')}
              />
            </div>
          ) : (
            <>
            <div className={cn(FLEET_LIST_MOBILE, 'p-3')}>
              {pageRows.map((row) => (
                <MobileDataCard
                  key={row.id}
                  title={row.vehiclePlate}
                  subtitle={row.serviceTask}
                  badge={<span className={cn('text-xs font-medium', statusClass(row.status))}>{statusLabel(row.status, t)}</span>}
                  onClick={() => setSelectedRow(row)}
                >
                  <MobileFieldGrid>
                    <MobileField label={t('serviceReminders.colNextDue')} value={formatRelativeDueDate(row.nextDueDate, i18n.language)} />
                    <MobileField
                      label={t('serviceReminders.colLastCompleted')}
                      value={row.lastCompletedDate ? formatDate(row.lastCompletedDate) : '—'}
                    />
                  </MobileFieldGrid>
                </MobileDataCard>
              ))}
            </div>
            <div className={cn(FLEET_LIST_DESKTOP, 'overflow-x-auto')}>
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('serviceReminders.colVehicle')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('serviceReminders.colServiceTask')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('serviceReminders.colStatus')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('serviceReminders.colNextDue')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('serviceReminders.colLastCompleted')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {pageRows.map((row) => {
                    const vehicle = vehicles.find((item) => item.id === row.vehicleId);
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          FLEET_TABLE_ROW_CLICKABLE,
                          row.status === 'overdue' && 'border-l-4 border-l-red-500',
                          isSelected && 'bg-surface/60',
                        )}
                        onClick={() => setSelectedRow(row)}
                      >
                        <TableCell className={FLEET_TABLE_CELL}>
                          <VehiclePlateDisplay
                            vehicleId={row.vehicleId}
                            plate={row.vehiclePlate}
                            photoUrl={vehicle?.photo_url}
                            brand={row.vehicleBrand}
                            model={row.vehicleModel}
                            layout="inline"
                            size="sm"
                          />
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <span className="font-semibold text-slate-900">{row.serviceTask}</span>
                          <p className="mt-0.5 text-[12px] text-slate-500">{row.intervalLabel}</p>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'font-medium', statusClass(row.status))}>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                row.status === 'overdue' && 'bg-red-500',
                                row.status === 'due_soon' && 'bg-orange-500',
                                row.status === 'snoozed' && 'bg-slate-400',
                                row.status === 'scheduled' && 'bg-brand-primary',
                              )}
                            />
                            {statusLabel(row.status, t)}
                          </span>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, statusClass(row.status))}>
                          <div>{formatRelativeDueDate(row.nextDueDate, i18n.language)}</div>
                          {row.remainingKm != null ? (
                            <div className="text-[12px] text-red-600">
                              {t('serviceReminders.detail.remainingKm', {
                                value: row.remainingKm.toLocaleString(i18n.language),
                              })}
                            </div>
                          ) : (
                            <div className="text-[12px] text-slate-500">{formatDate(row.nextDueDate)}</div>
                          )}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.lastCompletedDate ? (
                            <>
                              {row.serviceRecordId ? (
                                <Link href={`/service-history/${row.serviceRecordId}`} className={FLEET_LINK_ACTION} onClick={(e) => e.stopPropagation()}>
                                  {formatDate(row.lastCompletedDate)}
                                </Link>
                              ) : (
                                <div>{formatDate(row.lastCompletedDate)}</div>
                              )}
                              {row.lastCompletedMileage != null ? (
                                <div className="text-[12px] text-slate-500">
                                  {row.lastCompletedMileage.toLocaleString(i18n.language)} km
                                </div>
                              ) : null}
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </div>

        {selectedRow ? (
          <>
          <div className={FLEET_SIDE_DRAWER_OVERLAY} onClick={() => setSelectedRow(null)} aria-hidden />
          <ServiceReminderDetailDrawer
            row={selectedRow}
            watched={watchlist.has(selectedRow.id)}
            onClose={() => setSelectedRow(null)}
            onToggleWatch={() => toggleWatch(selectedRow.id)}
            onResolve={() => void handleResolve(selectedRow)}
          />
          </>
        ) : null}
      </div>
      </Card>
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
  tone?: 'orange' | 'brand' | 'red';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold text-slate-900',
          tone === 'orange' && 'text-orange-600',
          tone === 'brand' && 'text-brand-primary',
          tone === 'red' && 'text-red-600',
        )}
      >
        {value}
      </p>
    </div>
  );
}
