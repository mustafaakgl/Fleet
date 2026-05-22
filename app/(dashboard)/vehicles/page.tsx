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
import { filterMockVehicles } from '@/lib/mock-data';
import { formatDate, statusColor } from '@/lib/utils';

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
  const limit = 20;

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehiclesApi.list({ search, status: status || undefined, page, limit });
      if (res.total > 0 || res.data.length > 0) {
        setVehicles(res.data);
        setTotal(res.total);
      } else {
        const mock = filterMockVehicles(search, status, page, limit);
        setVehicles(mock.data);
        setTotal(mock.total);
      }
    } catch {
      const mock = filterMockVehicles(search, status, page, limit);
      setVehicles(mock.data);
      setTotal(mock.total);
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
          <option value="in_service">In Service</option>
          <option value="sold">Sold</option>
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
              <div key={`vehicle-card-${v.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-semibold text-slate-900">{v.plate_number}</p>
                <p className="text-xs text-slate-600">{v.brand} {v.model}</p>
                <p className="text-xs text-slate-600">Status: {v.status.replace('_', ' ')}</p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/vehicles/${v.id}`}>View</Link>
                </Button>
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
                  <TableCell className="font-semibold text-gray-900">{v.plate_number}</TableCell>
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
