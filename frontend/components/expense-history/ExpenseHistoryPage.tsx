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
  Filter,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CreateExpenseEntryDialog } from '@/components/expense-history/CreateExpenseEntryDialog';
import { ServiceHistoryActionsMenu } from '@/components/expense-history/ServiceHistoryActionsMenu';
import { ServiceHistoryImportDialog } from '@/components/expense-history/ServiceHistoryImportDialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useExpenseWatchlist } from '@/hooks/useExpenseWatchlist';
import { serviceRecordsApi, vehiclesApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { canEditServiceRecords, canImportCsv, canViewFinancials } from '@/lib/permissions';
import {
  getRepairPriorityClass,
  matchesServiceCategory,
  type RepairPriorityClass,
} from '@/lib/service-record-categories';
import type { ServiceRecord, Vehicle } from '@/lib/types';
import { vehicleAbbreviation } from '@/lib/timeline-utils';
import {
  getServiceHistoryMockVehicles,
  isServiceHistoryMockRecord,
  SERVICE_HISTORY_MOCK_ATTACHMENT_IDS,
  SERVICE_HISTORY_MOCK_RECORDS,
} from '@/lib/service-history-mock-data';
import {
  formatServiceTasks,
  hasServiceRecordAttachments,
  parseServiceRecordIssues,
  parseServiceRecordLabels,
  parseServiceRecordReference,
  parseServiceRecordTasks,
} from '@/lib/service-record-notes';
import { downloadServiceRecordsCsv } from '@/lib/service-history-csv';
import { serviceReminderHref } from '@/lib/service-reminders';
import {
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_TH_CHECKBOX,
  FLEET_RAW_THEAD,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

type DateFilter = 'all' | 'thisMonth' | 'last30' | 'last90';
type SortField = 'vehicle' | 'date' | 'type' | 'amount' | 'meter';
type SortDirection = 'asc' | 'desc';

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function recordDateIso(value: string): string {
  return value.slice(0, 10);
}

function formatCompletionDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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

function priorityBadgeClass(priority: RepairPriorityClass): string {
  if (priority === 'scheduled') return 'bg-emerald-50 text-emerald-700';
  if (priority === 'non_scheduled') return 'bg-amber-50 text-amber-700';
  if (priority === 'emergency') return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function priorityDotClass(priority: RepairPriorityClass): string {
  if (priority === 'scheduled') return 'bg-emerald-500';
  if (priority === 'non_scheduled') return 'bg-amber-500';
  if (priority === 'emergency') return 'bg-red-500';
  return 'bg-slate-400';
}

function formatMeter(value?: number | null, locale?: string): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString(locale)} km`;
}

function RepairPriorityBadge({
  priority,
  label,
}: {
  priority: RepairPriorityClass;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        priorityBadgeClass(priority),
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', priorityDotClass(priority))} aria-hidden />
      {label}
    </span>
  );
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
  const canImport = canImportCsv(user?.role ?? 'customer');
  const showAmounts = canViewFinancials(user?.role ?? 'customer');

  const serviceTypeFilter = searchParams.get('service_type') ?? '';
  const categoryFilter = searchParams.get('category');
  const fromFilter = searchParams.get('from') ?? undefined;
  const toFilter = searchParams.get('to') ?? undefined;
  const priorityFilter = searchParams.get('priority') ?? '';
  const vehicleIdFromUrl = searchParams.get('vehicle_id') ?? '';
  const watchedOnly = searchParams.get('watched') === '1';
  const { watchedIds } = useExpenseWatchlist();

  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState(vehicleIdFromUrl);
  const [typeFilter, setTypeFilter] = useState('');
  const [repairCompanyFilter, setRepairCompanyFilter] = useState('');
  const [repairCompanies, setRepairCompanies] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);

  const vehicleById = useMemo(() => {
    const merged = new Map<string, Vehicle>();
    for (const vehicle of vehicles) merged.set(vehicle.id, vehicle);
    if (usingMockData) {
      for (const vehicle of getServiceHistoryMockVehicles()) merged.set(vehicle.id, vehicle);
    }
    return merged;
  }, [vehicles, usingMockData]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = dateRangeForFilter(dateFilter);
      const [rows, vehiclePage, companies] = await Promise.all([
        serviceRecordsApi.list({
          vehicle_id: vehicleFilter || undefined,
          from: fromFilter ?? range.from,
          to: toFilter ?? range.to,
          repair_company: repairCompanyFilter || undefined,
        }),
        vehiclesApi.list({ limit: 200 }),
        serviceRecordsApi.getRepairCompanies(),
      ]);
      const hasApiRows = rows.length > 0;
      setUsingMockData(!hasApiRows);
      setRecords(hasApiRows ? rows : SERVICE_HISTORY_MOCK_RECORDS);
      setVehicles(vehiclePage.data.length > 0 ? vehiclePage.data : getServiceHistoryMockVehicles());
      setRepairCompanies(
        hasApiRows
          ? companies.filter(Boolean)
          : [...new Set(SERVICE_HISTORY_MOCK_RECORDS.map((row) => row.repair_company).filter(Boolean))],
      );
    } catch (e) {
      setUsingMockData(true);
      setRecords(SERVICE_HISTORY_MOCK_RECORDS);
      setVehicles(getServiceHistoryMockVehicles());
      setRepairCompanies([
        ...new Set(SERVICE_HISTORY_MOCK_RECORDS.map((row) => row.repair_company).filter(Boolean)),
      ]);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, fromFilter, repairCompanyFilter, toFilter, t, vehicleFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (vehicleIdFromUrl) setVehicleFilter(vehicleIdFromUrl);
  }, [vehicleIdFromUrl]);

  useEffect(() => {
    setPage(0);
  }, [search, vehicleFilter, typeFilter, repairCompanyFilter, dateFilter, serviceTypeFilter, categoryFilter, priorityFilter]);

  const serviceTypes = useMemo(() => {
    const values = new Set<string>();
    for (const row of records) {
      if (row.service_type) values.add(row.service_type);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return records.filter((row) => {
      if (serviceTypeFilter && row.service_type !== serviceTypeFilter) return false;
      if (categoryFilter === 'other' || categoryFilter === 'routine') {
        if (!matchesServiceCategory(row.service_type, categoryFilter)) return false;
      }
      if (typeFilter && row.service_type !== typeFilter) return false;
      if (watchedOnly && !watchedIds.includes(row.id)) return false;
      if (
        priorityFilter &&
        getRepairPriorityClass(row.service_type, row.notes) !== priorityFilter
      ) {
        return false;
      }

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
  }, [records, search, serviceTypeFilter, categoryFilter, typeFilter, watchedOnly, watchedIds, priorityFilter]);

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
      } else if (sortField === 'meter') {
        result = (a.mileage_km ?? 0) - (b.mileage_km ?? 0);
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
    setSortDirection(field === 'date' ? 'desc' : 'asc');
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
    const vendor = value?.trim();
    if (!vendor) return '—';
    return vendor;
  }

  function formatLabel(label: string): string {
    const key = `serviceHistory.create.label.${label}`;
    const translated = t(key);
    return translated !== key ? translated : label;
  }

  function openEntry(id: string) {
    if (isServiceHistoryMockRecord(id)) return;
    router.push(`/service-history/${id}`);
  }

  function handleExport() {
    if (sortedRecords.length === 0) return;
    const realRows = sortedRecords.filter((row) => !isServiceHistoryMockRecord(row.id));
    downloadServiceRecordsCsv(realRows.length > 0 ? realRows : sortedRecords);
  }

  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('serviceHistory.title')}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ServiceHistoryActionsMenu
            canImport={canImport}
            onImport={() => setImportOpen(true)}
            onExport={handleExport}
          />
          {canEdit ? (
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('serviceHistory.addEntry')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('serviceHistory.searchPlaceholder')}
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
            label={t('serviceHistory.filterServiceTasks')}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: t('serviceHistory.filterServiceTasks') },
              ...serviceTypes.map((type) => ({ value: type, label: type })),
            ]}
          />

          <FilterPill
            label={t('serviceHistory.filterRepairCompany')}
            value={repairCompanyFilter}
            onChange={setRepairCompanyFilter}
            options={[
              { value: '', label: t('serviceHistory.filterRepairCompany') },
              ...repairCompanies.map((company) => ({ value: company, label: company })),
            ]}
          />

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

      {usingMockData ? (
        <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          {t('serviceHistory.demoDataBanner')}
        </div>
      ) : null}

      {(serviceTypeFilter ||
        categoryFilter ||
        fromFilter ||
        toFilter ||
        watchedOnly ||
        repairCompanyFilter ||
        priorityFilter) && (
        <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
          {t('serviceHistory.activeFilters')}
          {watchedOnly ? ` ${t('expenseHistory.filterWatched')}` : ''}
          {repairCompanyFilter ? ` ${repairCompanyFilter}` : ''}
          {serviceTypeFilter ? ` ${serviceTypeFilter}` : ''}
          {categoryFilter ? ` ${categoryFilter}` : ''}
          {priorityFilter ? ` ${t(`serviceHistory.priority.${priorityFilter}`)}` : ''}
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
              actionLabel={canEdit ? t('serviceHistory.addEntry') : undefined}
              onAction={canEdit ? () => setCreateOpen(true) : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={FLEET_RAW_TABLE}>
              <thead className={FLEET_RAW_THEAD}>
                <tr>
                  <th className={FLEET_RAW_TH_CHECKBOX}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label={t('expenseHistory.selectAll')}
                    />
                  </th>
                  <th className={cn(FLEET_RAW_TH_CHECKBOX, 'px-2')} aria-label={t('serviceHistory.create.sectionDocuments')} />
                  <th className={FLEET_RAW_TH}>
                    <button
                      type="button"
                      onClick={() => toggleSort('vehicle')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('serviceHistory.create.vehicle')}
                      {sortField === 'vehicle' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className={FLEET_RAW_TH}>
                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('serviceHistory.create.completionDate')}
                      {sortField === 'date' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className={FLEET_RAW_TH}>{t('serviceHistory.create.driver')}</th>
                  <th className={FLEET_RAW_TH}>{t('serviceHistory.create.reference')}</th>
                  <th className={FLEET_RAW_TH}>{t('serviceHistory.create.vendor')}</th>
                  <th className={FLEET_RAW_TH}>{t('serviceHistory.create.priorityClass')}</th>
                  <th className={FLEET_RAW_TH}>
                    <button
                      type="button"
                      onClick={() => toggleSort('meter')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('serviceHistory.create.meter')}
                      {sortField === 'meter' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className={FLEET_RAW_TH}>
                    <button
                      type="button"
                      onClick={() => toggleSort('type')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('serviceHistory.create.lineItemTask')}
                      {sortField === 'type' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className={FLEET_RAW_TH}>{t('serviceHistory.create.sectionIssues')}</th>
                  <th className={cn(FLEET_RAW_TH, 'text-right')}>
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      {t('serviceHistory.create.cost')}
                      {sortField === 'amount' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  </th>
                  <th className={FLEET_RAW_TH}>{t('serviceHistory.create.labels')}</th>
                </tr>
              </thead>
              <tbody className={FLEET_RAW_TBODY}>
                {pageRecords.map((row) => {
                  const vehicle = vehicleById.get(row.vehicle_id);
                  const badge = vehicle
                    ? vehicleAbbreviation(vehicle.brand, vehicle.model, vehicle.plate_number)
                    : row.vehicle_plate.slice(0, 3).toUpperCase();
                  const priority = getRepairPriorityClass(row.service_type, row.notes);
                  const priorityLabel = t(`serviceHistory.priority.${priority}`);
                  const tasks = formatServiceTasks(row.service_type);
                  const taskList = parseServiceRecordTasks(row);
                  const primaryTask = taskList[0] ?? tasks.primary;
                  const labels = parseServiceRecordLabels(row.notes);
                  const issues = parseServiceRecordIssues(row.notes);
                  const reference = parseServiceRecordReference(row.notes);
                  const isMock = isServiceHistoryMockRecord(row.id);
                  const hasAttachment =
                    (isMock && SERVICE_HISTORY_MOCK_ATTACHMENT_IDS.has(row.id)) ||
                    hasServiceRecordAttachments(row.notes);

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'hover:bg-slate-50/80',
                        isMock ? 'cursor-default' : 'cursor-pointer',
                      )}
                      onClick={() => openEntry(row.id)}
                    >
                      <td className={FLEET_RAW_TD} onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          aria-label={t('expenseHistory.selectRow')}
                        />
                      </td>
                      <td className={cn(FLEET_RAW_TD, 'px-2 text-slate-400')}>
                        {hasAttachment ? <Paperclip className="h-4 w-4" aria-hidden /> : null}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <div className="flex items-center gap-2">
                          {vehicle?.photo_url ? (
                            <img
                              src={vehicle.photo_url}
                              alt=""
                              className="h-8 w-8 rounded object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                              {badge}
                            </span>
                          )}
                          <div className="min-w-0">
                            {isMock ? (
                              <span className="block truncate font-semibold text-emerald-700">
                                {row.vehicle_plate}
                              </span>
                            ) : (
                              <Link
                                href={`/vehicles/${row.vehicle_id}`}
                                className="block truncate font-semibold text-emerald-700 underline-offset-2 hover:underline"
                              >
                                {row.vehicle_plate}
                              </Link>
                            )}
                            <div className="flex items-center gap-1.5">
                              {vehicle ? (
                                <p className="truncate text-xs text-slate-500">
                                  {vehicle.brand} {vehicle.model}
                                </p>
                              ) : null}
                              {isMock ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                                  {t('serviceHistory.sampleBadge')}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={cn(FLEET_RAW_TD, 'whitespace-nowrap')} onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 underline decoration-emerald-700/40 underline-offset-2">
                            {formatCompletionDateTime(row.date, i18n.language)}
                          </span>
                          {!isMock ? (
                            <Link
                              href={serviceReminderHref({
                                vehicleId: row.vehicle_id,
                                task: primaryTask,
                              })}
                              className="text-slate-400 hover:text-emerald-700"
                              title={t('serviceHistory.openReminder')}
                            >
                              <Wrench className="h-3.5 w-3.5" />
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className={cn(FLEET_RAW_TD_MUTED, 'max-w-[8rem] truncate')}>
                        {row.driver_name || '—'}
                      </td>
                      <td className={cn(FLEET_RAW_TD, 'max-w-[7rem] truncate font-medium text-emerald-700')}>
                        {reference || '—'}
                      </td>
                      <td className={cn(FLEET_RAW_TD_MUTED, 'max-w-[9rem] truncate')}>
                        {renderVendor(row.vendor)}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <RepairPriorityBadge priority={priority} label={priorityLabel} />
                      </td>
                      <td className={cn(FLEET_RAW_TD, 'whitespace-nowrap')}>
                        {formatMeter(row.mileage_km, i18n.language)}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <span className="text-emerald-700 underline decoration-emerald-700/40 underline-offset-2">
                          {tasks.primary}
                        </span>
                        {tasks.extra > 0 ? (
                          <span className="ml-1 text-xs text-slate-500">
                            {t('serviceHistory.moreTasks', { count: tasks.extra })}
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(FLEET_RAW_TD_MUTED, 'max-w-[8rem] truncate')}>{issues || '—'}</td>
                      <td className={cn(FLEET_RAW_TD_PRIMARY, 'text-right whitespace-nowrap')}>
                        {showAmounts ? formatAmount(row.cost_amount, i18n.language) : '—'}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        {labels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {labels.slice(0, 2).map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                              >
                                {formatLabel(label)}
                              </span>
                            ))}
                            {labels.length > 2 ? (
                              <span className="text-[10px] text-slate-500">
                                {t('serviceHistory.moreTasks', { count: labels.length - 2 })}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
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
        onCreated={(created, options) => {
          setUsingMockData(false);
          setRecords((prev) => {
            const withoutMock = prev.filter((row) => !isServiceHistoryMockRecord(row.id));
            return [created, ...withoutMock];
          });
          if (!options?.keepOpen) {
            setCreateOpen(false);
            router.push(`/service-history/${created.id}`);
          }
        }}
      />

      <ServiceHistoryImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void reload()}
      />
    </div>
  );
}
