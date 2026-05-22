'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, Pencil, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { driversApi } from '@/lib/api';
import type { DriverDetail } from '@/lib/types';
import { mockDriverDetails, mockVehicles } from '@/lib/mock-data';
import { getCargoDamageReportsByDriver } from '@/lib/cargo-damage';
import { calculateDriverRisk } from '@/lib/driver-risk';
import { getVehicleHandoversByDriver } from '@/lib/vehicle-handovers';
import { getDocumentsByOwner, getMissingRequiredDocuments } from '@/lib/documents';
import { getUser } from '@/lib/auth';
import { canViewFinancials } from '@/lib/permissions';
import { useTranslation } from 'react-i18next';
import {
  formatAccidentCountLabel,
  formatDate,
  fullName,
  statusColor,
} from '@/lib/utils';

interface DriverExtraProfile {
  address: string;
  dateOfBirth: string;
  contractExpiry: string;
  internalNotes: string;
}

const DRIVER_EXTRA_PROFILE: Record<string, DriverExtraProfile> = {
  'drv-101': {
    address: 'Musterstrasse 10, 10115 Berlin',
    dateOfBirth: '1990-04-12',
    contractExpiry: '2027-12-31',
    internalNotes: 'Reliable on morning tours. Prefers fixed route blocks and early dispatch windows.',
  },
  'drv-102': {
    address: 'Hauptstrasse 22, 04109 Leipzig',
    dateOfBirth: '1988-09-01',
    contractExpiry: '2026-11-30',
    internalNotes: 'Strong performance on long hauls. Needs follow-up after recent risk score increase.',
  },
};

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function resolveVehicleLabel(vehicleIdOrPlate: string) {
  const byId = mockVehicles.find((item) => item.id === vehicleIdOrPlate);
  if (byId) return byId.plate_number;
  const byPlate = mockVehicles.find((item) => item.plate_number === vehicleIdOrPlate);
  return byPlate?.plate_number ?? vehicleIdOrPlate;
}

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [showFinancials, setShowFinancials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const user = getUser();
    setShowFinancials(user ? canViewFinancials(user.role) : false);
  }, []);

  useEffect(() => {
    driversApi
      .getById(id)
      .then((res) => setDriver(res))
      .catch(() => {
        const mock = mockDriverDetails[id];
        if (mock) {
          setDriver(mock);
          return;
        }
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const profileExtra = useMemo(() => {
    if (!driver) return null;
    return (
      DRIVER_EXTRA_PROFILE[driver.id] ?? {
        address: 'Adresse noch nicht gepflegt',
        dateOfBirth: '1992-01-01',
        contractExpiry: '2027-06-30',
        internalNotes: 'No additional notes yet.',
      }
    );
  }, [driver]);

  const currentAssignment = driver?.recent_assignments?.[0] ?? null;
  const currentVehicle = currentAssignment?.vehicle.plate_number ?? '-';
  const currentCompany = currentAssignment?.company_name ?? '-';
  const cargoDamageHistory = getCargoDamageReportsByDriver(driver?.id ?? '');
  const vehicleHandoverHistory = useMemo(() => {
    if (!driver) return [];
    const slug = `${driver.first_name}-${driver.last_name}`.toLowerCase();
    const byId = getVehicleHandoversByDriver(driver.id);
    const bySlug = getVehicleHandoversByDriver(slug);
    if (byId.length > 0) return byId;
    return bySlug;
  }, [driver]);
  const riskOverview = calculateDriverRisk(driver?.id ?? '');
  const driverDocuments = useMemo(() => {
    if (!driver) return [];
    return [
      ...getDocumentsByOwner('driver', driver.id),
      ...getMissingRequiredDocuments('driver', driver.id),
    ];
  }, [driver]);

  const requestHistory = useMemo(() => {
    if (!driver) return [];
    return [
      {
        id: `${driver.id}-req-1`,
        type: 'Urlaub',
        dateFrom: '2026-06-10',
        dateTo: '2026-06-12',
        status: 'Approved',
        uploadedDocument: 'urlaub-antrag.pdf',
      },
      {
        id: `${driver.id}-req-2`,
        type: 'Krank',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
        status: 'Needs Review',
        uploadedDocument: 'license-scan.jpg',
      },
    ];
  }, [driver]);

  const accidentHistory = useMemo(() => {
    if (!driver) return [];
    const count = Math.max(driver.accident_count, 1);
    return Array.from({ length: count }, (_, index) => ({
      id: `${driver.id}-acc-${index + 1}`,
      date: `2026-0${Math.min(index + 2, 9)}-1${index}`,
      vehicle: driver.recent_assignments?.[0]?.vehicle.plate_number ?? 'B-FL 1001',
      type: index % 2 === 0 ? 'Parking Damage' : 'Rear Bumper Contact',
      damageCost: 850 + index * 420,
      status: index === 0 ? 'Closed' : 'Open',
    }));
  }, [driver]);

  const vehicleHistory = useMemo(() => {
    if (!driver) return [];
    const assignments = driver.recent_assignments ?? [];
    const map: Record<string, { firstUsed: string; lastUsed: string; totalAssignments: number }> = {};

    assignments.forEach((item) => {
      const key = item.vehicle.plate_number;
      const current = map[key];
      if (!current) {
        map[key] = { firstUsed: item.work_date, lastUsed: item.work_date, totalAssignments: 1 };
        return;
      }
      map[key] = {
        firstUsed: item.work_date < current.firstUsed ? item.work_date : current.firstUsed,
        lastUsed: item.work_date > current.lastUsed ? item.work_date : current.lastUsed,
        totalAssignments: current.totalAssignments + 1,
      };
    });

    return Object.entries(map).map(([vehicle, value]) => {
      const relatedHandovers = vehicleHandoverHistory.filter(
        (handover) => handover.vehicleId.trim().toUpperCase() === vehicle.trim().toUpperCase(),
      );

      const handoverPhotoStatus =
        relatedHandovers.length === 0
          ? 'No records'
          : relatedHandovers.some((handover) => handover.photoStatus === 'missing')
            ? 'Missing'
            : relatedHandovers.some((handover) => handover.photoStatus === 'submitted')
              ? 'Submitted'
              : relatedHandovers.some((handover) => handover.photoStatus === 'approved')
                ? 'Approved'
                : 'Not Required';

      return {
        id: `${driver.id}-vh-${vehicle}`,
        vehicle,
        firstUsed: value.firstUsed,
        lastUsed: value.lastUsed,
        totalAssignments: value.totalAssignments,
        handoverPhotoStatus,
      };
    });
  }, [driver, vehicleHandoverHistory]);

  const currentAssignmentSource = useMemo(() => {
    if (!currentAssignment) return '-';
    if (currentAssignment.notes?.toLowerCase().includes('check-in')) return 'Mobile Check-in';
    return 'Manual';
  }, [currentAssignment]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !driver || !profileExtra) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg text-gray-500">Driver not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/drivers">{t('common.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/drivers">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Link>
      </Button>

      <Card className="sticky top-3 z-20 border-blue-200 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                <User className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{fullName(driver.first_name, driver.last_name)}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge className={statusColor(driver.status)}>{driver.status.replace('_', ' ')}</Badge>
                  <span>{driver.phone ?? '-'}</span>
                  <span className="text-gray-400">|</span>
                  <span>{driver.email ?? '-'}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm md:grid-cols-3">
              <HeaderItem label="Current vehicle" value={currentVehicle} />
              <HeaderItem label="Current company" value={currentCompany} />
              <HeaderItem label="Current status" value={driver.status.replace('_', ' ')} />
              <HeaderItem label="Accidents" value={formatAccidentCountLabel(driver.accident_count ?? 0)} />
              <HeaderItem label="Risk score" value={`${riskOverview.overallRisk.label} (${riskOverview.overallRisk.points})`} />
            </div>

            <Button variant="outline" size="sm" type="button">
              <span className="inline-flex items-center">
                <Pencil className="mr-1 h-4 w-4" />
                Edit
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.riskOverview')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiskMetric title="Safety Risk" points={riskOverview.safetyRisk.points} label={riskOverview.safetyRisk.label} tone={riskOverview.safetyRisk.tone} />
            <RiskMetric title="Operational Risk" points={riskOverview.operationalRisk.points} label={riskOverview.operationalRisk.label} tone={riskOverview.operationalRisk.tone} />
            <RiskMetric title="Overall Risk" points={riskOverview.overallRisk.points} label={riskOverview.overallRisk.label} tone={riskOverview.overallRisk.tone} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <HeaderItem label="Traffic accidents" value={String(riskOverview.breakdown.trafficAccidents)} />
            <HeaderItem label="Cargo damages" value={String(riskOverview.breakdown.cargoDamages)} />
            <HeaderItem label="Missing documents" value={String(riskOverview.breakdown.missingDocuments)} />
            <HeaderItem label="Late deliveries" value={String(riskOverview.breakdown.lateDeliveries)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.personalInformation')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="First name" value={driver.first_name} />
            <InfoItem label="Last name" value={driver.last_name} />
            <InfoItem label="Phone" value={driver.phone ?? '-'} />
            <InfoItem label="Email" value={driver.email ?? '-'} />
            <InfoItem label="Address" value={profileExtra.address} />
            <InfoItem label="Date of birth" value={formatDate(profileExtra.dateOfBirth)} />
            <InfoItem label="License number" value={driver.license_number ?? '-'} />
            <InfoItem label="License expiry" value={formatDate(driver.license_expiry_date)} />
            <InfoItem label="Passport expiry" value={formatDate(driver.passport_expiry_date)} />
            <InfoItem label="Contract expiry" value={formatDate(profileExtra.contractExpiry)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.currentAssignment')}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentAssignment ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Date" value={formatDate(currentAssignment.work_date)} />
              <InfoItem label="Vehicle" value={currentAssignment.vehicle.plate_number} />
              <InfoItem label="Company" value={currentAssignment.company_name} />
              <InfoItem label="Route" value={currentAssignment.notes || 'Standard route'} />
              <InfoItem label="Start time" value={currentAssignment.start_time} />
              <InfoItem label="End time" value={currentAssignment.end_time} />
              <InfoItem label="Status" value={currentAssignment.status} />
              <InfoItem label="Source" value={currentAssignmentSource} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">{t('common.noRecords')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.documents')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document type</TableHead>
                <TableHead>File name</TableHead>
                <TableHead>Expiry date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded at</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                driverDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>{doc.documentType}</TableCell>
                    <TableCell>{doc.fileName}</TableCell>
                    <TableCell>{formatDate('expiryDate' in doc ? doc.expiryDate : undefined)}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          doc.status === 'valid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : doc.status === 'expiring_soon'
                              ? 'bg-amber-100 text-amber-700'
                              : doc.status === 'expired'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-700'
                        }
                      >
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{doc.uploadedAt}</TableCell>
                    <TableCell>
                      <button type="button" className="text-sm font-medium text-blue-600 hover:underline">View</button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.assignmentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Start time</TableHead>
                <TableHead>End time</TableHead>
                {showFinancials && <TableHead>Expected revenue</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driver.recent_assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showFinancials ? 8 : 7} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                driver.recent_assignments.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.work_date)}</TableCell>
                    <TableCell>{item.vehicle.plate_number}</TableCell>
                    <TableCell>{item.company_name}</TableCell>
                    <TableCell>{item.notes || 'Daily route'}</TableCell>
                    <TableCell>{item.start_time}</TableCell>
                    <TableCell>{item.end_time}</TableCell>
                    {showFinancials && <TableCell>{currency(1000)}</TableCell>}
                    <TableCell>
                      <Badge className={statusColor(item.status)}>{item.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.vehicleHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>First used</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Total assignments</TableHead>
                <TableHead>Handover photo status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                vehicleHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.vehicle}</TableCell>
                    <TableCell>{formatDate(item.firstUsed)}</TableCell>
                    <TableCell>{formatDate(item.lastUsed)}</TableCell>
                    <TableCell>{item.totalAssignments}</TableCell>
                    <TableCell>{item.handoverPhotoStatus}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.handoverHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Previous vehicle</TableHead>
                <TableHead>Photo Required</TableHead>
                <TableHead>Photo Status</TableHead>
                <TableHead>Damage Detected</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleHandoverHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                vehicleHandoverHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.date)}</TableCell>
                    <TableCell>{resolveVehicleLabel(item.vehicleId)}</TableCell>
                    <TableCell>{item.previousVehicleId ? resolveVehicleLabel(item.previousVehicleId) : '-'}</TableCell>
                    <TableCell>{item.photoRequired ? 'Required' : 'Not Required'}</TableCell>
                    <TableCell>{item.photoStatus.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{item.damageDetected ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.requestHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Date from</TableHead>
                <TableHead>Date to</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                requestHistory.map((item) => {
                  const start = new Date(`${item.dateFrom}T00:00:00`);
                  const end = new Date(`${item.dateTo}T00:00:00`);
                  const duration = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>{formatDate(item.dateFrom)}</TableCell>
                      <TableCell>{formatDate(item.dateTo)}</TableCell>
                      <TableCell>{duration} day(s)</TableCell>
                      <TableCell>{item.status}</TableCell>
                      <TableCell>{item.uploadedDocument}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.accidentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Type</TableHead>
                {showFinancials && <TableHead>Damage cost</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accidentHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showFinancials ? 5 : 4} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                accidentHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.date)}</TableCell>
                    <TableCell>{item.vehicle}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    {showFinancials && <TableCell>{currency(item.damageCost)}</TableCell>}
                    <TableCell>
                      {item.status === 'Open' ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="h-4 w-4" />
                          {item.status}
                        </span>
                      ) : (
                        item.status
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.cargoDamageHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Cargo Name</TableHead>
                <TableHead>Cargo Owner</TableHead>
                <TableHead>Status</TableHead>
                {showFinancials && <TableHead>Damage value</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargoDamageHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showFinancials ? 7 : 6} className="text-center text-sm text-gray-500">{t('common.noRecords')}</TableCell>
                </TableRow>
              ) : (
                cargoDamageHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.date)}</TableCell>
                    <TableCell>{resolveVehicleLabel(item.vehicleId)}</TableCell>
                    <TableCell>{item.companyName}</TableCell>
                    <TableCell>{item.cargoName}</TableCell>
                    <TableCell>{item.cargoOwner}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    {showFinancials && <TableCell>{item.damageValue ? currency(item.damageValue) : '-'}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profiles.driver.notes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            defaultValue={profileExtra.internalNotes}
            rows={5}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function HeaderItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function RiskMetric({
  title,
  points,
  label,
  tone,
}: {
  title: string;
  points: number;
  label: string;
  tone: 'green' | 'yellow' | 'red';
}) {
  const badgeClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'yellow'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className={`rounded-md border p-3 ${badgeClass}`}>
      <p className="text-xs uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-xl font-bold">{points}</p>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
