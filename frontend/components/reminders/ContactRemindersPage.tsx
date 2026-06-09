'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Filter,
  Plus,
  Search,
  Settings2,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContactReminderDetailDrawer } from '@/components/reminders/ContactReminderDetailDrawer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { driversApi, remindersApi } from '@/lib/api';
import {
  buildContactReminderRows,
  COMMON_CONTACT_RENEWAL_TYPES,
  contactAvatarColor,
  contactReminderCounts,
  filterContactReminderRows,
  driverDisplayName,
  matchesContactRenewalTypeFilter,
  type ContactReminderRow,
  type ContactReminderStatus,
  type ContactReminderTab,
} from '@/lib/contact-reminders';
import { fetchActiveReminders, formatRelativeDueDate } from '@/lib/reminder-utils';
import type { Driver } from '@/lib/types';
import {
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TH,
  FLEET_RAW_TH_CHECKBOX,
  FLEET_RAW_THEAD,
  FLEET_SIDE_DRAWER_OVERLAY,
  FLEET_SPLIT_PANEL,
  FLEET_TAB_BAR,
  FLEET_TAB_ITEM,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
} from '@/lib/fleet-table';
import { MobileDataCard, MobileField, MobileFieldGrid } from '@/components/ui/MobileDataCard';
import { cn, formatDate } from '@/lib/utils';

const PAGE_SIZE = 50;
const WATCHLIST_KEY = 'fleet:contact-reminder-watchlist';

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

function statusLabel(status: ContactReminderStatus, t: (key: string) => string) {
  if (status === 'overdue') return t('contactReminders.statusOverdue');
  if (status === 'due_soon') return t('contactReminders.statusDueSoon');
  if (status === 'snoozed') return t('contactReminders.statusSnoozed');
  return t('contactReminders.statusUpcoming');
}

function statusClass(status: ContactReminderStatus) {
  if (status === 'overdue') return 'text-red-700';
  if (status === 'due_soon') return 'text-orange-600';
  return 'text-slate-600';
}

function rowAccentClass(status: ContactReminderStatus) {
  if (status === 'overdue') return 'border-l-red-500';
  if (status === 'due_soon') return 'border-l-orange-500';
  return 'border-l-slate-300';
}

