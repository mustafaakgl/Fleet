'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  Settings2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VehicleReminderActionsMenu } from '@/components/reminders/VehicleReminderActionsMenu';
import { VehicleReminderDetailDrawer } from '@/components/reminders/VehicleReminderDetailDrawer';
import { VehicleReminderImportDialog } from '@/components/reminders/VehicleReminderImportDialog';
import { VehiclePlateDisplay } from '@/components/vehicles/VehiclePlateDisplay';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { remindersApi, vehiclesApi } from '@/lib/api';
import { BRAND_BTN_PRIMARY } from '@/lib/brand-colors';
import { fetchActiveReminders, formatRelativeDueDate } from '@/lib/reminder-utils';
import { downloadVehicleRemindersCsv } from '@/lib/vehicle-reminders-csv';
import type { Vehicle } from '@/lib/types';
import {
  buildVehicleReminderRows,
  COMMON_VEHICLE_RENEWAL_TYPES,
  filterVehicleReminderRows,
  matchesRenewalTypeFilter,
  vehicleReminderCounts,
  type VehicleReminderRow,
  type VehicleReminderStatus,
  type VehicleReminderTab,
} from '@/lib/vehicle-reminders';
import {
  FLEET_SIDE_DRAWER_OVERLAY,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
  FLEET_SPLIT_PANEL,
  FLEET_TAB_BAR,
  FLEET_TAB_ITEM,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
} from '@/lib/fleet-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MobileDataCard, MobileField, MobileFieldGrid } from '@/components/ui/MobileDataCard';
import { cn, formatDate } from '@/lib/utils';

const PAGE_SIZE = 50;
const WATCHLIST_KEY = 'fleet:vehicle-reminder-watchlist';

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

function statusLabel(status: VehicleReminderStatus, t: (key: string) => string) {
  if (status === 'overdue') return t('vehicleReminders.statusOverdue');
  if (status === 'due_soon') return t('vehicleReminders.statusDueSoon');
  if (status === 'snoozed') return t('vehicleReminders.statusSnoozed');
  return t('vehicleReminders.statusUpcoming');
}

function statusClass(status: VehicleReminderStatus) {
  if (status === 'overdue') return 'text-red-700';
  if (status === 'due_soon') return 'text-orange-600';
  return 'text-slate-600';
}

function rowAccentClass(status: VehicleReminderStatus) {
  if (status === 'overdue') return 'border-l-red-500';
  if (status === 'due_soon') return 'border-l-orange-500';
  return 'border-l-slate-300';
}

