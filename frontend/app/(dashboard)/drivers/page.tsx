'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Users, Plus, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DriverActionsMenu } from '@/components/drivers/DriverActionsMenu';
import { DriverImportDialog } from '@/components/drivers/DriverImportDialog';
import { LicenseComplianceBadgePill } from '@/components/license-checks/LicenseComplianceBadge';
import { driversApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { downloadDriversCsv } from '@/lib/drivers-csv';
import { canImportCsv } from '@/lib/permissions';
import type { Driver } from '@/lib/types';
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
  FLEET_LINK_ACTION,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import { cn, fullName } from '@/lib/utils';

export default function DriversPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const user = getUser();
  const canImport = canImportCsv(user?.role ?? 'customer');

  const limit = 20;

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await driversApi.list({ search, status: status || undefined, page, limit });
      setDrivers(res.data);
      setTotal(res.total);
    } catch (e) {
      setDrivers([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    const t = setTimeout(fetchDrivers, 300);
    return () => clearTimeout(t);
  }, [fetchDrivers]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function handleExport() {
    const allDrivers: Driver[] = [];
    let exportPage = 1;
    const exportLimit = 200;

    while (true) {
      const res = await driversApi.list({
        search,
        status: status || undefined,
        page: exportPage,
        limit: exportLimit,
      });
      allDrivers.push(...res.data);
      if (allDrivers.length >= res.total || res.data.length === 0) break;
      exportPage += 1;
    }

    if (allDrivers.length > 0) {
      downloadDriversCsv(allDrivers);
    }
  }

  function openDriver(id: string) {
    router.push(`/drivers/${id}`);
  }

  function riskDot(risk: string) {
    const colors: Record<string, string> = {
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      red: 'bg-red-500',
    };
    return <span className={`inline-block h-2 w-2 rounded-full ${colors[risk] ?? 'bg-gray-400'}`} />;
  }

  function driverStatusLabel(value: string) {
    return t(`form.driverStatus.${value}`, { defaultValue: value.replace('_', ' ') });
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <Users className="h-5 w-5 shrink-0 text-blue-600 sm:h-6 sm:w-6" />
          <h1 className={FLEET_PAGE_TITLE}>{t('drivers.title')}</h1>
          {!loading && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">{total}</span>
          )}
        </div>
        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void handleExport()}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv')}
          </Button>
          <DriverActionsMenu
            canImport={canImport}
            onImport={() => setImportOpen(true)}
            onExport={() => void handleExport()}
            showExport={false}
          />
          <Button asChild className="w-full sm:w-auto">
            <Link href="/drivers/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('drivers.addDriver')}
            </Link>
          </Button>
        </div>
      </div>

      <DriverImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void fetchDrivers()}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('drivers.searchByName')}
            className={cn('pl-9', FLEET_FILTER_INPUT)}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={cn('w-40', FLEET_FILTER_SELECT)}
        >
          <option value="">{t('drivers.allStatuses')}</option>
          <option value="active">{driverStatusLabel('active')}</option>
          <option value="inactive">{driverStatusLabel('inactive')}</option>
          <option value="on_leave">{driverStatusLabel('on_leave')}</option>
          <option value="sick">{driverStatusLabel('sick')}</option>
          <option value="terminated">{driverStatusLabel('terminated')}</option>
        </Select>
      </div>

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`driver-skeleton-${index}`} className="grid grid-cols-6 gap-3">
                <Skeleton className="h-9" />
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
              icon={Users}
              title={t('drivers.loadFailedTitle')}
              subtitle={error}
              actionLabel={t('errors.retry')}
              onAction={fetchDrivers}
            />
          </div>
        ) : drivers.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title={t('drivers.emptyTitle')}
              subtitle={t('drivers.emptySubtitle')}
              actionLabel={t('common.clearFilters')}
              onAction={() => {
                setSearch('');
                setStatus('');
                setPage(1);
              }}
            />
          </div>
        ) : (
          <>
          <div className="md:hidden space-y-3 p-3">
            {drivers.map((d) => (
              <div
                key={`driver-card-${d.id}`}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50"
                onClick={() => openDriver(d.id)}
              >
                <p className="font-semibold text-slate-900">{fullName(d.first_name, d.last_name)}</p>
                <p className="text-xs text-slate-600">{t('form.phone')}: {d.phone ?? '—'}</p>
                <p className="text-xs text-slate-600">{t('common.status')}: {driverStatusLabel(d.status)}</p>
                <div className="mt-2 flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/drivers/${d.id}`}>{t('common.view')}</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/drivers/${d.id}/edit`}>{t('common.edit')}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('drivers.driverName')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>Phone</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('drivers.currentVehicle')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('drivers.currentCompany')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('drivers.accidentCount')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('drivers.riskScore')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>FS</TableHead>
                <TableHead className={cn(FLEET_TABLE_HEAD, 'w-24')} />
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {drivers.map((d) => (
                <TableRow
                  key={d.id}
                  className={FLEET_TABLE_ROW_CLICKABLE}
                  onClick={() => openDriver(d.id)}
                >
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                    {fullName(d.first_name, d.last_name)}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL_MUTED}>{d.phone ?? '—'}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL_MUTED}>{d.current_vehicle_plate ?? '—'}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL_MUTED}>{d.current_company_name ?? '—'}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>{d.accident_count}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      {riskDot(d.risk_level)}
                      {d.risk_level}
                    </span>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <LicenseComplianceBadgePill badge={d.license_compliance_badge} />
                  </TableCell>
                  <TableCell
                    className={cn(FLEET_TABLE_CELL, 'text-right')}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Link href={`/drivers/${d.id}`} className={FLEET_LINK_ACTION}>
                      {t('common.view')}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-gray-500">
            {t('common.pageOfTotal', { page, total: totalPages, count: total })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
