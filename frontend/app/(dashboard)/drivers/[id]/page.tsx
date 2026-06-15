'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, Pencil, Power, Upload, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DriverLicenseForm } from '@/components/license-checks/DriverLicenseForm';
import { LicenseComplianceBadgePill } from '@/components/license-checks/LicenseComplianceBadge';
import {
  driversApi,
  documentsApi,
  driverLicensesApi,
  finesApi,
  leaveRequestsApi,
  privacyApi,
  type DriverRiskSummary,
} from '@/lib/api';
import { FineStatusBadge } from '@/components/fines/FineStatusBadge';
import type { Fine } from '@/lib/types';
import { downloadBlob } from '@/lib/download-blob';
import type { DriverDetail, Document, LeaveRequest } from '@/lib/types';
import { getUser } from '@/lib/auth';
import { canViewFinancials } from '@/lib/permissions';
import { useTranslation } from 'react-i18next';
import { DocumentFileLink } from '@/components/documents/DocumentFileLink';
import {
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { cn, formatAccidentCountLabel, formatDate, fullName, statusColor } from '@/lib/utils';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);

  const [risk, setRisk] = useState<DriverRiskSummary | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [hrDocType, setHrDocType] = useState<'Contract' | 'Salary Document'>('Contract');
  const [hrFile, setHrFile] = useState<File | null>(null);
  const [hrUploading, setHrUploading] = useState(false);
  const [hrUploadError, setHrUploadError] = useState<string | null>(null);

  const [handovers, setHandovers] = useState<DriverHandoverRow[]>([]);
  const [handoversError, setHandoversError] = useState<string | null>(null);

  const [incidents, setIncidents] = useState<DriverIncidentRow[]>([]);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveRequestsError, setLeaveRequestsError] = useState<string | null>(null);
  const [hasDriverLicense, setHasDriverLicense] = useState<boolean | null>(null);

  const [fines, setFines] = useState<Fine[]>([]);
  const [finesError, setFinesError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    setShowFinancials(user ? canViewFinancials(user.role) : false);
    setIsAdmin(user?.role === 'admin');
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
    driverLicensesApi
      .list(id)
      .then((rows: Array<{ id: string }>) => setHasDriverLicense(rows.length > 0))
      .catch(() => setHasDriverLicense(null));
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
    finesApi
      .list({ driver_id: id })
      .then(setFines)
      .catch((e) => setFinesError(e?.message ?? 'Failed'));
  }, [id]);

  async function handleHrDocumentUpload() {
    if (!hrFile) {
      setHrUploadError(t('driverDetail.hrUploadFileRequired'));
      return;
    }
    setHrUploading(true);
    setHrUploadError(null);
    try {
      const formData = new FormData();
      formData.append('ownerType', 'driver');
      formData.append('ownerId', id);
      formData.append('documentType', hrDocType);
      formData.append('file', hrFile);
      await documentsApi.upload(formData);
      setHrFile(null);
      const rows = await documentsApi.list('driver', id);
      setDocuments(rows);
    } catch (e) {
      setHrUploadError(e instanceof Error ? e.message : t('driverDetail.hrUploadFailed'));
    } finally {
      setHrUploading(false);
    }
  }

  async function handleGdprExport() {
    if (!driver) return;
    setExporting(true);
    try {
      const blob = await privacyApi.exportDriver(id);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `driver-export-${id}-${stamp}.zip`);
    } catch {
      window.alert(t('driverDetail.gdprExportError'));
    } finally {
      setExporting(false);
    }
  }

  async function handleGdprAnonymize() {
    if (!driver) return;
    const name = fullName(driver.first_name, driver.last_name);
    if (!window.confirm(t('driverDetail.gdprAnonymizeConfirm', { name }))) return;
    const reason = window.prompt(t('driverDetail.gdprReasonPrompt'));
    if (!reason || reason.trim().length < 3) return;

    setAnonymizing(true);
    try {
      await privacyApi.anonymizeDriver(id, reason.trim());
      window.alert(t('driverDetail.gdprAnonymizeDone'));
      const fresh = await driversApi.getById(id);
      setDriver(fresh);
    } catch {
      window.alert(t('driverDetail.gdprAnonymizeError'));
    } finally {
      setAnonymizing(false);
    }
  }

  async function handleDeactivate() {
    if (!driver || driver.status === 'inactive') return;
    if (
      !window.confirm(
        t('driverDetail.confirmDeactivate', { name: `${driver.first_name} ${driver.last_name}` }),
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
      window.alert(t('driverDetail.deactivateError'));
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
        <p className="text-lg text-gray-500">{t('form.driverNotFound')}</p>
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
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
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
              <HeaderItem label={t('driverDetail.hdrCurrentVehicle')} value={currentVehicle} />
              <HeaderItem label={t('driverDetail.hdrCurrentCompany')} value={currentCompany} />
              <HeaderItem label={t('driverDetail.hdrCurrentStatus')} value={driver.status.replace('_', ' ')} />
              <HeaderItem
                label={t('driverDetail.hdrAccidents')}
                value={formatAccidentCountLabel(driver.accident_count ?? 0)}
              />
              <HeaderItem
                label={t('driverDetail.hdrRiskScore')}
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
                  {t('driverDetail.edit')}
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
                    {deactivating ? t('driverDetail.deactivating') : t('driverDetail.deactivate')}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('driverDetail.riskOverview')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {riskError ? (
            <p className="text-sm text-gray-500">{t('driverDetail.riskLoadError')}</p>
          ) : !risk ? (
            <p className="text-sm text-gray-500">{t('driverDetail.loading')}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Badge className={riskTone(risk.computed_risk_level)}>
                  {risk.computed_risk_level.toUpperCase()}
                </Badge>
                <span className="text-sm text-gray-600">
                  {t('driverDetail.points')} <span className="font-semibold">{risk.points}</span>
                </span>
                <span className="text-xs text-gray-500">
                  {t('driverDetail.stored', { level: risk.stored_risk_level })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <HeaderItem
                  label={t('driverDetail.vehicleAccidents6m')}
                  value={String(risk.breakdown.vehicle_accidents_6m)}
                />
                <HeaderItem
                  label={t('driverDetail.cargoDamages6m')}
                  value={String(risk.breakdown.cargo_damages_6m)}
                />
                <HeaderItem
                  label={t('driverDetail.openIncidents')}
                  value={String(risk.breakdown.open_incidents)}
                />
                <HeaderItem
                  label={t('driverDetail.fines6m')}
                  value={String(risk.breakdown.fines_6m ?? 0)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t('driverLicense.sectionTitle')}</CardTitle>
          <LicenseComplianceBadgePill badge={driver.license_compliance_badge} />
        </CardHeader>
        <CardContent className="space-y-4">
          {driver.license_compliance ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem
                label={t('driverLicense.nextCheck')}
                value={driver.license_compliance.next_check_due_at ?? '—'}
              />
              <InfoItem
                label={t('driverLicense.expiresAt')}
                value={driver.license_compliance.expires_at ?? '—'}
              />
              <InfoItem
                label={t('driverLicense.latestStatus')}
                value={driver.license_compliance.latest_check?.status ?? '—'}
              />
              <InfoItem
                label={t('driverLicense.pending')}
                value={driver.license_compliance.has_pending_check ? t('common.yes') : t('common.no')}
              />
            </dl>
          ) : null}
          {isAdmin && hasDriverLicense === false ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-3 text-sm text-amber-900">{t('driverLicense.registerHint')}</p>
              <DriverLicenseForm
                driverId={id}
                onCreated={() => {
                  setHasDriverLicense(true);
                  driversApi.getById(id).then(setDriver).catch(() => undefined);
                }}
              />
            </div>
          ) : null}
          {hasDriverLicense ? (
            <p className="text-sm text-gray-600">
              {t('driverLicense.manageHint')}{' '}
              <Link href="/license-checks" className="font-medium text-blue-600 hover:underline">
                {t('nav.licenseChecks')}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('driverDetail.personalInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label={t('driverDetail.firstName')} value={driver.first_name} />
            <InfoItem label={t('driverDetail.lastName')} value={driver.last_name} />
            <InfoItem label={t('driverDetail.phone')} value={driver.phone ?? '-'} />
            <InfoItem label={t('driverDetail.email')} value={driver.email ?? '-'} />
            <InfoItem label={t('driverDetail.dateOfBirth')} value={formatDate(driver.date_of_birth)} />
            <InfoItem label={t('driverDetail.licenseNumber')} value={driver.license_number ?? '-'} />
            <InfoItem label={t('driverDetail.licenseExpiry')} value={formatDate(driver.license_expiry_date)} />
            <InfoItem label={t('driverDetail.passportNumber')} value={driver.passport_number ?? '-'} />
            <InfoItem label={t('driverDetail.passportExpiry')} value={formatDate(driver.passport_expiry_date)} />
            <InfoItem label={t('driverDetail.homeAddressStreet')} value={driver.home_address_street ?? '-'} />
            <InfoItem label={t('driverDetail.homeAddressZipCode')} value={driver.home_address_zip_code ?? '-'} />
            <InfoItem label={t('driverDetail.homeAddressCity')} value={driver.home_address_city ?? '-'} />
            <InfoItem label={t('driverDetail.homeAddressCountry')} value={driver.home_address_country ?? '-'} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('driverDetail.currentAssignment')}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentAssignment ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label={t('driverDetail.date')} value={formatDate(currentAssignment.work_date)} />
              <InfoItem label={t('driverDetail.vehicle')} value={currentAssignment.vehicle.plate_number} />
              <InfoItem label={t('driverDetail.company')} value={currentAssignment.company_name} />
              <InfoItem label={t('driverDetail.notes')} value={currentAssignment.notes || '—'} />
              <InfoItem label={t('driverDetail.startTime')} value={currentAssignment.start_time} />
              <InfoItem label={t('driverDetail.endTime')} value={currentAssignment.end_time} />
              <InfoItem label={t('driverDetail.status')} value={currentAssignment.status} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">{t('common.noRecords')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('driverDetail.documents')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="hr-doc-type">
                {t('driverDetail.hrUploadType')}
              </label>
              <select
                id="hr-doc-type"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={hrDocType}
                onChange={(e) => setHrDocType(e.target.value as 'Contract' | 'Salary Document')}
              >
                <option value="Contract">{t('driverDetail.hrDocContract')}</option>
                <option value="Salary Document">{t('driverDetail.hrDocSalary')}</option>
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="hr-doc-file">
                {t('driverDetail.hrUploadFile')}
              </label>
              <Input
                id="hr-doc-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setHrFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={hrUploading || !hrFile}
              onClick={() => void handleHrDocumentUpload()}
            >
              {hrUploading ? null : <Upload className="mr-2 h-4 w-4" />}
              {hrUploading ? t('driverDetail.hrUploading') : t('driverDetail.hrUpload')}
            </Button>
          </div>
          {hrUploadError ? <p className="text-sm text-red-600">{hrUploadError}</p> : null}
          {documentsError ? (
            <p className="text-sm text-gray-500">{t('driverDetail.documentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDocType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colFileName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colExpiryDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colUploadedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {documents.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={5} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((doc) => (
                    <TableRow className={FLEET_TABLE_ROW} key={doc.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{doc.documentType}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <DocumentFileLink document={doc} variant="link" />
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(doc.expiryDate)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
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
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(doc.uploadedAt)}</TableCell>
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
          <CardTitle>{t('driverDetail.assignmentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.date')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.vehicle')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.company')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.notes')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.startTime')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.endTime')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {driver.recent_assignments.length === 0 ? (
                <TableRow className={FLEET_TABLE_ROW}>
                  <TableCell colSpan={7} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                driver.recent_assignments.map((item) => (
                  <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.work_date)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.vehicle.plate_number}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.company_name}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.notes || '—'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.start_time}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.end_time}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
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
          <CardTitle>{t('driverDetail.vehicleHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.vehicle')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colFirstUsed')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colLastUsed')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colTotalAssignments')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colHandoverPhotoStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {vehicleHistory.length === 0 ? (
                <TableRow className={FLEET_TABLE_ROW}>
                  <TableCell colSpan={5} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                vehicleHistory.map((item) => (
                  <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                    <TableCell className={FLEET_TABLE_CELL}>{item.vehicle}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.firstUsed)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.lastUsed)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.totalAssignments}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.handoverPhotoStatus}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('driverDetail.handoverHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {handoversError ? (
            <p className="p-4 text-sm text-gray-500">{t('driverDetail.handoversLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colPhotoRequired')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colPhotoStatus')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDamageDetected')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {handovers.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={7} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  handovers.map((h) => (
                    <TableRow className={FLEET_TABLE_ROW} key={h.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(h.handoverDateTime)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{h.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{h.handoverType}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{h.photoRequired ? t('driverDetail.required') : t('driverDetail.notRequired')}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{h.photoStatus.replace(/_/g, ' ')}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{h.damageDetected ? t('driverDetail.yes') : t('driverDetail.no')}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{h.status}</TableCell>
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
          <CardTitle>{t('driverDetail.leaveHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leaveRequestsError ? (
            <p className="p-4 text-sm text-gray-500">{t('driverDetail.leaveLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDateFrom')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDateTo')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDuration')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colReason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {leaveRequests.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={6} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
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
                      <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                        <TableCell className={FLEET_TABLE_CELL}>{item.type}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.startDate)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.endDate)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{t('driverDetail.durationDays', { count: duration })}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Badge className={statusColor(item.status)}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{item.reason ?? '-'}</TableCell>
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
          <CardTitle>{t('driverDetail.accidentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('driverDetail.incidentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDescription')}</TableHead>
                  {showFinancials && <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDamageValue')}</TableHead>}
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {accidentRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showFinancials ? 5 : 4}
                      className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}
                    >
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  accidentRows.map((item) => (
                    <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.description}</TableCell>
                      {showFinancials && (
                        <TableCell className={FLEET_TABLE_CELL}>
                          {item.damageValue ? currency(Number(item.damageValue)) : '-'}
                        </TableCell>
                      )}
                      <TableCell className={FLEET_TABLE_CELL}>
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
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t('driverDetail.fineHistory')}</CardTitle>
          <Link href="/fines" className="text-sm font-medium text-blue-600 hover:underline">
            {t('nav.fines')}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {finesError ? (
            <p className="p-4 text-sm text-gray-500">{t('driverDetail.finesLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('fines.colAmount')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {fines.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={5} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  fines.map((fine) => (
                    <TableRow className={FLEET_TABLE_ROW} key={fine.id}>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Link href={`/fines/${fine.id}`} className="text-blue-600 hover:underline">
                          {formatDate(fine.violation_at)}
                        </Link>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{fine.vehicle.plate_number}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{fine.violation_type}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {fine.amount != null ? currency(fine.amount) : '—'}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <FineStatusBadge
                          status={fine.status}
                          label={t(`fines.status.${fine.status}`)}
                        />
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
          <CardTitle>{t('driverDetail.cargoHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('driverDetail.cargoLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.company')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colCargoName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colCargoOwner')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.status')}</TableHead>
                  {showFinancials && <TableHead className={FLEET_TABLE_HEAD}>{t('driverDetail.colDamageValue')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {cargoRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showFinancials ? 7 : 6}
                      className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}
                    >
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  cargoRows.map((item) => (
                    <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.vehicle?.plateNumber ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.company?.name ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.cargoName ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.cargoOwner ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.status}</TableCell>
                      {showFinancials && (
                        <TableCell className={FLEET_TABLE_CELL}>
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

      {isAdmin ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle>{t('driverDetail.gdprTitle')}</CardTitle>
            <p className="text-sm text-slate-600">{t('driverDetail.gdprSubtitle')}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => void handleGdprExport()}
              disabled={exporting || anonymizing}
            >
              {exporting ? t('driverDetail.gdprExporting') : t('driverDetail.gdprExport')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => void handleGdprAnonymize()}
              disabled={exporting || anonymizing || driver.status === 'terminated'}
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              {anonymizing ? t('driverDetail.gdprAnonymizing') : t('driverDetail.gdprAnonymize')}
            </Button>
          </CardContent>
        </Card>
      ) : null}
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
