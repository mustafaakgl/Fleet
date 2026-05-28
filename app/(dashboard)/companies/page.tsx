'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { companiesApi } from '@/lib/api';
import type { Company } from '@/lib/types';

export default function CompaniesPage() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await companiesApi.list({ limit: 100 });
      setCompanies(res.data);
    } catch (e) {
      setCompanies([]);
      setError(e instanceof Error ? e.message : 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('companies.title')}</h1>
        {!loading && !error && (
          <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
            {companies.length}
          </span>
        )}
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`company-skeleton-${index}`} className="grid grid-cols-6 gap-3">
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
              icon={Building2}
              title="Failed to load companies"
              subtitle={error}
              actionLabel="Retry"
              onAction={fetchCompanies}
            />
          </div>
        ) : companies.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Building2}
              title="No companies found"
              subtitle="No companies are available yet."
            />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {companies.map((company) => (
                <div
                  key={`company-card-${company.id}`}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="font-semibold text-slate-900">{company.name}</p>
                  <p className="text-xs text-slate-600">{company.contact_person || '-'}</p>
                  <p className="text-xs text-slate-600">
                    {company.active_assignments_count} Active Assignments
                  </p>
                  <p className="text-xs text-slate-600">
                    Drivers: {company.current_drivers_count ?? 0} · Vehicles:{' '}
                    {company.current_vehicles_count ?? 0}
                  </p>
                  <Link
                    href={`/companies/${company.id}`}
                    className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
                  >
                    {t('common.view')}
                  </Link>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('companies.companyName')}</TableHead>
                    <TableHead>{t('companies.contactPerson')}</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>{t('companies.currentDrivers')}</TableHead>
                    <TableHead>{t('companies.currentVehicles')}</TableHead>
                    <TableHead>{t('companies.activeAssignments')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-semibold text-gray-900">{company.name}</TableCell>
                      <TableCell>{company.contact_person || '-'}</TableCell>
                      <TableCell>{company.email || '-'}</TableCell>
                      <TableCell>{company.phone || '-'}</TableCell>
                      <TableCell>{company.current_drivers_count ?? 0}</TableCell>
                      <TableCell>{company.current_vehicles_count ?? 0}</TableCell>
                      <TableCell>{company.active_assignments_count}</TableCell>
                      <TableCell>
                        <Link
                          href={`/companies/${company.id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
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
    </div>
  );
}
