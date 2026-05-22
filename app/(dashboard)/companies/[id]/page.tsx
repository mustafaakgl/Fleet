'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  canCurrentUserViewFinancials,
  getCompanyAssignments,
  getCompanyById,
  getCompanyCargoDamages,
  getCompanyCurrentStats,
  getCompanyDocuments,
  getCompanyDriverHistory,
  getCompanyEmailHistory,
  getCompanyVehicleHistory,
} from '@/lib/companies';
import { mockDrivers, mockVehicles } from '@/lib/mock-data';

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function statusBadge(status: string) {
  if (status === 'in_progress' || status === 'approved' || status === 'sent') return 'bg-emerald-100 text-emerald-700';
  if (status === 'planned' || status === 'pending' || status === 'under_review') return 'bg-amber-100 text-amber-700';
  if (status === 'cancelled' || status === 'rejected' || status === 'failed') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

export default function CompanyProfilePage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const company = getCompanyById(params.id);
  const showFinancials = canCurrentUserViewFinancials();

  const assignments = useMemo(() => {
    if (!company) return [];
    return getCompanyAssignments(company.id);
  }, [company]);

  const currentAssignments = assignments.filter((item) => item.status === 'in_progress' || item.status === 'planned');
  const assignmentHistory = assignments.filter((item) => item.status === 'completed' || item.status === 'cancelled');

  const driverHistory = company ? getCompanyDriverHistory(company.id) : [];
  const vehicleHistory = company ? getCompanyVehicleHistory(company.id) : [];
  const emailHistory = company ? getCompanyEmailHistory(company.id) : [];
  const documents = company ? getCompanyDocuments(company.id) : [];
  const cargoDamageHistory = company ? getCompanyCargoDamages(company.id) : [];
  const stats = company ? getCompanyCurrentStats(company.id) : { activeAssignments: 0, currentDrivers: 0, currentVehicles: 0 };

  if (!company) {
    return <div className="text-sm text-gray-600">Company not found.</div>;
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
                {company.contactPerson || '-'} | {company.email} | {company.phone}
              </p>
              <p className="text-sm text-gray-600">{company.address}</p>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <HeaderStat label="Current active assignments" value={String(stats.activeAssignments)} />
              <HeaderStat label="Current drivers" value={String(stats.currentDrivers)} />
              <HeaderStat label="Current vehicles" value={String(stats.currentVehicles)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Name" value={company.name} />
            <InfoItem label="Contact person" value={company.contactPerson || '-'} />
            <InfoItem label="Email" value={company.email} />
            <InfoItem label="Phone" value={company.phone} />
            <InfoItem label="Address" value={company.address} />
            <InfoItem label="Notes" value={company.notes || '-'} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Status</TableHead>
                {showFinancials && <TableHead>Expected Revenue</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentAssignments.map((row) => {
                const driver = mockDrivers.find((item) => item.id === row.driverId);
                const vehicle = mockVehicles.find((item) => item.id === row.vehicleId);
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{driver ? `${driver.first_name} ${driver.last_name}` : row.driverId}</TableCell>
                    <TableCell>{vehicle?.plate_number ?? row.vehicleId}</TableCell>
                    <TableCell>{row.route}</TableCell>
                    <TableCell>{row.startTime}</TableCell>
                    <TableCell>{row.endTime}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                    </TableCell>
                    {showFinancials && <TableCell>{currency(row.expectedRevenue)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Status</TableHead>
                {showFinancials && <TableHead>Revenue</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignmentHistory.map((row) => {
                const driver = mockDrivers.find((item) => item.id === row.driverId);
                const vehicle = mockVehicles.find((item) => item.id === row.vehicleId);
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{driver ? `${driver.first_name} ${driver.last_name}` : row.driverId}</TableCell>
                    <TableCell>{vehicle?.plate_number ?? row.vehicleId}</TableCell>
                    <TableCell>{row.route}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                    </TableCell>
                    {showFinancials && <TableCell>{currency(row.expectedRevenue)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>First Assignment Date</TableHead>
                <TableHead>Last Assignment Date</TableHead>
                <TableHead>Total Assignments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverHistory.map((row) => (
                <TableRow key={row.driverId}>
                  <TableCell>{row.driverName}</TableCell>
                  <TableCell>{row.firstAssignmentDate}</TableCell>
                  <TableCell>{row.lastAssignmentDate}</TableCell>
                  <TableCell>{row.totalAssignments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>First Assignment Date</TableHead>
                <TableHead>Last Assignment Date</TableHead>
                <TableHead>Total Assignments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleHistory.map((row) => (
                <TableRow key={row.vehicleId}>
                  <TableCell>{row.plateNumber}</TableCell>
                  <TableCell>{row.firstAssignmentDate}</TableCell>
                  <TableCell>{row.lastAssignmentDate}</TableCell>
                  <TableCell>{row.totalAssignments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Email History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailHistory.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.subject}</TableCell>
                  <TableCell>{row.recipient}</TableCell>
                  <TableCell>
                    <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>{row.lastSent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Type</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.documentType}</TableCell>
                  <TableCell>{row.fileName}</TableCell>
                  <TableCell>{row.expiryDate || '-'}</TableCell>
                  <TableCell>
                    <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cargo Damage History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Cargo Name</TableHead>
                <TableHead>Status</TableHead>
                {showFinancials && <TableHead>Damage Value</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargoDamageHistory.map((row) => {
                const driver = mockDrivers.find((item) => item.id === row.driverId);
                const vehicle = mockVehicles.find((item) => item.id === row.vehicleId);

                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{driver ? `${driver.first_name} ${driver.last_name}` : row.driverId}</TableCell>
                    <TableCell>{vehicle?.plate_number ?? row.vehicleId}</TableCell>
                    <TableCell>{row.cargoName}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                    </TableCell>
                    {showFinancials && <TableCell>{currency(row.damageValue ?? 0)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">{company.notes || 'No internal notes added for this company yet.'}</p>
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
