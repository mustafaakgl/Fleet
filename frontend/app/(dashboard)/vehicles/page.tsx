'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Truck, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { vehiclesApi } from '@/lib/api';
import type { Vehicle } from '@/lib/types';
import { formatDate, statusColor } from '@/lib/utils';
import { VehiclePlateDisplay } from '@/components/vehicles/VehiclePlateDisplay';

export default function VehiclesPage() {
  const { t } = useTranslation();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('vehicles.title')}</h1>
          {!loading && (
            <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">{total}</span>
          )}
        </div>
        <Button asChild>
          <Link href="/vehicles/new">
            <Plus className="w-4 h-4 mr-2" />
            {t('vehicles.addVehicle')}
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('vehicles.searchByPlate')}
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">{t('vehicles.allStatuses')}</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="broken">Broken</option>
          <option value="maintenance">Maintenance</option>
        </Select>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`vehicle-skeleton-${index}`} className="grid grid-cols-6 gap-3">
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
              icon={Truck}
              title="Failed to load vehicles"
              subtitle={error}
              actionLabel="Retry"
              onAction={fetchVehicles}
            />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Truck}
              title="No vehicles found"
              subtitle="No vehicles match current filters."
              actionLabel="Clear filters"
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
              <div key={`vehicle-card-${v.id}`} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <VehiclePlateDisplay
                  vehicleId={v.id}
                  plate={v.plate_number}
                  photoUrl={v.photo_url}
                  brand={v.brand}
                  model={v.model}
                  href={`/vehicles/${v.id}`}
                  size="md"
                  onPhotoUploaded={(photoUrl) =>
                    setVehicles((prev) =>
                      prev.map((row) => (row.id === v.id ? { ...row, photo_url: photoUrl } : row)),
                    )
                  }
                />
                <div className="flex flex-col items-end gap-2">
                  <Badge className={statusColor(v.status)}>{v.status.replace('_', ' ')}</Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/vehicles/${v.id}`}>View</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('vehicles.plate')}</TableHead>
                <TableHead>{t('vehicles.brandModel')}</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>TÜV Expiry</TableHead>
                <TableHead>SP Expiry</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <VehiclePlateDisplay
                      vehicleId={v.id}
                      plate={v.plate_number}
                      photoUrl={v.photo_url}
                      href={`/vehicles/${v.id}`}
                      size="sm"
                      onPhotoUploaded={(photoUrl) =>
                        setVehicles((prev) =>
                          prev.map((row) => (row.id === v.id ? { ...row, photo_url: photoUrl } : row)),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>{v.brand} {v.model}</TableCell>
                  <TableCell>{v.year ?? '—'}</TableCell>
                  <TableCell>{formatDate(v.tuv_expiry_date)}</TableCell>
                  <TableCell>{formatDate(v.sp_expiry_date)}</TableCell>
                  <TableCell><Badge className={statusColor(v.status)}>{v.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/vehicles/${v.id}`}>View →</Link>
                    </Button>
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
          <p className="text-sm text-gray-500">Page {page} of {totalPages} · {total} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
