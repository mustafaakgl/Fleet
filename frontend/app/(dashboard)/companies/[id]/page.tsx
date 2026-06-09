'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronLeft, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DocumentFileLink } from '@/components/documents/DocumentFileLink';
import { companiesApi, documentsApi, accidentsApi, type CompanyStats } from '@/lib/api';
import type {
  CompanyDetail,
  CompanyEmail,
  Document,
} from '@/lib/types';
import { canViewFinancials } from '@/lib/permissions';
import { getUser } from '@/lib/auth';
import {
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { cn, formatDate, statusColor } from '@/lib/utils';

interface CompanyAssignmentRow {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  status: string;
  cargoName?: string;
  routeName?: string | null;
  notes?: string | null;
  driver: { id: string; firstName: string; lastName: string };
  vehicle: { id: string; plateNumber: string };
}

interface CompanyIncidentRow {
  id: string;
  type: 'vehicle_accident' | 'cargo_damage';
  incidentDateTime: string;
  cargoName?: string | null;
  cargoOwner?: string | null;
  damageValue?: number | string | null;
  status: string;
  driver?: { firstName: string; lastName: string };
  vehicle?: { plateNumber: string };
}

function currency(value?: number | string | null) {
  if (value === null || value === undefined) return '-';
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CompanyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslation();

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<CompanyAssignmentRow[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [emailsError, setEmailsError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [cargoDamages, setCargoDamages] = useState<CompanyIncidentRow[]>([]);
  const [cargoDamagesError, setCargoDamagesError] = useState<string | null>(null);

  const [showFinancials, setShowFinancials] = useState(false);

  useEffect(() => {
    const user = getUser();
    setShowFinancials(user ? canViewFinancials(user.role) : false);
  }, []);

  useEffect(() => {
    companiesApi
      .getById(id)
      .then(setCompany)
      .catch((e) => setCompanyError(e?.message ?? 'Failed'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    companiesApi
      .getStats(id)
      .then(setStats)
      .catch((e) => setStatsError(e?.message ?? 'Failed'));
    companiesApi
      .getAssignments(id)
      .then((rows) => setAssignments(rows as CompanyAssignmentRow[]))
      .catch((e) => setAssignmentsError(e?.message ?? 'Failed'));
    companiesApi
      .getEmailHistory(id)
      .then(setEmails)
      .catch((e) => setEmailsError(e?.message ?? 'Failed'));
    documentsApi
      .list('company', id)
      .then(setDocuments)
      .catch((e) => setDocumentsError(e?.message ?? 'Failed'));
    accidentsApi
      .listByCompany(id)
      .then((rows) => {
        const all = rows as CompanyIncidentRow[];
        setCargoDamages(all.filter((r) => r.type === 'cargo_damage'));
      })
      .catch((e) => setCargoDamagesError(e?.message ?? 'Failed'));
  }, [id]);

  const currentAssignments = useMemo(
    () =>
      assignments.filter(
        (a) => a.status === 'planned' || a.status === 'confirmed' || a.status === 'in_progress',
      ),
    [assignments],
  );
  const assignmentHistory = useMemo(
    () => assignments.filter((a) => a.status === 'completed' || a.status === 'cancelled'),
    [assignments],
  );

  const driverHistory = useMemo(() => {
    const map: Record<string, { name: string; first: string; last: string; total: number }> = {};
    for (const a of assignments) {
      const k = a.driver.id;
      const name = `${a.driver.firstName} ${a.driver.lastName}`.trim();
      if (!map[k]) {
        map[k] = { name, first: a.workDate, last: a.workDate, total: 1 };
      } else {
        map[k] = {
          name,
          first: a.workDate < map[k].first ? a.workDate : map[k].first,
          last: a.workDate > map[k].last ? a.workDate : map[k].last,
          total: map[k].total + 1,
        };
      }
    }
    return Object.entries(map).map(([driverId, v]) => ({
      driverId,
      driverName: v.name,
      firstAssignmentDate: v.first,
      lastAssignmentDate: v.last,
      totalAssignments: v.total,
    }));
  }, [assignments]);

  const vehicleHistory = useMemo(() => {
    const map: Record<string, { plate: string; first: string; last: string; total: number }> = {};
    for (const a of assignments) {
      const k = a.vehicle.id;
      if (!map[k]) {
        map[k] = { plate: a.vehicle.plateNumber, first: a.workDate, last: a.workDate, total: 1 };
      } else {
        map[k] = {
          plate: a.vehicle.plateNumber,
          first: a.workDate < map[k].first ? a.workDate : map[k].first,
          last: a.workDate > map[k].last ? a.workDate : map[k].last,
          total: map[k].total + 1,
        };
      }
    }
    return Object.entries(map).map(([vehicleId, v]) => ({
      vehicleId,
      plateNumber: v.plate,
      firstAssignmentDate: v.first,
      lastAssignmentDate: v.last,
      totalAssignments: v.total,
    }));
  }, [assignments]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (companyError || !company) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg text-gray-500">{t('form.companyNotFound')}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/companies">{t('common.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/companies">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Link>
      </Button>

      <Card className="border-blue-200">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
              </div>
              <p className="text-sm text-gray-600">
                {company.contact_person || '-'} | {company.email ?? '-'} | {company.phone ?? '-'}
              </p>
              <p className="text-sm text-gray-600">{company.address ?? '-'}</p>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <HeaderStat
                label={t('companyDetail.hdrActiveAssignments')}
                value={statsError ? '?' : String(stats?.active_assignments ?? '...')}
              />
              <HeaderStat
                label={t('companyDetail.hdrCurrentDrivers')}
                value={statsError ? '?' : String(stats?.current_drivers ?? '...')}
              />
              <HeaderStat
                label={t('companyDetail.hdrCurrentVehicles')}
                value={statsError ? '?' : String(stats?.current_vehicles ?? '...')}
              />
            </div>

            <Button variant="outline" size="sm" asChild>
              <Link href={`/companies/${id}/edit`}>
                <span className="inline-flex items-center">
                  <Pencil className="mr-1 h-4 w-4" />
                  {t('companyDetail.edit')}
                </span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.companyInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label={t('companyDetail.name')} value={company.name} />
            <InfoItem label={t('companyDetail.contactPerson')} value={company.contact_person || '-'} />
            <InfoItem label={t('companyDetail.email')} value={company.email ?? '-'} />
            <InfoItem label={t('companyDetail.phone')} value={company.phone ?? '-'} />
            <InfoItem label={t('companyDetail.address')} value={company.address ?? '-'} />
            <InfoItem label={t('companyDetail.notes')} value={company.notes || '-'} />
            {showFinancials && (
              <InfoItem
                label={t('companyDetail.defaultDailyRevenue')}
                value={
                  company.default_daily_revenue !== null && company.default_daily_revenue !== undefined
                    ? currency(company.default_daily_revenue)
                    : '-'
                }
              />
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.currentAssignments')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('companyDetail.assignmentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDriver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colVehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colCargo')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colStartTime')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colEndTime')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {currentAssignments.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={7} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  currentAssignments.map((row) => (
                    <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.workDate)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.driver.firstName} {row.driver.lastName}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.vehicle.plateNumber}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.cargoName || '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.startTime}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.endTime}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={statusColor(row.status)}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.assignmentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('companyDetail.assignmentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDriver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colVehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colCargo')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {assignmentHistory.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={5} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  assignmentHistory.map((row) => (
                    <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.workDate)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.driver.firstName} {row.driver.lastName}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.vehicle.plateNumber}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.cargoName || '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={statusColor(row.status)}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.driverHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDriver')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colFirstAssignment')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colLastAssignment')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colTotal')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {driverHistory.length === 0 ? (
                <TableRow className={FLEET_TABLE_ROW}>
                  <TableCell colSpan={4} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                driverHistory.map((row) => (
                  <TableRow className={FLEET_TABLE_ROW} key={row.driverId}>
                    <TableCell className={FLEET_TABLE_CELL}>{row.driverName}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.firstAssignmentDate)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.lastAssignmentDate)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{row.totalAssignments}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.vehicleHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colVehicle')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colFirstAssignment')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colLastAssignment')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colTotal')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {vehicleHistory.length === 0 ? (
                <TableRow className={FLEET_TABLE_ROW}>
                  <TableCell colSpan={4} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                vehicleHistory.map((row) => (
                  <TableRow className={FLEET_TABLE_ROW} key={row.vehicleId}>
                    <TableCell className={FLEET_TABLE_CELL}>{row.plateNumber}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.firstAssignmentDate)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.lastAssignmentDate)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{row.totalAssignments}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.emailHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {emailsError ? (
            <p className="p-4 text-sm text-gray-500">{t('companyDetail.emailsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colSubject')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colStatus')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colLastSent')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {emails.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={4} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  emails.map((row) => (
                    <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.date)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.subject}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={statusColor(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.lastSentAt ? formatDate(row.lastSentAt) : '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.documents')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('companyDetail.documentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDocType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colFileName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colExpiryDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {documents.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={4} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((row) => (
                    <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{row.documentType}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <DocumentFileLink document={row} variant="link" />
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.expiryDate)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={statusColor(row.status)}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyDetail.cargoHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cargoDamagesError ? (
            <p className="p-4 text-sm text-gray-500">{t('companyDetail.cargoLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDriver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colVehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colCargoName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colStatus')}</TableHead>
                  {showFinancials && <TableHead className={FLEET_TABLE_HEAD}>{t('companyDetail.colDamageValue')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {cargoDamages.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showFinancials ? 6 : 5}
                      className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}
                    >
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  cargoDamages.map((row) => (
                    <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.incidentDateTime)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.driver
                          ? `${row.driver.firstName} ${row.driver.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.cargoName ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.status}</TableCell>
                      {showFinancials && (
                        <TableCell className={FLEET_TABLE_CELL}>{currency(row.damageValue)}</TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <dt className="text-xs font-semibold uppercase text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}