export function ContactRemindersPage() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();

  const urgencyParam = searchParams.get('urgency');
  const tabParam = searchParams.get('tab');
  const initialTab: ContactReminderTab =
    urgencyParam === 'overdue' || tabParam === 'overdue'
      ? 'overdue'
      : urgencyParam === 'due_soon' || tabParam === 'due_soon'
        ? 'due_soon'
        : 'all';

  const [tab, setTab] = useState<ContactReminderTab>(initialTab);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rows, setRows] = useState<ContactReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<ContactReminderRow | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setWatchlist(readWatchlist());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [driverPage, rawReminders] = await Promise.all([
        driversApi.list({ limit: 200 }),
        fetchActiveReminders(),
      ]);
      setDrivers(driverPage.data);
      setRows(buildContactReminderRows(driverPage.data, rawReminders));
    } catch (e) {
      setDrivers([]);
      setRows([]);
      setError(e instanceof Error ? e.message : t('contactReminders.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [tab, search, contactFilter, typeFilter]);

  useEffect(() => {
    setSelectedRow((current) => {
      if (!current) return null;
      return rows.find((row) => row.id === current.id) ?? null;
    });
  }, [rows]);

  const counts = useMemo(() => contactReminderCounts(rows), [rows]);

  const contactOptions = useMemo(
    () =>
      [...drivers]
        .sort((a, b) => driverDisplayName(a).localeCompare(driverDisplayName(b)))
        .map((driver) => ({ id: driver.id, name: driverDisplayName(driver) })),
    [drivers],
  );

  const filteredRows = useMemo(() => {
    let list = filterContactReminderRows(rows, tab);
    const needle = search.trim().toLowerCase();
    if (contactFilter) list = list.filter((row) => row.contactId === contactFilter);
    if (typeFilter) list = list.filter((row) => matchesContactRenewalTypeFilter(row, typeFilter));
    if (needle) {
      list = list.filter((row) =>
        `${row.contactName} ${row.renewalLabel}`.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, tab, search, contactFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filteredRows.length, (page + 1) * PAGE_SIZE);

  async function handleResolve(row: ContactReminderRow) {
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

  const tabs: Array<{ id: ContactReminderTab; count: number; tone?: 'orange' | 'red' }> = [
    { id: 'all', count: counts.all },
    { id: 'due_soon', count: counts.dueSoon, tone: 'orange' },
    { id: 'overdue', count: counts.overdue, tone: 'red' },
  ];

  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('contactReminders.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button type="button" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-1.5 h-4 w-4" />
            {t('contactReminders.addReminder')}
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
            {t(`contactReminders.tab.${item.id}`)}
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
              placeholder={t('contactReminders.searchPlaceholder')}
              className="h-9 pl-9"
            />
          </div>
          <FilterPill
            label={t('contactReminders.filterContact')}
            value={contactFilter}
            onChange={setContactFilter}
            options={[
              { value: '', label: t('contactReminders.filterContact') },
              ...contactOptions.map((contact) => ({ value: contact.id, label: contact.name })),
            ]}
          />
          <FilterPill
            label={t('contactReminders.filterType')}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: t('contactReminders.filterType') },
              ...COMMON_CONTACT_RENEWAL_TYPES.map((item) => ({
                value: item.kind,
                label: t(`contactReminders.renewalType.${item.kind}`),
              })),
            ]}
          />
          <div className="relative">
            <select
              value=""
              disabled
              aria-label={t('contactReminders.filterNextDue')}
              className="h-9 cursor-not-allowed appearance-none rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-sm text-slate-400"
            >
              <option value="">{t('contactReminders.filterNextDue')}</option>
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
                icon={Users}
                title={t('contactReminders.loadError')}
                subtitle={error}
                actionLabel={t('reminders.retry')}
                onAction={() => void load()}
              />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title={t('contactReminders.emptyTitle')}
                subtitle={t('contactReminders.emptySubtitle')}
              />
            </div>
          ) : (
            <>
            <div className={cn(FLEET_LIST_MOBILE, 'p-3')}>
              {pageRows.map((row) => (
                <MobileDataCard
                  key={row.id}
                  title={row.contactName}
                  subtitle={t(`contactReminders.renewalType.${row.renewalKind}`)}
                  badge={<span className={cn('text-xs font-medium', statusClass(row.status))}>{statusLabel(row.status, t)}</span>}
                  onClick={() => setSelectedRow(row)}
                >
                  <MobileFieldGrid>
                    <MobileField label={t('contactReminders.colDueDate')} value={formatRelativeDueDate(row.dueDate, i18n.language)} />
                  </MobileFieldGrid>
                </MobileDataCard>
              ))}
            </div>
            <div className={cn(FLEET_LIST_DESKTOP, 'overflow-x-auto')}>
              <table className={FLEET_RAW_TABLE}>
                <thead className={FLEET_RAW_THEAD}>
                  <tr>
                    <th className={FLEET_RAW_TH_CHECKBOX}>
                      <input type="checkbox" aria-label={t('expenseHistory.selectAll')} />
                    </th>
                    <th className={FLEET_RAW_TH}>{t('contactReminders.colContact')}</th>
                    <th className={FLEET_RAW_TH}>{t('contactReminders.colRenewalType')}</th>
                    <th className={FLEET_RAW_TH}>{t('contactReminders.colStatus')}</th>
                    <th className={FLEET_RAW_TH}>{t('contactReminders.colDueDate')}</th>
                    <th className={FLEET_RAW_TH}>{t('expenseHistory.colWatchers')}</th>
                  </tr>
                </thead>
                <tbody className={FLEET_RAW_TBODY}>
                  {pageRows.map((row) => {
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'cursor-pointer border-l-4 hover:bg-slate-50/80',
                          rowAccentClass(row.status),
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
                            <span
                              className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
                                contactAvatarColor(row.contactName),
                              )}
                            >
                              {row.contactInitials}
                            </span>
                            <Link
                              href={`/drivers/${row.contactId}`}
                              className="font-semibold text-blue-700 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {row.contactName}
                            </Link>
                          </div>
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'font-medium text-slate-800')}>
                          {t(`contactReminders.renewalType.${row.renewalKind}`)}
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'font-medium', statusClass(row.status))}>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                row.status === 'overdue' && 'bg-red-500',
                                row.status === 'due_soon' && 'bg-orange-500',
                                row.status === 'snoozed' && 'bg-slate-400',
                                row.status === 'upcoming' && 'bg-slate-400',
                              )}
                            />
                            {statusLabel(row.status, t)}
                          </span>
                        </td>
                        <td className={cn(FLEET_RAW_TD, statusClass(row.status))}>
                          <div>{formatDate(row.dueDate)}</div>
                          <div className="text-[11px]">{formatRelativeDueDate(row.dueDate, i18n.language)}</div>
                        </td>
                        <td className={cn(FLEET_RAW_TD, 'text-slate-400')}>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {selectedRow ? (
          <>
          <div className={FLEET_SIDE_DRAWER_OVERLAY} onClick={() => setSelectedRow(null)} aria-hidden />
          <ContactReminderDetailDrawer
            row={selectedRow}
            watched={watchlist.has(selectedRow.id)}
            onClose={() => setSelectedRow(null)}
            onToggleWatch={() => toggleWatch(selectedRow.id)}
            onResolve={() => void handleResolve(selectedRow)}
          />
          </>
        ) : null}
      </div>
    </div>
  );
}
