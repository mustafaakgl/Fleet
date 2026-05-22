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
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    const rawStatus = searchParams.get('status') || '';
    const mappedStatus = rawStatus === 'in_use' ? 'active' : rawStatus;
    setStatus(mappedStatus);
    setPage(1);
  }, [searchParams]);

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
          <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-16 text-gray-500"><Truck className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No vehicles found</p></div>
        ) : (
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
