'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Paperclip,
  Plus,
  Search,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CreateExpenseEntryDialog } from '@/components/expense-history/CreateExpenseEntryDialog';
import { ServiceHistoryActionsMenu } from '@/components/expense-history/ServiceHistoryActionsMenu';
import { ServiceHistoryImportDialog } from '@/components/expense-history/ServiceHistoryImportDialog';
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
import {
  getServiceHistoryMockVehicles,
  isServiceHistoryMockRecord,
  SERVICE_HISTORY_MOCK_ATTACHMENT_IDS,
  SERVICE_HISTORY_MOCK_RECORDS,
} from '@/lib/service-history-mock-data';
import {
  formatServiceTasks,
  hasServiceRecordAttachments,
  parseServiceRecordLabels,
  parseServiceRecordTasks,
} from '@/lib/service-record-notes';
import { downloadServiceRecordsCsv } from '@/lib/service-history-csv';
import { serviceReminderHref } from '@/lib/service-reminders';
import { BRAND_BADGE_PLANNED, BRAND_BTN_PRIMARY } from '@/lib/brand-colors';
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_LIST_MOBILE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
  FLEET_TOOLBAR,
} from '@/lib/fleet-table';
import { MobileField } from '@/components/ui/MobileDataCard';
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
  if (priority === 'scheduled') return BRAND_BADGE_PLANNED;
  if (priority === 'non_scheduled') return 'bg-amber-50 text-amber-700';
  if (priority === 'emergency') return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function priorityDotClass(priority: RepairPriorityClass): string {
  if (priority === 'scheduled') return 'bg-brand-primary';
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
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
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
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
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
    } catch {
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
  }, [dateFilter, fromFilter, repairCompanyFilter, toFilter, vehicleFilter]);

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
    router.push(`/service-history/${id}`);
  }

  function handleExport() {
    if (sortedRecords.length === 0) return;
    const realRows = sortedRecords.filter((row) => !isServiceHistoryMockRecord(row.id));
    downloadServiceRecordsCsv(realRows.length > 0 ? realRows : sortedRecords);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{t('serviceHistory.title')}</h1>
          {!loading && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">
              {sortedRecords.length}
            </span>
          )}
        </div>

        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full sm:w-auto', FLEET_FILTER_SELECT)}
            onClick={handleExport}
            disabled={sortedRecords.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv')}
          </Button>
          <ServiceHistoryActionsMenu
            canImport={canImport}
            onImport={() => setImportOpen(true)}
            onExport={handleExport}
            showExport={false}
          />
          {canEdit ? (
            <Button type="button" className={cn(BRAND_BTN_PRIMARY, 'w-full sm:w-auto')} onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('serviceHistory.addEntry')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={FLEET_TOOLBAR}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('serviceHistory.searchPlaceholder')}
            className={cn('pl-9', FLEET_FILTER_INPUT)}
          />
        </div>

        <FilterPill
          label={t('expenseHistory.filterVehicle')}
          value={vehicleFilter}
          onChange={setVehicleFilter}
          className="w-full sm:w-40"
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
          className="w-full sm:w-40"
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
          className="w-full sm:w-44"
          options={[
            { value: '', label: t('serviceHistory.filterServiceTasks') },
            ...serviceTypes.map((type) => ({ value: type, label: type })),
          ]}
        />

        <FilterPill
          label={t('serviceHistory.filterRepairCompany')}
          value={repairCompanyFilter}
          onChange={setRepairCompanyFilter}
          className="w-full sm:w-44"
          options={[
            { value: '', label: t('serviceHistory.filterRepairCompany') },
            ...repairCompanies.map((company) => ({ value: company, label: company })),
          ]}
        />

        <Button type="button" variant="outline" className={cn('w-full sm:w-auto', FLEET_FILTER_SELECT)}>
          <Filter className="mr-2 h-4 w-4" />
          {t('expenseHistory.filters')}
        </Button>
      </div>

      {usingMockData ? (
        <div className="rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2 text-[13px] text-amber-900">
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
        <div className="rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-[13px] text-blue-900">
          {t('serviceHistory.activeFilters')}
          {watchedOnly ? ` ${t('expenseHistory.filterWatched')}` : ''}
          {repairCompanyFilter ? ` ${repairCompanyFilter}` : ''}
          {serviceTypeFilter ? ` ${serviceTypeFilter}` : ''}
          {categoryFilter ? ` ${categoryFilter}` : ''}
          {priorityFilter ? ` ${t(`serviceHistory.priority.${priorityFilter}`)}` : ''}
          {fromFilter && toFilter ? ` ${fromFilter} – ${toFilter}` : ''}
        </div>
      )}

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`service-history-skeleton-${index}`} className="grid grid-cols-6 gap-2">
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
              icon={Wallet}
              title={t('expenseHistory.loadError')}
              subtitle={error}
              actionLabel={t('expenseHistory.retry')}
              onAction={() => void reload()}
            />
          </div>
        ) : pageRecords.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wallet}
              title={t('expenseHistory.emptyTitle')}
              subtitle={t('expenseHistory.emptySubtitle')}
              actionLabel={canEdit ? t('serviceHistory.addEntry') : undefined}
              onAction={canEdit ? () => setCreateOpen(true) : undefined}
            />
          </div>
        ) : (
          <>
          <div className={FLEET_LIST_MOBILE}>
            {pageRecords.map((row) => {
              const vehicle = vehicleById.get(row.vehicle_id);
              const tasks = formatServiceTasks(row.service_type);
              const taskList = parseServiceRecordTasks(row);
              const primaryTask = taskList[0] ?? tasks.primary;
              return (
                <div
                  key={row.id}
                  className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50"
                  onClick={() => openEntry(row.id)}
                >
                  <div className="min-w-0 space-y-2">
                    <VehiclePlateDisplay
                      vehicleId={row.vehicle_id}
                      plate={row.vehicle_plate}
                      photoUrl={vehicle?.photo_url}
                      brand={vehicle?.brand}
                      model={vehicle?.model}
                      size="sm"
                      layout="inline"
                    />
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                      <MobileField label={t('serviceHistory.create.completionDate')} value={formatCompletionDateTime(row.date, i18n.language)} />
                      <MobileField label={t('serviceHistory.create.lineItemTask')} value={primaryTask} />
                      <MobileField label={t('serviceHistory.create.cost')} value={formatAmount(row.cost_amount, i18n.language)} />
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'w-10')}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label={t('expenseHistory.selectAll')}
                    />
                  </TableHead>
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'w-10 px-2')} aria-label={t('serviceHistory.create.sectionDocuments')} />
                  <TableHead className={FLEET_TABLE_HEAD}>
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
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
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
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.create.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.create.vendor')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.create.priorityClass')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
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
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
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
                  </TableHead>
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'text-right')}>
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
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.create.labels')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {pageRecords.map((row) => {
                  const vehicle = vehicleById.get(row.vehicle_id);
                  const priority = getRepairPriorityClass(row.service_type, row.notes);
                  const priorityLabel = t(`serviceHistory.priority.${priority}`);
                  const tasks = formatServiceTasks(row.service_type);
                  const taskList = parseServiceRecordTasks(row);
                  const primaryTask = taskList[0] ?? tasks.primary;
                  const labels = parseServiceRecordLabels(row.notes);
                  const isMock = isServiceHistoryMockRecord(row.id);
                  const hasAttachment =
                    (isMock && SERVICE_HISTORY_MOCK_ATTACHMENT_IDS.has(row.id)) ||
                    hasServiceRecordAttachments(row.notes);

                  return (
                    <TableRow
                      key={row.id}
                      className={FLEET_TABLE_ROW_CLICKABLE}
                      onClick={() => openEntry(row.id)}
                    >
                      <TableCell className={FLEET_TABLE_CELL} onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          aria-label={t('expenseHistory.selectRow')}
                        />
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL, 'px-2 text-slate-400')}>
                        {hasAttachment ? <Paperclip className="h-4 w-4" aria-hidden /> : null}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <VehiclePlateDisplay
                            vehicleId={row.vehicle_id}
                            plate={row.vehicle_plate}
                            photoUrl={vehicle?.photo_url}
                            brand={vehicle?.brand}
                            model={vehicle?.model}
                            layout="inline"
                            size="sm"
                          />
                          {isMock ? (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase text-slate-500">
                              {t('serviceHistory.sampleBadge')}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'whitespace-nowrap')}>
                        <div className="flex items-center gap-2">
                          <span>{formatCompletionDateTime(row.date, i18n.language)}</span>
                          {!isMock ? (
                            <Link
                              href={serviceReminderHref({
                                vehicleId: row.vehicle_id,
                                task: primaryTask,
                              })}
                              className="text-slate-400 hover:text-brand-primary"
                              title={t('serviceHistory.openReminder')}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Wrench className="h-3.5 w-3.5" />
                            </Link>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'max-w-[8rem] truncate')}>
                        {row.driver_name || '—'}
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'max-w-[9rem] truncate')}>
                        {renderVendor(row.vendor)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <RepairPriorityBadge priority={priority} label={priorityLabel} />
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL, 'whitespace-nowrap')}>
                        {formatMeter(row.mileage_km, i18n.language)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <span>{tasks.primary}</span>
                        {tasks.extra > 0 ? (
                          <span className="ml-1 text-[12px] text-slate-500">
                            {t('serviceHistory.moreTasks', { count: tasks.extra })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className={cn(FLEET_TABLE_CELL, 'text-right whitespace-nowrap font-semibold text-slate-900')}>
                        {showAmounts ? formatAmount(row.cost_amount, i18n.language) : '—'}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {labels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {labels.slice(0, 2).map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                              >
                                {formatLabel(label)}
                              </span>
                            ))}
                            {labels.length > 2 ? (
                              <span className="text-[12px] text-slate-500">
                                {t('serviceHistory.moreTasks', { count: labels.length - 2 })}
                              </span>
                            ) : null}
                          </div>
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
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-gray-500">
            {t('expenseHistory.pagination', {
              from: rangeStart,
              to: rangeEnd,
              total: sortedRecords.length,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
