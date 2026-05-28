'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { companiesApi, documentsApi, accidentsApi, type CompanyStats } from '@/lib/api';
import type {
  CompanyDetail,
  CompanyEmail,
  Document,
} from '@/lib/types';
import { canViewFinancials } from '@/lib/permissions';
import { getUser } from '@/lib/auth';
import { formatDate, statusColor } from '@/lib/utils';

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
        <p className="text-lg text-gray-500">Company not found.</p>
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
                label="Active assignments"
                value={statsError ? '?' : String(stats?.active_assignments ?? '...')}
              />
              <HeaderStat
                label="Current drivers"
                value={statsError ? '?' : String(stats?.current_drivers ?? '...')}
              />
              <HeaderStat
                label="Current vehicles"
                value={statsError ? '?' : String(stats?.current_vehicles ?? '...')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Name" value={company.name} />
            <InfoItem label="Contact person" value={company.contact_person || '-'} />
            <InfoItem label="Email" value={company.email ?? '-'} />
            <InfoItem label="Phone" value={company.phone ?? '-'} />
            <InfoItem label="Address" value={company.address ?? '-'} />
            <InfoItem label="Notes" value={company.notes || '-'} />
            {showFinancials && (
              <InfoItem
                label="Default daily revenue"
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
          <CardTitle>Current assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsError ? (
            <p className="p-4 text-sm text-gray-500">Assignments could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Start time</TableHead>
                  <TableHead>End time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentAssignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  currentAssignments.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.workDate)}</TableCell>
                      <TableCell>
                        {row.driver.firstName} {row.driver.lastName}
                      </TableCell>
                      <TableCell>{row.vehicle.plateNumber}</TableCell>
                      <TableCell>{row.cargoName || '-'}</TableCell>
                      <TableCell>{row.startTime}</TableCell>
                      <TableCell>{row.endTime}</TableCell>
                      <TableCell>
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
          <CardTitle>Assignment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsError ? (
            <p className="p-4 text-sm text-gray-500">Assignments could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  assignmentHistory.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.workDate)}</TableCell>
                      <TableCell>
                        {row.driver.firstName} {row.driver.lastName}
                      </TableCell>
                      <TableCell>{row.vehicle.plateNumber}</TableCell>
                      <TableCell>{row.cargoName || '-'}</TableCell>
                      <TableCell>
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
          <CardTitle>Driver history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>First assignment</TableHead>
                <TableHead>Last assignment</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                driverHistory.map((row) => (
                  <TableRow key={row.driverId}>
                    <TableCell>{row.driverName}</TableCell>
                    <TableCell>{formatDate(row.firstAssignmentDate)}</TableCell>
                    <TableCell>{formatDate(row.lastAssignmentDate)}</TableCell>
                    <TableCell>{row.totalAssignments}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>First assignment</TableHead>
                <TableHead>Last assignment</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                vehicleHistory.map((row) => (
                  <TableRow key={row.vehicleId}>
                    <TableCell>{row.plateNumber}</TableCell>
                    <TableCell>{formatDate(row.firstAssignmentDate)}</TableCell>
                    <TableCell>{formatDate(row.lastAssignmentDate)}</TableCell>
                    <TableCell>{row.totalAssignments}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company email history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {emailsError ? (
            <p className="p-4 text-sm text-gray-500">Emails could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  emails.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{row.subject}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.lastSentAt ? formatDate(row.lastSentAt) : '-'}</TableCell>
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
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documentsError ? (
            <p className="p-4 text-sm text-gray-500">Documents could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document type</TableHead>
                  <TableHead>File name</TableHead>
                  <TableHead>Expiry date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.documentType}</TableCell>
                      <TableCell>{row.fileName}</TableCell>
                      <TableCell>{formatDate(row.expiryDate)}</TableCell>
                      <TableCell>
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
          <CardTitle>Cargo damage history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cargoDamagesError ? (
            <p className="p-4 text-sm text-gray-500">Cargo damages could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Cargo name</TableHead>
                  <TableHead>Status</TableHead>
                  {showFinancials && <TableHead>Damage value</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargoDamages.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showFinancials ? 6 : 5}
                      className="text-center text-sm text-gray-500"
                    >
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  cargoDamages.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.incidentDateTime)}</TableCell>
                      <TableCell>
                        {row.driver
                          ? `${row.driver.firstName} ${row.driver.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell>{row.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell>{row.cargoName ?? '-'}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      {showFinancials && (
                        <TableCell>{currency(row.damageValue)}</TableCell>
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
