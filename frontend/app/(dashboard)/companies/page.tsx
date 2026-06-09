'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { CompanyActionsMenu } from '@/components/companies/CompanyActionsMenu';
import { CompanyImportDialog } from '@/components/companies/CompanyImportDialog';
import { companiesApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { downloadCompaniesCsv } from '@/lib/companies-csv';
import { canImportCsv } from '@/lib/permissions';
import type { Company } from '@/lib/types';
import {
  FLEET_LINK_ACTION,
  FLEET_LIST_CARD,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

export default function CompaniesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const user = getUser();
  const canImport = canImportCsv(user?.role ?? 'customer');

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

  function openCompany(id: string) {
    router.push(`/companies/${id}`);
  }

  async function handleExport() {
    const allCompanies: Company[] = [];
    let exportPage = 1;
    const exportLimit = 200;

    while (true) {
      const res = await companiesApi.list({ page: exportPage, limit: exportLimit });
      allCompanies.push(...res.data);
      if (allCompanies.length >= res.total || res.data.length === 0) break;
      exportPage += 1;
    }

    if (allCompanies.length > 0) {
      downloadCompaniesCsv(allCompanies);
    }
  }

  return (
    <div className="space-y-4 pb-4 sm:space-y-5 sm:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Building2 className="h-5 w-5 shrink-0 text-blue-600 sm:h-6 sm:w-6" />
          <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{t('companies.title')}</h1>
          {!loading && !error && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">
              {companies.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CompanyActionsMenu
            canImport={canImport}
            onImport={() => setImportOpen(true)}
            onExport={() => void handleExport()}
          />
          <Button asChild className="w-full sm:w-auto">
            <Link href="/companies/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('form.addCompany')}
            </Link>
          </Button>
        </div>
      </div>

      <CompanyImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void fetchCompanies()}
      />

      <Card className={FLEET_LIST_CARD}>
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
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50"
                  onClick={() => openCompany(company.id)}
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
                  <span
                    className="mt-2 inline-block text-sm font-medium text-blue-600"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Link href={`/companies/${company.id}`}>{t('common.view')}</Link>
                  </span>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('companies.companyName')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('companies.contactPerson')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>Email</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>Phone</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('companies.currentDrivers')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('companies.currentVehicles')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('companies.activeAssignments')}</TableHead>
                    <TableHead className={cn(FLEET_TABLE_HEAD, 'w-24')} />
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {companies.map((company) => (
                    <TableRow
                      key={company.id}
                      className={FLEET_TABLE_ROW_CLICKABLE}
                      onClick={() => openCompany(company.id)}
                    >
                      <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{company.name}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>{company.contact_person || '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>{company.email || '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>{company.phone || '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{company.current_drivers_count ?? 0}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{company.current_vehicles_count ?? 0}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{company.active_assignments_count}</TableCell>
                      <TableCell
                        className={cn(FLEET_TABLE_CELL, 'text-right')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Link href={`/companies/${company.id}`} className={FLEET_LINK_ACTION}>
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
