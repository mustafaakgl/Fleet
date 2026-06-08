'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Filter,
  Plus,
  Search,
  Settings2,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CreateExpenseEntryDialog } from '@/components/expense-history/CreateExpenseEntryDialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useExpenseWatchlist } from '@/hooks/useExpenseWatchlist';
import { serviceRecordsApi, vehiclesApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { canEditServiceRecords, canViewFinancials } from '@/lib/permissions';
import { matchesServiceCategory } from '@/lib/service-record-categories';
import type { ServiceRecord, Vehicle } from '@/lib/types';
import { vehicleAbbreviation } from '@/lib/timeline-utils';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

type TimeTab = 'past' | 'future';
type DateFilter = 'all' | 'thisMonth' | 'last30' | 'last90';
type SortField = 'vehicle' | 'date' | 'type' | 'amount';
type SortDirection = 'asc' | 'desc';

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function recordDateIso(value: string): string {
  return value.slice(0, 10);
}

function formatExpenseDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatAmount(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateRangeForFilter(filter: DateFilter): { from?: string; to?: string } {
  const today = new Date();
  const to = todayIso();
  if (filter === 'all') return {};
  if (filter === 'thisMonth') {
    const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    return { from, to };
  }
  const days = filter === 'last30' ? 30 : 90;
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function vehicleStatusDot(status?: Vehicle['status']) {
  if (status === 'active') return 'bg-emerald-500';
  if (status === 'maintenance') return 'bg-orange-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
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
        className="h-9 appearance-none rounded-full border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 hover:bg-slate-50 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function ExpenseHistoryPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getUser();
  const canEdit = canEditServiceRecords(user?.role ?? 'customer');
  const showAmounts = canViewFinancials(user?.role ?? 'customer');

  const serviceTypeFilter = searchParams.get('service_type') ?? '';
  const categoryFilter = searchParams.get('category');
  const fromFilter = searchParams.get('from') ?? undefined;
  const toFilter = searchParams.get('to') ?? undefined;
  const watchedOnly = searchParams.get('watched') === '1';
  const { watchedIds } = useExpenseWatchlist();

  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeTab, setTimeTab] = useState<TimeTab>('past');
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = dateRangeForFilter(dateFilter);
      const [rows, vehiclePage] = await Promise.all([
        serviceRecordsApi.list({
          vehicle_id: vehicleFilter || undefined,
          from: fromFilter ?? range.from,
          to: toFilter ?? range.to,
        }),
        vehiclesApi.list({ limit: 200 }),
      ]);
      setRecords(rows);
      setVehicles(vehiclePage.data);
    } catch (e) {
      setRecords([]);
      setError(e instanceof Error ? e.message : t('expenseHistory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [dateFilter, fromFilter, toFilter, t, vehicleFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(0);
  }, [timeTab, search, vehicleFilter, typeFilter, dateFilter, serviceTypeFilter, categoryFilter]);

  useEffect(() => {
    setSortDirection(timeTab === 'past' ? 'desc' : 'asc');
    setSortField('date');
  }, [timeTab]);

  const serviceTypes = useMemo(() => {
    const values = new Set<string>();
    for (const row of records) {
      if (row.service_type) values.add(row.service_type);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const today = todayIso();
    const needle = search.trim().toLowerCase();

    return records.filter((row) => {
      const rowDate = recordDateIso(row.date);
      const isFuture = rowDate > today;
      if (timeTab === 'past' ? isFuture : !isFuture) return false;

      if (serviceTypeFilter && row.service_type !== serviceTypeFilter) return false;
      if (categoryFilter === 'other' || categoryFilter === 'routine') {
        if (!matchesServiceCategory(row.service_type, categoryFilter)) return false;
      }
      if (typeFilter && row.service_type !== typeFilter) return false;
      if (watchedOnly && !watchedIds.includes(row.id)) return false;

      if (!needle) return true;
      const haystack = [
        row.vehicle_plate,
        row.service_type,
        row.repair_company,
        row.driver_name,
        row.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [records, search, serviceTypeFilter, categoryFilter, timeTab, typeFilter, watchedOnly, watchedIds]);

  const sortedRecords = useMemo(() => {
    const rows = [...filteredRecords];
    rows.sort((a, b) => {
      let result = 0;
      if (sortField === 'vehicle') {
        result = a.vehicle_plate.localeCompare(b.vehicle_plate);
      } else if (sortField === 'date') {
        result = recordDateIso(a.date).localeCompare(recordDateIso(b.date));
      } else if (sortField === 'type') {
        result = a.service_type.localeCompare(b.service_type);
      } else if (sortField === 'amount') {
        result = (a.cost_amount ?? 0) - (b.cost_amount ?? 0);
      }
      return sortDirection === 'asc' ? result : -result;
    });
    return rows;
  }, [filteredRecords, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const pageRecords = sortedRecords.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = sortedRecords.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(sortedRecords.length, (page + 1) * PAGE_SIZE);
  const allPageSelected =
    pageRecords.length > 0 && pageRecords.every((row) => selectedIds.has(row.id));

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection(field === 'date' && timeTab === 'past' ? 'desc' : 'asc');
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const row of pageRecords) next.delete(row.id);
      } else {
        for (const row of pageRecords) next.add(row.id);
      }
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderVendor(value?: string) {
    if (!value || value.trim() === '' || value === '—') return '—';
    return value;
  }

  function openEntry(id: string) {
    router.push(`/service-history/${id}`);
  }

  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('expenseHistory.title')}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
          {canEdit ? (
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('expenseHistory.addEntry')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        {(['past', 'future'] as TimeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTimeTab(tab)}
            className={cn(
              '-mb-px border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
              timeTab === tab
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t(tab === 'past' ? 'expenseHistory.tabPast' : 'expenseHistory.tabFuture')}
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
              placeholder={t('expenseHistory.searchPlaceholder')}
              className="h-9 pl-9"
            />
          </div>

          <FilterPill
            label={t('expenseHistory.filterVehicle')}
            value={vehicleFilter}
            onChange={setVehicleFilter}
            options={[
              { value: '', label: t('expenseHistory.filterVehicle') },
              ...vehicles.map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.plate_number,
              })),
            ]}
          />

          <FilterPill
            label={t('expenseHistory.filterDate')}
            value={dateFilter}
            onChange={(value) => setDateFilter(value as DateFilter)}
            options={[
              { value: 'all', label: t('expenseHistory.filterDate') },
              { value: 'thisMonth', label: t('expenseHistory.dateThisMonth') },
              { value: 'last30', label: t('expenseHistory.dateLast30') },
              { value: 'last90', label: t('expenseHistory.dateLast90') },
            ]}
          />

          <FilterPill
            label={t('expenseHistory.filterType')}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: t('expenseHistory.filterType') },
              ...serviceTypes.map((type) => ({ value: type, label: type })),
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
              total: sortedRecords.length,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={t('expenseHistory.tableSettings')}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {(serviceTypeFilter || categoryFilter || fromFilter || toFilter || watchedOnly) && (
        <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
          {t('serviceHistory.activeFilters')}
          {watchedOnly ? ` ${t('expenseHistory.filterWatched')}` : ''}
          {serviceTypeFilter ? ` ${serviceTypeFilter}` : ''}
          {categoryFilter ? ` ${categoryFilter}` : ''}
          {fromFilter && toFilter ? ` ${fromFilter} – ${toFilter}` : ''}
        </div>
      )}

      <div className="overflow-hidden rounded-b-xl bg-white">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : error ? (
          <div className="p-6">
            <EmptyState
              icon={Wallet}
              title={t('expenseHistory.loadError')}
              subtitle={error}
              actionLabel={t('expenseHistory.retry')}
              onAction={() => void reload()}
            />
          </div>
        ) : pageRecords.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Wallet}
              title={t('expenseHistory.emptyTitle')}
              subtitle={t('expenseHistory.emptySubtitle')}
              actionLabel={canEdit ? t('expenseHistory.addEntry') : undefined}
              onAction={canEdit ? () => setCreateOpen(true) : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label={t('expenseHistory.selectAll')}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('vehicle')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('expenseHistory.colVehicle')}
                      {sortField === 'vehicle' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('expenseHistory.colDate')}
                      {sortField === 'date' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className="px-4 py-3">{t('expenseHistory.colType')}</th>
                  <th className="px-4 py-3">{t('expenseHistory.colVendor')}</th>
                  <th className="px-4 py-3">{t('expenseHistory.colSource')}</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('expenseHistory.colAmount')}
                      {sortField === 'amount' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className="px-4 py-3">{t('expenseHistory.colWatchers')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRecords.map((row) => {
                  const vehicle = vehicleById.get(row.vehicle_id);
                  const badge = vehicle
                    ? vehicleAbbreviation(vehicle.brand, vehicle.model, vehicle.plate_number)
                    : row.vehicle_plate.slice(0, 3).toUpperCase();

                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => openEntry(row.id)}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          aria-label={t('expenseHistory.selectRow')}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded bg-slate-100 px-1.5 text-[10px] font-bold uppercase text-slate-600">
                            {badge}
                          </span>
                          <span className={cn('inline-block h-2 w-2 rounded-full', vehicleStatusDot(vehicle?.status))} />
                          <Link
                            href={`/vehicles/${row.vehicle_id}`}
                            className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                          >
                            {row.vehicle_plate}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-emerald-700 underline decoration-emerald-700/40 underline-offset-2">
                          {formatExpenseDate(row.date, i18n.language)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{row.service_type}</td>
                      <td className="px-4 py-3 text-slate-600">{renderVendor(row.vendor)}</td>
                      <td className="px-4 py-3 text-slate-600">{t('expenseHistory.sourceManual')}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {showAmounts ? formatAmount(row.cost_amount, i18n.language) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateExpenseEntryDialog
        open={createOpen}
        vehicles={vehicles}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setRecords((prev) => [created, ...prev]);
          setCreateOpen(false);
          router.push(`/service-history/${created.id}`);
        }}
      />
    </div>
  );
}
