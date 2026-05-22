'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCompanies, getCompanyAssignments, getCompanyCurrentStats } from '@/lib/companies';
import { EmptyState } from '@/components/ui/empty-state';

export default function CompaniesPage() {
  const { t } = useTranslation();
  const companies = getCompanies();

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('companies.title')}</h1>
      </div>

      <Card>
        {companies.length === 0 ? (
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
          {companies.map((company) => {
            const stats = getCompanyCurrentStats(company.id);
            const activeAssignments = getCompanyAssignments(company.id).filter(
              (row) => row.status === 'in_progress' || row.status === 'planned',
            ).length;
            return (
              <div key={`company-card-${company.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-semibold text-slate-900">{company.name}</p>
                <p className="text-xs text-slate-600">{company.contactPerson || '-'}</p>
                <p className="text-xs text-slate-600">{activeAssignments} Active Assignments</p>
                <p className="text-xs text-slate-600">Drivers: {stats.currentDrivers} · Vehicles: {stats.currentVehicles}</p>
                <Link href={`/companies/${company.id}`} className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
                  {t('common.view')}
                </Link>
              </div>
            );
          })}
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
            {companies.map((company) => {
              const stats = getCompanyCurrentStats(company.id);
              const activeAssignments = getCompanyAssignments(company.id).filter(
                (row) => row.status === 'in_progress' || row.status === 'planned',
              ).length;

              return (
                <TableRow key={company.id}>
                  <TableCell className="font-semibold text-gray-900">{company.name}</TableCell>
                  <TableCell>{company.contactPerson || '-'}</TableCell>
                  <TableCell>{company.email}</TableCell>
                  <TableCell>{company.phone}</TableCell>
                  <TableCell>{stats.currentDrivers}</TableCell>
                  <TableCell>{stats.currentVehicles}</TableCell>
                  <TableCell>{activeAssignments}</TableCell>
                  <TableCell>
                    <Link href={`/companies/${company.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {t('common.view')}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        </>
        )}
      </Card>
    </div>
  );
}
