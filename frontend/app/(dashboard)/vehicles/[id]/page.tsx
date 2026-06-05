'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vehiclesApi, documentsApi } from '@/lib/api';
import type { VehicleDetail, Document } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { formatDate, statusColor } from '@/lib/utils';
import { DocumentFileLink } from '@/components/documents/DocumentFileLink';
import { VehiclePlateDisplay } from '@/components/vehicles/VehiclePlateDisplay';

interface VehicleAssignmentRow {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string | null;
  driver: { id: string; firstName: string; lastName: string };
  company: { id: string; name: string };
}

interface VehicleHandoverRow {
  id: string;
  handoverDateTime: string;
  handoverType: string;
  photoRequired: boolean;
  photoStatus: string;
  damageDetected: boolean;
  damageNotes?: string | null;
  status: string;
  driver?: { firstName: string; lastName: string };
}

interface VehicleIncidentRow {
  id: string;
  type: 'vehicle_accident' | 'cargo_damage';
  incidentDateTime: string;
  description: string;
  cargoName?: string | null;
  cargoOwner?: string | null;
  damageValue?: number | string | null;
  status: string;
  driver?: { firstName: string; lastName: string };
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

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [assignments, setAssignments] = useState<VehicleAssignmentRow[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const [handovers, setHandovers] = useState<VehicleHandoverRow[]>([]);
  const [handoversError, setHandoversError] = useState<string | null>(null);

  const [incidents, setIncidents] = useState<VehicleIncidentRow[]>([]);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  useEffect(() => {
    vehiclesApi
      .getById(id)
      .then(setVehicle)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    vehiclesApi
      .getAssignments(id)
      .then((rows) => setAssignments(rows as VehicleAssignmentRow[]))
      .catch((e) => setAssignmentsError(e?.message ?? 'Failed'));
    vehiclesApi
      .getHandovers(id)
      .then((rows) => setHandovers(rows as VehicleHandoverRow[]))
      .catch((e) => setHandoversError(e?.message ?? 'Failed'));
    vehiclesApi
      .getIncidents(id)
      .then((rows) => setIncidents(rows as VehicleIncidentRow[]))
      .catch((e) => setIncidentsError(e?.message ?? 'Failed'));
    documentsApi
      .list('vehicle', id)
      .then(setDocuments)
      .catch((e) => setDocumentsError(e?.message ?? 'Failed'));
  }, [id]);

  const currentAssignment = vehicle?.recent_assignments?.[0] ?? null;
  const currentDriver =
    currentAssignment?.driver.name ??
    (vehicle?.current_driver
      ? `${vehicle.current_driver.first_name} ${vehicle.current_driver.last_name}`
      : '-');
  const currentCompany = currentAssignment?.company_name ?? '-';

  const accidentRows = useMemo(
    () => incidents.filter((i) => i.type === 'vehicle_accident'),
    [incidents],
  );
  const cargoRows = useMemo(
    () => incidents.filter((i) => i.type === 'cargo_damage'),
    [incidents],
  );

  const driverHistory = useMemo(() => {
    if (assignments.length === 0) return [];
    const map: Record<string, { firstUsed: string; lastUsed: string; total: number; name: string }> = {};
    for (const item of assignments) {
      const key = item.driver.id;
      const name = `${item.driver.firstName} ${item.driver.lastName}`.trim();
      const current = map[key];
      if (!current) {
        map[key] = { firstUsed: item.workDate, lastUsed: item.workDate, total: 1, name };
      } else {
        map[key] = {
          firstUsed: item.workDate < current.firstUsed ? item.workDate : current.firstUsed,
          lastUsed: item.workDate > current.lastUsed ? item.workDate : current.lastUsed,
          total: current.total + 1,
          name,
        };
      }
    }
    return Object.entries(map).map(([driverId, value]) => ({
      id: `dh-${driverId}`,
      driverId,
      driver: value.name,
      firstUsed: value.firstUsed,
      lastUsed: value.lastUsed,
      totalAssignments: value.total,
    }));
  }, [assignments]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !vehicle) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg text-gray-500">{t('form.vehicleNotFound')}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/vehicles">{t('common.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/vehicles">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Link>
      </Button>

      <Card className="sticky top-3 z-20 border-purple-200 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <VehiclePlateDisplay
                vehicleId={vehicle.id}
                plate={vehicle.plate_number}
                photoUrl={vehicle.photo_url}
                brand={vehicle.brand}
                model={vehicle.model}
                size="lg"
                onPhotoUploaded={(photoUrl) =>
                  setVehicle((prev) => (prev ? { ...prev, photo_url: photoUrl } : prev))
                }
              />
              <div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <Badge className={statusColor(vehicle.status)}>
                    {vehicle.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm md:grid-cols-4">
              <HeaderItem label={t('vehicleDetail.hdrCurrentDriver')} value={currentDriver} />
              <HeaderItem label={t('vehicleDetail.hdrCurrentCompany')} value={currentCompany} />
              <HeaderItem label={t('vehicleDetail.hdrTuvExpiry')} value={formatDate(vehicle.tuv_expiry_date)} />
              <HeaderItem label={t('vehicleDetail.hdrSpExpiry')} value={formatDate(vehicle.sp_expiry_date)} />
            </div>

            <Button variant="outline" size="sm" asChild>
              <Link href={`/vehicles/${id}/edit`}>
                <span className="inline-flex items-center">
                  <Pencil className="mr-1 h-4 w-4" />
                  {t('vehicleDetail.edit')}
                </span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicleDetail.vehicleInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label={t('vehicleDetail.plate')} value={vehicle.plate_number} />
            <InfoItem label={t('vehicleDetail.brand')} value={vehicle.brand} />
            <InfoItem label={t('vehicleDetail.model')} value={vehicle.model} />
            <InfoItem label={t('vehicleDetail.year')} value={String(vehicle.year ?? '-')} />
            <InfoItem label={t('vehicleDetail.hdrTuvExpiry')} value={formatDate(vehicle.tuv_expiry_date)} />
            <InfoItem label={t('vehicleDetail.hdrSpExpiry')} value={formatDate(vehicle.sp_expiry_date)} />
            <InfoItem label={t('vehicleDetail.status')} value={vehicle.status.replace('_', ' ')} />
            <InfoItem
              label={t('vehicleDetail.currentDriver')}
              value={
                vehicle.current_driver
                  ? `${vehicle.current_driver.first_name} ${vehicle.current_driver.last_name}`
                  : '-'
              }
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicleDetail.documents')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.documentsLoadError')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleDetail.colDocType')}</TableHead>
                  <TableHead>{t('vehicleDetail.colFileName')}</TableHead>
                  <TableHead>{t('vehicleDetail.colExpiryDate')}</TableHead>
                  <TableHead>{t('vehicleDetail.status')}</TableHead>
                  <TableHead>{t('vehicleDetail.colUploadedAt')}</TableHead>
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
                      <TableCell>
                        <DocumentFileLink document={doc} variant="link" />
                      </TableCell>
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
          <CardTitle>{t('vehicleDetail.assignmentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.assignmentsLoadError')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleDetail.date')}</TableHead>
                  <TableHead>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead>{t('vehicleDetail.company')}</TableHead>
                  <TableHead>{t('vehicleDetail.startTime')}</TableHead>
                  <TableHead>{t('vehicleDetail.endTime')}</TableHead>
                  <TableHead>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{formatDate(a.workDate)}</TableCell>
                      <TableCell>
                        {a.driver.firstName} {a.driver.lastName}
                      </TableCell>
                      <TableCell>{a.company.name}</TableCell>
                      <TableCell>{a.startTime}</TableCell>
                      <TableCell>{a.endTime}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(a.status)}>{a.status}</Badge>
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
          <CardTitle>{t('vehicleDetail.driverHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('vehicleDetail.driver')}</TableHead>
                <TableHead>{t('vehicleDetail.colFirstUsed')}</TableHead>
                <TableHead>{t('vehicleDetail.colLastUsed')}</TableHead>
                <TableHead>{t('vehicleDetail.colTotalAssignments')}</TableHead>
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
                  <TableRow key={row.id}>
                    <TableCell>{row.driver}</TableCell>
                    <TableCell>{formatDate(row.firstUsed)}</TableCell>
                    <TableCell>{formatDate(row.lastUsed)}</TableCell>
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
          <CardTitle>{t('vehicleDetail.handoverHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {handoversError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.handoversLoadError')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleDetail.date')}</TableHead>
                  <TableHead>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead>{t('vehicleDetail.colType')}</TableHead>
                  <TableHead>{t('vehicleDetail.colPhotoStatus')}</TableHead>
                  <TableHead>{t('vehicleDetail.colDamage')}</TableHead>
                  <TableHead>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {handovers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  handovers.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDate(h.handoverDateTime)}</TableCell>
                      <TableCell>
                        {h.driver ? `${h.driver.firstName} ${h.driver.lastName}` : '-'}
                      </TableCell>
                      <TableCell>{h.handoverType}</TableCell>
                      <TableCell>{h.photoStatus.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{h.damageDetected ? h.damageNotes ?? t('vehicleDetail.yes') : '-'}</TableCell>
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
          <CardTitle>{t('vehicleDetail.accidentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.incidentsLoadError')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleDetail.date')}</TableHead>
                  <TableHead>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead>{t('vehicleDetail.colDescription')}</TableHead>
                  <TableHead>{t('vehicleDetail.colDamageValue')}</TableHead>
                  <TableHead>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accidentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  accidentRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell>
                        {item.driver
                          ? `${item.driver.firstName} ${item.driver.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{currency(item.damageValue)}</TableCell>
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
          <CardTitle>{t('vehicleDetail.cargoHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.cargoLoadError')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleDetail.date')}</TableHead>
                  <TableHead>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead>{t('vehicleDetail.colCargoName')}</TableHead>
                  <TableHead>{t('vehicleDetail.colCargoOwner')}</TableHead>
                  <TableHead>{t('vehicleDetail.colDamageValue')}</TableHead>
                  <TableHead>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargoRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500">
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  cargoRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell>
                        {item.driver
                          ? `${item.driver.firstName} ${item.driver.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell>{item.cargoName ?? '-'}</TableCell>
                      <TableCell>{item.cargoOwner ?? '-'}</TableCell>
                      <TableCell>{currency(item.damageValue)}</TableCell>
                      <TableCell>{item.status}</TableCell>
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
