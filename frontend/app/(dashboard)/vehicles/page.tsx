'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Truck, Plus, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { VehicleActionsMenu } from '@/components/vehicles/VehicleActionsMenu';
import { VehicleImportDialog } from '@/components/vehicles/VehicleImportDialog';
import { vehiclesApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { canImportCsv } from '@/lib/permissions';
import { downloadVehiclesCsv } from '@/lib/vehicles-csv';
import type { Vehicle } from '@/lib/types';
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
  FLEET_LINK_ACTION,
  FLEET_LIST_CARD,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import { cn, formatDate, statusColor } from '@/lib/utils';
import { VehiclePlateDisplay } from '@/components/vehicles/VehiclePlateDisplay';

function vehicleStatusDot(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500';
    case 'maintenance':
      return 'bg-amber-500';
    case 'broken':
      return 'bg-red-500';
    default:
      return 'bg-slate-400';
  }
}

export default function VehiclesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => {
    const rawStatus = searchParams.get('status') || '';
    return rawStatus === 'in_use' ? 'active' : rawStatus;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const user = getUser();
  const canImport = canImportCsv(user?.role ?? 'customer');

  const limit = 20;

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await vehiclesApi.list({ search, status: status || undefined, page, limit });
      setVehicles(res.data);
      setTotal(res.total);
    } catch (e) {
      setVehicles([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    const t = setTimeout(fetchVehicles, 300);
    return () => clearTimeout(t);
  }, [fetchVehicles]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function openVehicle(id: string) {
    router.push(`/vehicles/${id}`);
  }

  async function handleExport() {
    const allVehicles: Vehicle[] = [];
    let exportPage = 1;
    const exportLimit = 200;

    while (true) {
      const res = await vehiclesApi.list({
        search,
        status: status || undefined,
        page: exportPage,
        limit: exportLimit,
      });
      allVehicles.push(...res.data);
      if (allVehicles.length >= res.total || res.data.length === 0) break;
      exportPage += 1;
    }

    if (allVehicles.length > 0) {
      downloadVehiclesCsv(allVehicles);
    }
  }

  function vehicleStatusLabel(value: string) {
    return t(`form.vehicleStatus.${value}`, { defaultValue: value.replace('_', ' ') });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Truck className="h-5 w-5 shrink-0 text-purple-600 sm:h-6 sm:w-6" />
          <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{t('vehicles.title')}</h1>
          {!loading && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">{total}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void handleExport()}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv')}
          </Button>
          <VehicleActionsMenu
            canImport={canImport}
            onImport={() => setImportOpen(true)}
            onExport={() => void handleExport()}
            showExport={false}
          />
          <Button asChild className="w-full sm:w-auto">
            <Link href="/vehicles/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('vehicles.addVehicle')}
            </Link>
          </Button>
        </div>
      </div>

      <VehicleImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void fetchVehicles()}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t('vehicles.searchByPlate')}
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
          <option value="">{t('vehicles.allStatuses')}</option>
          <option value="active">{vehicleStatusLabel('active')}</option>
          <option value="inactive">{vehicleStatusLabel('inactive')}</option>
          <option value="broken">{vehicleStatusLabel('broken')}</option>
          <option value="maintenance">{vehicleStatusLabel('maintenance')}</option>
        </Select>
      </div>

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`vehicle-skeleton-${index}`} className="grid grid-cols-6 gap-2">
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
              icon={Truck}
              title={t('vehicles.loadFailedTitle')}
              subtitle={error}
              actionLabel={t('errors.retry')}
              onAction={fetchVehicles}
            />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Truck}
              title={t('vehicles.emptyTitle')}
              subtitle={t('vehicles.emptySubtitle')}
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
          <div className="space-y-3 p-3 md:hidden">
            {vehicles.map((v) => (
              <div
                key={`vehicle-card-${v.id}`}
                className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50"
                onClick={() => openVehicle(v.id)}
              >
                <VehiclePlateDisplay
                  vehicleId={v.id}
                  plate={v.plate_number}
                  photoUrl={v.photo_url}
                  brand={v.brand}
                  model={v.model}
                  size="md"
                  onPhotoUploaded={(photoUrl) =>
                    setVehicles((prev) =>
                      prev.map((row) => (row.id === v.id ? { ...row, photo_url: photoUrl } : row)),
                    )
                  }
                />
                <div className="flex flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
                  <Badge className={statusColor(v.status)}>{vehicleStatusLabel(v.status)}</Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/vehicles/${v.id}`}>{t('common.view')}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicles.plate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>Year</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>TÜV Expiry</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>SP Expiry</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('common.status')}</TableHead>
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'w-[72px]')} />
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {vehicles.map((v) => (
                  <TableRow
                    key={v.id}
                    className={FLEET_TABLE_ROW_CLICKABLE}
                    onClick={() => openVehicle(v.id)}
                  >
                    <TableCell className={FLEET_TABLE_CELL}>
                      <VehiclePlateDisplay
                        vehicleId={v.id}
                        plate={v.plate_number}
                        photoUrl={v.photo_url}
                        brand={v.brand}
                        model={v.model}
                        layout="inline"
                        size="sm"
                        onPhotoUploaded={(photoUrl) =>
                          setVehicles((prev) =>
                            prev.map((row) => (row.id === v.id ? { ...row, photo_url: photoUrl } : row)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{v.year ?? '—'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>
                      {formatDate(v.tuv_expiry_date)}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>
                      {formatDate(v.sp_expiry_date)}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <span
                          className={cn('inline-block h-2 w-2 rounded-full', vehicleStatusDot(v.status))}
                          aria-hidden
                        />
                        {vehicleStatusLabel(v.status)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(FLEET_TABLE_CELL, 'text-right')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link href={`/vehicles/${v.id}`} className={FLEET_LINK_ACTION}>
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
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
