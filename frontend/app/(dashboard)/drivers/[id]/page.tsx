'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, Pencil, Power, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { driversApi, documentsApi, leaveRequestsApi, type DriverRiskSummary } from '@/lib/api';
import type { DriverDetail, Document, LeaveRequest } from '@/lib/types';
import { getUser } from '@/lib/auth';
import { canViewFinancials } from '@/lib/permissions';
import { useTranslation } from 'react-i18next';
import { formatAccidentCountLabel, formatDate, fullName, statusColor } from '@/lib/utils';

interface DriverHandoverRow {
  id: string;
  vehicleId: string;
  vehicle?: { id: string; plateNumber: string };
  handoverDateTime: string;
  handoverType: string;
  photoRequired: boolean;
  photoStatus: string;
  damageDetected: boolean;
  status: string;
}

interface DriverIncidentRow {
  id: string;
  type: 'vehicle_accident' | 'cargo_damage';
  vehicleId: string;
  vehicle?: { id: string; plateNumber: string };
  company?: { id: string; name: string };
  incidentDateTime: string;
  description: string;
  cargoName?: string | null;
  cargoOwner?: string | null;
  damageValue?: number | string | null;
  status: string;
}

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function riskTone(level: string): string {
  if (level === 'red') return 'bg-rose-100 text-rose-700';
  if (level === 'yellow') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useTranslation();

  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [showFinancials, setShowFinancials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const [risk, setRisk] = useState<DriverRiskSummary | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [handovers, setHandovers] = useState<DriverHandoverRow[]>([]);
  const [handoversError, setHandoversError] = useState<string | null>(null);

  const [incidents, setIncidents] = useState<DriverIncidentRow[]>([]);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveRequestsError, setLeaveRequestsError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    setShowFinancials(user ? canViewFinancials(user.role) : false);
  }, []);

  useEffect(() => {
    driversApi
      .getById(id)
      .then(setDriver)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    driversApi.getRisk(id).then(setRisk).catch((e) => setRiskError(e?.message ?? 'Failed'));
    documentsApi
      .list('driver', id)
      .then(setDocuments)
      .catch((e) => setDocumentsError(e?.message ?? 'Failed'));
    driversApi
      .getHandovers(id)
      .then((rows) => setHandovers(rows as DriverHandoverRow[]))
      .catch((e) => setHandoversError(e?.message ?? 'Failed'));
    driversApi
      .getIncidents(id)
      .then((rows) => setIncidents(rows as DriverIncidentRow[]))
      .catch((e) => setIncidentsError(e?.message ?? 'Failed'));
    leaveRequestsApi
      .list({ driver_id: id })
      .then(setLeaveRequests)
      .catch((e) => setLeaveRequestsError(e?.message ?? 'Failed'));
  }, [id]);

  async function handleDeactivate() {
    if (!driver || driver.status === 'inactive') return;
    if (
      !window.confirm(
        `Deactivate ${driver.first_name} ${driver.last_name}? They can be reactivated later.`,
      )
    ) {
      return;
    }
    setDeactivating(true);
    try {
      await driversApi.deactivate(id);
      const fresh = await driversApi.getById(id);
      setDriver(fresh);
    } catch {
      window.alert('Failed to deactivate driver.');
    } finally {
      setDeactivating(false);
    }
  }

  const currentAssignment = driver?.recent_assignments?.[0] ?? null;
  const currentVehicle = currentAssignment?.vehicle.plate_number ?? '-';
  const currentCompany = currentAssignment?.company_name ?? '-';

  const accidentRows = useMemo(
    () => incidents.filter((i) => i.type === 'vehicle_accident'),
    [incidents],
  );
  const cargoRows = useMemo(
    () => incidents.filter((i) => i.type === 'cargo_damage'),
    [incidents],
  );

  // Vehicle history derived from recent_assignments + handover photo status join
  const vehicleHistory = useMemo(() => {
    if (!driver) return [];
    const map: Record<string, { firstUsed: string; lastUsed: string; total: number }> = {};
    for (const item of driver.recent_assignments ?? []) {
      const key = item.vehicle.plate_number;
      const current = map[key];
      if (!current) {
        map[key] = { firstUsed: item.work_date, lastUsed: item.work_date, total: 1 };
      } else {
        map[key] = {
          firstUsed: item.work_date < current.firstUsed ? item.work_date : current.firstUsed,
          lastUsed: item.work_date > current.lastUsed ? item.work_date : current.lastUsed,
          total: current.total + 1,
        };
      }
    }
    return Object.entries(map).map(([plate, value]) => {
      const related = handovers.filter((h) => h.vehicle?.plateNumber === plate);
      const photoStatus =
        related.length === 0
          ? 'No records'
          : related.some((h) => h.photoStatus === 'missing')
            ? 'Missing'
            : related.some((h) => h.photoStatus === 'submitted')
              ? 'Submitted'
              : related.some((h) => h.photoStatus === 'approved')
                ? 'Approved'
                : 'Not Required';
      return {
        id: `vh-${plate}`,
        vehicle: plate,
        firstUsed: value.firstUsed,
        lastUsed: value.lastUsed,
        totalAssignments: value.total,
        handoverPhotoStatus: photoStatus,
      };
    });
  }, [driver, handovers]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !driver) {
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
                <h1 className="text-2xl font-bold text-gray-900">
                  {fullName(driver.first_name, driver.last_name)}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge className={statusColor(driver.status)}>
                    {driver.status.replace('_', ' ')}
                  </Badge>
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
              <HeaderItem
                label="Accidents"
                value={formatAccidentCountLabel(driver.accident_count ?? 0)}
              />
              <HeaderItem
                label="Risk score"
                value={
                  risk
                    ? `${risk.computed_risk_level} (${risk.points})`
                    : driver.risk_level
                }
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => router.push(`/drivers/${id}/edit`)}
              >
                <span className="inline-flex items-center">
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </span>
              </Button>
              {driver.status !== 'inactive' && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  className="text-red-600 hover:bg-red-50"
                >
                  <span className="inline-flex items-center">
                    <Power className="mr-1 h-4 w-4" />
                    {deactivating ? 'Deactivating...' : 'Deactivate'}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {riskError ? (
            <p className="text-sm text-gray-500">Risk data could not be loaded.</p>
          ) : !risk ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Badge className={riskTone(risk.computed_risk_level)}>
                  {risk.computed_risk_level.toUpperCase()}
                </Badge>
                <span className="text-sm text-gray-600">
                  Points: <span className="font-semibold">{risk.points}</span>
                </span>
                <span className="text-xs text-gray-500">
                  (stored: {risk.stored_risk_level})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <HeaderItem
                  label="Vehicle accidents (6m)"
                  value={String(risk.breakdown.vehicle_accidents_6m)}
                />
                <HeaderItem
                  label="Cargo damages (6m)"
                  value={String(risk.breakdown.cargo_damages_6m)}
                />
                <HeaderItem
                  label="Open incidents"
                  value={String(risk.breakdown.open_incidents)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="First name" value={driver.first_name} />
            <InfoItem label="Last name" value={driver.last_name} />
            <InfoItem label="Phone" value={driver.phone ?? '-'} />
            <InfoItem label="Email" value={driver.email ?? '-'} />
            <InfoItem label="Date of birth" value={formatDate(driver.date_of_birth)} />
            <InfoItem label="License number" value={driver.license_number ?? '-'} />
            <InfoItem label="License expiry" value={formatDate(driver.license_expiry_date)} />
            <InfoItem label="Passport number" value={driver.passport_number ?? '-'} />
            <InfoItem label="Passport expiry" value={formatDate(driver.passport_expiry_date)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current assignment</CardTitle>
        </CardHeader>
        <CardContent>
          {currentAssignment ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Date" value={formatDate(currentAssignment.work_date)} />
              <InfoItem label="Vehicle" value={currentAssignment.vehicle.plate_number} />
              <InfoItem label="Company" value={currentAssignment.company_name} />
              <InfoItem label="Notes" value={currentAssignment.notes || '—'} />
              <InfoItem label="Start time" value={currentAssignment.start_time} />
              <InfoItem label="End time" value={currentAssignment.end_time} />
              <InfoItem label="Status" value={currentAssignment.status} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">{t('common.noRecords')}</p>
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
                  <TableHead>Uploaded at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.documentType}</TableCell>
                      <TableCell>{doc.fileName}</TableCell>
                      <TableCell>{formatDate(doc.expiryDate)}</TableCell>
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
                      <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Start time</TableHead>
                <TableHead>End time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driver.recent_assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                driver.recent_assignments.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.work_date)}</TableCell>
                    <TableCell>{item.vehicle.plate_number}</TableCell>
                    <TableCell>{item.company_name}</TableCell>
                    <TableCell>{item.notes || '—'}</TableCell>
                    <TableCell>{item.start_time}</TableCell>
                    <TableCell>{item.end_time}</TableCell>
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
          <CardTitle>Vehicle history</CardTitle>
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
                  <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                    {t('common.noRecords')}
                  </TableCell>
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
          <CardTitle>Handover history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {handoversError ? (
            <p className="p-4 text-sm text-gray-500">Handovers could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Photo required</TableHead>
                  <TableHead>Photo status</TableHead>
                  <TableHead>Damage detected</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {handovers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  handovers.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDate(h.handoverDateTime)}</TableCell>
                      <TableCell>{h.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell>{h.handoverType}</TableCell>
                      <TableCell>{h.photoRequired ? 'Required' : 'Not required'}</TableCell>
                      <TableCell>{h.photoStatus.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{h.damageDetected ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{h.status}</TableCell>
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
          <CardTitle>Leave request history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leaveRequestsError ? (
            <p className="p-4 text-sm text-gray-500">Leave requests could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Date from</TableHead>
                  <TableHead>Date to</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  leaveRequests.map((item) => {
                    const start = new Date(item.startDate);
                    const end = new Date(item.endDate);
                    const duration =
                      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.type}</TableCell>
                        <TableCell>{formatDate(item.startDate)}</TableCell>
                        <TableCell>{formatDate(item.endDate)}</TableCell>
                        <TableCell>{duration} day(s)</TableCell>
                        <TableCell>
                          <Badge className={statusColor(item.status)}>{item.status}</Badge>
                        </TableCell>
                        <TableCell>{item.reason ?? '-'}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accident history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">Incidents could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Description</TableHead>
                  {showFinancials && <TableHead>Damage value</TableHead>}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accidentRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showFinancials ? 5 : 4}
                      className="text-center text-sm text-gray-500"
                    >
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  accidentRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell>{item.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      {showFinancials && (
                        <TableCell>
                          {item.damageValue ? currency(Number(item.damageValue)) : '-'}
                        </TableCell>
                      )}
                      <TableCell>
                        {item.status === 'reported' || item.status === 'under_review' ? (
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cargo damage history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">Cargo damages could not be loaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Cargo name</TableHead>
                  <TableHead>Cargo owner</TableHead>
                  <TableHead>Status</TableHead>
                  {showFinancials && <TableHead>Damage value</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargoRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showFinancials ? 7 : 6}
                      className="text-center text-sm text-gray-500"
                    >
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  cargoRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell>{item.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell>{item.company?.name ?? '-'}</TableCell>
                      <TableCell>{item.cargoName ?? '-'}</TableCell>
                      <TableCell>{item.cargoOwner ?? '-'}</TableCell>
                      <TableCell>{item.status}</TableCell>
                      {showFinancials && (
                        <TableCell>
                          {item.damageValue ? currency(Number(item.damageValue)) : '-'}
                        </TableCell>
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
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}
