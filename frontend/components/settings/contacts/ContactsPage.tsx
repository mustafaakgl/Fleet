'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Lightbulb,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { usersApi } from '@/lib/api';
import {
  contactInitials,
  inferUserAccess,
  loadContactProfile,
  type ContactProfile,
} from '@/lib/contact-profile-storage';
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
  FLEET_MOBILE_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
  FLEET_TAB_BAR,
  FLEET_TAB_ITEM,
  FLEET_TABLE_SCROLL,
  FLEET_TOOLBAR,
} from '@/lib/fleet-table';
import type { User, UserRole, UserStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type ContactTab = 'all' | 'users' | 'no_access' | 'archived';

type ContactRow = User & { profile: ContactProfile };

const PAGE_SIZE = 20;

function statusDotClass(status: UserStatus) {
  return status === 'active' ? 'bg-emerald-500' : 'bg-slate-400';
}

export function ContactsPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [tab, setTab] = useState<ContactTab>('users');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersApi.list({
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setUsers(res.data);
    } catch {
      setError(t('settings.contacts.loadError'));
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, statusFilter, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, statusFilter, roleFilter, groupFilter]);

  const rows = useMemo<ContactRow[]>(() => {
    return users
      .map((user) => ({
        ...user,
        profile: loadContactProfile(user.id, user.email),
      }))
      .filter((row) => {
        if (tab === 'users') {
          return row.status === 'active' && inferUserAccess(row.status, row.profile) === 'enabled';
        }
        if (tab === 'no_access') {
          return inferUserAccess(row.status, row.profile) === 'none';
        }
        if (tab === 'archived') {
          return row.status === 'inactive';
        }
        return true;
      })
      .filter((row) => {
        if (!groupFilter) return true;
        return (row.profile.group ?? '') === groupFilter;
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'de'));
  }, [groupFilter, tab, users]);

  const groups = useMemo(() => {
    const values = new Set<string>();
    users.forEach((user) => {
      const group = loadContactProfile(user.id, user.email).group?.trim();
      if (group) values.add(group);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'de'));
  }, [users]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);

  function groupLabel(value?: string) {
    if (!value) return '—';
    if (value === 'operations') return t('settings.contacts.groups.operations');
    if (value === 'management') return t('settings.contacts.groups.management');
    if (value === 'workshop') return t('settings.contacts.groups.workshop');
    return value;
  }

  function userTypeLabel(user: ContactRow) {
    if (user.role === 'admin') return t('settings.contacts.userType.accountOwner');
    if (inferUserAccess(user.status, user.profile) === 'enabled') {
      return t('settings.contacts.userType.user');
    }
    return '—';
  }

  function roleLabel(role: UserRole) {
    return t(`usersAdmin.roles.${role}`);
  }

  return (
    <div className={cn(FLEET_PAGE, 'pb-8')}>
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <h1 className={FLEET_PAGE_TITLE}>{t('settings.contacts.title')}</h1>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/hilfe">
              <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
              {t('settings.contacts.learn')}
            </Link>
          </Button>
        </div>
        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" asChild>
            <Link href="/settings/users/new">
              <Plus className="mr-1.5 h-4 w-4" />
              {t('settings.contacts.addContact')}
            </Link>
          </Button>
        </div>
      </div>

      <div className={FLEET_TAB_BAR}>
        {(['all', 'users', 'no_access', 'archived'] as ContactTab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              FLEET_TAB_ITEM,
              tab === item
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t(`settings.contacts.tabs.${item}`)}
          </button>
        ))}
      </div>

      <Card className={FLEET_LIST_CARD}>
        <div className="border-b border-slate-200 p-3">
          <div className={FLEET_TOOLBAR}>
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('settings.contacts.searchPlaceholder')}
                className={cn(FLEET_FILTER_INPUT, 'pl-9')}
              />
            </div>

            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={cn(FLEET_FILTER_SELECT, 'w-full sm:w-[160px]')}
            >
              <option value="">{t('settings.contacts.filters.userStatus')}</option>
              <option value="active">{t('usersAdmin.statusActive')}</option>
              <option value="inactive">{t('usersAdmin.statusInactive')}</option>
            </Select>

            <Select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className={cn(FLEET_FILTER_SELECT, 'w-full sm:w-[160px]')}
            >
              <option value="">{t('settings.contacts.filters.userType')}</option>
              <option value="admin">{t('usersAdmin.roles.admin')}</option>
              <option value="boss">{t('usersAdmin.roles.boss')}</option>
              <option value="accounting">{t('usersAdmin.roles.accounting')}</option>
              <option value="office">{t('usersAdmin.roles.office')}</option>
              <option value="driver">{t('usersAdmin.roles.driver')}</option>
            </Select>

            <Select
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className={cn(FLEET_FILTER_SELECT, 'w-full sm:w-[160px]')}
            >
              <option value="">{t('settings.contacts.filters.group')}</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>

            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-sm text-slate-600">
                {t('settings.contacts.pagination', {
                  start: rangeStart,
                  end: rangeEnd,
                  total,
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled>
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <EmptyState icon={Users} title={t('settings.contacts.loadError')} subtitle={error} />
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title={t('settings.contacts.emptyTitle')}
              subtitle={t('settings.contacts.emptySubtitle')}
            />
          </div>
        ) : (
          <>
            <div className={FLEET_LIST_MOBILE}>
              {pageRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => router.push(`/settings/users/${row.id}`)}
                  className={FLEET_MOBILE_CARD}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
                      {contactInitials(row.full_name)}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate font-semibold text-slate-900">{row.full_name}</p>
                      <p className="truncate text-sm text-emerald-700">{row.email}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className={cn(FLEET_LIST_DESKTOP, FLEET_TABLE_SCROLL)}>
              <table className={FLEET_RAW_TABLE}>
                <thead className={FLEET_RAW_THEAD}>
                  <tr>
                    <th className="h-9 w-10 px-3 py-2">
                      <input type="checkbox" aria-label={t('settings.contacts.selectAll')} />
                    </th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.name')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.email')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.userStatus')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.userType')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.userRole')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.loginCount')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.classifications')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.group')}</th>
                    <th className={FLEET_RAW_TH}>{t('settings.contacts.columns.assignedVehicles')}</th>
                  </tr>
                </thead>
                <tbody className={FLEET_RAW_TBODY}>
                  {pageRows.map((row) => {
                    const classifications = [
                      row.profile.operator ? t('settings.contacts.classifications.operator') : null,
                      row.profile.employee ? t('settings.contacts.classifications.employee') : null,
                      row.profile.technician ? t('settings.contacts.classifications.technician') : null,
                    ].filter(Boolean);

                    return (
                      <tr
                        key={row.id}
                        className={cn(FLEET_RAW_TR, 'cursor-pointer')}
                        onClick={() => router.push(`/settings/users/${row.id}`)}
                      >
                        <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" aria-label={row.full_name} />
                        </td>
                        <td className={FLEET_RAW_TD_PRIMARY}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-xs font-semibold text-white">
                              {row.profile.profilePhotoDataUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={row.profile.profilePhotoDataUrl}
                                  alt=""
                                  className="h-9 w-9 rounded-full object-cover"
                                />
                              ) : (
                                contactInitials(row.full_name)
                              )}
                            </div>
                            <span>{row.full_name}</span>
                          </div>
                        </td>
                        <td className="text-emerald-700">{row.email}</td>
                        <td className={FLEET_RAW_TD}>
                          <span className="inline-flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-full', statusDotClass(row.status))} />
                            {row.status === 'active'
                              ? t('usersAdmin.statusActive')
                              : t('usersAdmin.statusInactive')}
                          </span>
                        </td>
                        <td className={FLEET_RAW_TD}>
                          {userTypeLabel(row) === '—' ? (
                            '—'
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {row.role === 'admin' ? (
                                <Globe className="h-3.5 w-3.5 text-slate-500" />
                              ) : null}
                              {userTypeLabel(row)}
                            </span>
                          )}
                        </td>
                        <td className={FLEET_RAW_TD_MUTED}>
                          {inferUserAccess(row.status, row.profile) === 'enabled'
                            ? roleLabel(row.role)
                            : '—'}
                        </td>
                        <td className={FLEET_RAW_TD_MUTED}>—</td>
                        <td className={FLEET_RAW_TD_MUTED}>
                          {classifications.length > 0 ? classifications.join(', ') : '—'}
                        </td>
                        <td className={FLEET_RAW_TD_MUTED}>{groupLabel(row.profile.group)}</td>
                        <td className={FLEET_RAW_TD_MUTED}>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
