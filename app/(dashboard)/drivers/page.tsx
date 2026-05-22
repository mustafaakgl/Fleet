'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Users, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { driversApi } from '@/lib/api';
import type { Driver } from '@/lib/types';
import { filterMockDrivers, mockDriverDetails } from '@/lib/mock-data';
import { fullName } from '@/lib/utils';

export default function DriversPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [loading, setLoading] = useState(true);

  const limit = 20;

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await driversApi.list({ search, status: status || undefined, page, limit });
      if (res.total > 0 || res.data.length > 0) {
        setDrivers(res.data);
        setTotal(res.total);
      } else {
        const mock = filterMockDrivers(search, status, page, limit);
        setDrivers(mock.data);
        setTotal(mock.total);
      }
    } catch {
      const mock = filterMockDrivers(search, status, page, limit);
      setDrivers(mock.data);
      setTotal(mock.total);
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    const t = setTimeout(fetchDrivers, 300);
    return () => clearTimeout(t);
  }, [fetchDrivers]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function getCurrentInfo(driverId: string) {
    const detail = mockDriverDetails[driverId];
    const assignment = detail?.recent_assignments?.[0];
    return {
      vehicle: assignment?.vehicle.plate_number ?? '—',
      company: assignment?.company_name ?? '—',
    };
  }

  function riskDot(risk: string) {
    const colors: Record<string, string> = {
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      red: 'bg-red-500',
    };
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[risk] ?? 'bg-gray-400'}`} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('drivers.title')}</h1>
          {!loading && (
            <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">{total}</span>
          )}
        </div>
        <Button asChild>
          <Link href="/drivers/new">
            <Plus className="w-4 h-4 mr-2" />
            {t('drivers.addDriver')}
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('drivers.searchByName')}
            className="pl-9"
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
          className="w-40"
        >
          <option value="">{t('drivers.allStatuses')}</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="on_leave">On Leave</option>
          <option value="sick">Sick</option>
          <option value="terminated">Terminated</option>
        </Select>
      </div>

      <Card>
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
        ) : drivers.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title="No drivers found"
              subtitle="No drivers match current filters."
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
          <div className="md:hidden space-y-3 p-3">
            {drivers.map((d) => (
              <div key={`driver-card-${d.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-semibold text-slate-900">{fullName(d.first_name, d.last_name)}</p>
                <p className="text-xs text-slate-600">Phone: {d.phone ?? '—'}</p>
                <p className="text-xs text-slate-600">Status: {d.status}</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/drivers/${d.id}`}>View</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/drivers/${d.id}/edit`}>Edit</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('drivers.driverName')}</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>{t('drivers.currentVehicle')}</TableHead>
                <TableHead>{t('drivers.currentCompany')}</TableHead>
                <TableHead>{t('drivers.accidentCount')}</TableHead>
                <TableHead>{t('drivers.riskScore')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-gray-900">{fullName(d.first_name, d.last_name)}</TableCell>
                  <TableCell>{d.phone ?? '—'}</TableCell>
                  <TableCell>{getCurrentInfo(d.id).vehicle}</TableCell>
                  <TableCell>{getCurrentInfo(d.id).company}</TableCell>
                  <TableCell>{d.accident_count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {riskDot(d.risk_level)}
                      <span className="text-xs capitalize text-gray-600">{d.risk_level}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/drivers/${d.id}`}>View</Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/drivers/${d.id}/edit`}>Edit</Link>
                      </Button>
                    </div>
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