export function VehicleRemindersPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urgencyParam = searchParams.get('urgency');
  const tabParam = searchParams.get('tab');
  const initialTab: VehicleReminderTab =
    urgencyParam === 'overdue' || tabParam === 'overdue'
      ? 'overdue'
      : urgencyParam === 'due_soon' || tabParam === 'due_soon'
        ? 'due_soon'
        : 'all';

  const [tab, setTab] = useState<VehicleReminderTab>(initialTab);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rows, setRows] = useState<VehicleReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<VehicleReminderRow | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => new Set());
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    setWatchlist(readWatchlist());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehiclePage, rawReminders] = await Promise.all([
        vehiclesApi.list({ limit: 200 }),
        fetchActiveReminders(),
      ]);
      setVehicles(vehiclePage.data);
      setRows(
        buildVehicleReminderRows(
          vehiclePage.data,
          rawReminders as unknown as Record<string, unknown>[],
        ),
      );
    } catch (e) {
      setVehicles([]);
      setRows([]);
      setError(e instanceof Error ? e.message : t('vehicleReminders.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
  }, [tab, search, vehicleFilter, typeFilter]);

  useEffect(() => {
    setSelectedRow((current) => {
      if (!current) return null;
      return rows.find((row) => row.id === current.id) ?? null;
    });
  }, [rows]);

  const counts = useMemo(() => vehicleReminderCounts(rows), [rows]);

  const vehicleOptions = useMemo(
    () =>
      [...vehicles]
        .sort((a, b) => a.plate_number.localeCompare(b.plate_number))
        .map((vehicle) => ({ id: vehicle.id, plate: vehicle.plate_number })),
    [vehicles],
  );

  const filteredRows = useMemo(() => {
    let list = filterVehicleReminderRows(rows, tab);
    const needle = search.trim().toLowerCase();
    if (vehicleFilter) list = list.filter((row) => row.vehicleId === vehicleFilter);
    if (typeFilter) list = list.filter((row) => matchesRenewalTypeFilter(row, typeFilter));
    if (needle) {
      list = list.filter((row) =>
        `${row.vehiclePlate} ${row.renewalLabel}`.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, tab, search, vehicleFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filteredRows.length, (page + 1) * PAGE_SIZE);

  async function handleResolve(row: VehicleReminderRow) {
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

  const tabs: Array<{ id: VehicleReminderTab; count: number; tone?: 'orange' | 'red' }> = [
    { id: 'all', count: counts.all },
    { id: 'due_soon', count: counts.dueSoon, tone: 'orange' },
    { id: 'overdue', count: counts.overdue, tone: 'red' },
  ];

  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('vehicleReminders.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <VehicleReminderActionsMenu
            onImport={() => setImportOpen(true)}
            onExport={() => downloadVehicleRemindersCsv(filteredRows)}
          />
          <Button
            type="button"
            className={cn(BRAND_BTN_PRIMARY, 'w-full sm:w-auto')}
            onClick={() => router.push('/reminders/vehicle/new')}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('vehicleReminders.addReminder')}
          </Button>
        </div>
      </div>

      <div className={FLEET_TAB_BAR}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              FLEET_TAB_ITEM,
              tab === item.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t(`vehicleReminders.tab.${item.id}`)}
            {item.id !== 'all' ? (
              <span
                className={cn(
                  'ml-1',
                  item.tone === 'orange' && 'text-orange-600',
                  item.tone === 'red' && 'text-red-600',
                )}
              >
                ({item.count})
              </span>
            ) : null}
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
              placeholder={t('vehicleReminders.searchPlaceholder')}
              className="h-9 pl-9"
            />
          </div>
          <FilterPill
            label={t('vehicleReminders.filterVehicle')}
            value={vehicleFilter}
            onChange={setVehicleFilter}
            options={[
              { value: '', label: t('vehicleReminders.filterVehicle') },
              ...vehicleOptions.map((vehicle) => ({ value: vehicle.id, label: vehicle.plate })),
            ]}
          />
          <FilterPill
            label={t('vehicleReminders.filterType')}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: t('vehicleReminders.filterType') },
              ...COMMON_VEHICLE_RENEWAL_TYPES.map((item) => ({
                value: item.kind,
                label: t(`vehicleReminders.renewalType.${item.kind}`),
              })),
            ]}
          />
          <div className="relative">
            <select
              value=""
              disabled
              aria-label={t('vehicleReminders.filterDueDate')}
              className="h-9 cursor-not-allowed appearance-none rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-sm text-slate-400"
            >
              <option value="">{t('vehicleReminders.filterDueDate')}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          </div>
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
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={t('expenseHistory.tableSettings')}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={FLEET_SPLIT_PANEL}>
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
                icon={CarFront}
                title={t('vehicleReminders.loadError')}
                subtitle={error}
                actionLabel={t('reminders.retry')}
                onAction={() => void load()}
              />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CarFront}
                title={t('vehicleReminders.emptyTitle')}
                subtitle={t('vehicleReminders.emptySubtitle')}
              />
            </div>
          ) : (
            <>
            <div className={cn(FLEET_LIST_MOBILE, 'p-3')}>
              {pageRows.map((row) => (
                <MobileDataCard
                  key={row.id}
                  title={row.vehiclePlate}
                  subtitle={t(`vehicleReminders.renewalType.${row.renewalKind}`)}
                  badge={<span className={cn('text-xs font-medium', statusClass(row.status))}>{statusLabel(row.status, t)}</span>}
                  onClick={() => setSelectedRow(row)}
                >
                  <MobileFieldGrid>
                    <MobileField label={t('vehicleReminders.colDueDate')} value={formatRelativeDueDate(row.dueDate, i18n.language)} />
                  </MobileFieldGrid>
                </MobileDataCard>
              ))}
            </div>
            <div className={cn(FLEET_LIST_DESKTOP, 'overflow-x-auto')}>
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleReminders.colVehicle')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleReminders.colRenewalType')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleReminders.colStatus')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleReminders.colDueDate')}</TableHead>
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
                          'border-l-4',
                          rowAccentClass(row.status),
                          isSelected && 'bg-[#e8f0f8]/60',
                        )}
                        onClick={() => setSelectedRow(row)}
                      >
                        <TableCell className={FLEET_TABLE_CELL}>
                          <VehiclePlateDisplay
                            vehicleId={row.vehicleId}
                            plate={row.vehiclePlate}
                            photoUrl={vehicle?.photo_url ?? row.vehiclePhotoUrl}
                            brand={row.vehicleBrand}
                            model={row.vehicleModel}
                            layout="inline"
                            size="sm"
                          />
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'font-medium text-slate-800')}>
                          {t(`vehicleReminders.renewalType.${row.renewalKind}`)}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'font-medium', statusClass(row.status))}>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                row.status === 'overdue' && 'bg-red-500',
                                row.status === 'due_soon' && 'bg-orange-500',
                                row.status === 'snoozed' && 'bg-slate-400',
                                row.status === 'upcoming' && 'bg-[#1a4d7a]',
                              )}
                            />
                            {statusLabel(row.status, t)}
                          </span>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, statusClass(row.status))}>
                          <div>{formatDate(row.dueDate)}</div>
                          <div className="text-[12px]">{formatRelativeDueDate(row.dueDate, i18n.language)}</div>
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
          <VehicleReminderDetailDrawer
            row={selectedRow}
            watched={watchlist.has(selectedRow.id)}
            onClose={() => setSelectedRow(null)}
            onToggleWatch={() => toggleWatch(selectedRow.id)}
            onResolve={() => void handleResolve(selectedRow)}
          />
          </>
        ) : null}
      </div>

      <VehicleReminderImportDialog
        open={importOpen}
        vehicles={vehicles}
        onClose={() => setImportOpen(false)}
        onImported={() => void load()}
      />
    </div>
  );
}
