'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, Pencil, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vehiclesApi, documentsApi, serviceRecordsApi, type VehicleEquipmentItem } from '@/lib/api';
import type { VehicleDetail, Document, ServiceRecord } from '@/lib/types';
import { useTranslation } from 'react-i18next';
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
import { DocumentFileLink } from '@/components/documents/DocumentFileLink';
import { ServiceRecordInlineField } from '@/components/service-records/ServiceRecordInlineField';
import { VehicleHandoverHistory, type VehicleHandoverHistoryRow } from '@/components/vehicles/VehicleHandoverHistory';
import { VehiclePlateDisplay } from '@/components/vehicles/VehiclePlateDisplay';
import { getUser } from '@/lib/auth';
import { canEditServiceRecords } from '@/lib/permissions';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const VEHICLE_DOCUMENT_TYPES = ['TUV', 'SP', 'Registration', 'Insurance', 'Service Report'] as const;

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

type VehicleHandoverRow = VehicleHandoverHistoryRow;

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
  const canEditServiceHistory = canEditServiceRecords(getUser()?.role ?? 'customer');

  const handleServiceRecordUpdated = useCallback((updated: ServiceRecord) => {
    setServiceRecords((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
  }, []);

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

  const [equipment, setEquipment] = useState<VehicleEquipmentItem[]>([]);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentQty, setEquipmentQty] = useState('1');
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentPhotoUploadingId, setEquipmentPhotoUploadingId] = useState<string | null>(null);

  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [serviceRecordsError, setServiceRecordsError] = useState<string | null>(null);

  const [uploadDocType, setUploadDocType] = useState<string>(VEHICLE_DOCUMENT_TYPES[0]);
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocError, setUploadDocError] = useState<string | null>(null);

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
    vehiclesApi
      .listEquipment(id)
      .then(setEquipment)
      .catch((e) => setEquipmentError(e?.message ?? 'Failed'));
    serviceRecordsApi
      .list({ vehicle_id: id })
      .then(setServiceRecords)
      .catch((e) => setServiceRecordsError(e?.message ?? 'Failed'));
  }, [id]);

  async function addEquipmentItem() {
    if (!equipmentName.trim()) return;
    setEquipmentSaving(true);
    try {
      const created = await vehiclesApi.createEquipment(id, {
        name: equipmentName.trim(),
        quantity: Number.parseInt(equipmentQty, 10) || 1,
      });
      setEquipment((current) => [...current, created]);
      setEquipmentName('');
      setEquipmentQty('1');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('vehicleDetail.equipmentSaveError'));
    } finally {
      setEquipmentSaving(false);
    }
  }

  async function uploadEquipmentPhoto(item: VehicleEquipmentItem, file: File) {
    setEquipmentPhotoUploadingId(item.id);
    try {
      const formData = new FormData();
      formData.append('ownerType', 'vehicle_equipment');
      formData.append('ownerId', item.id);
      formData.append('documentType', 'Equipment Photo');
      formData.append('file', file);
      const uploaded = await documentsApi.upload(formData);
      const updated = await vehiclesApi.updateEquipment(id, item.id, {
        photoDocumentId: uploaded.id,
      });
      setEquipment((current) => current.map((row) => (row.id === item.id ? updated : row)));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('vehicleDetail.equipmentPhotoFailed'));
    } finally {
      setEquipmentPhotoUploadingId(null);
    }
  }

  async function handleUploadDocument() {
    if (!uploadFile) {
      setUploadDocError(t('vehicleDetail.uploadFileRequired'));
      return;
    }
    setUploadingDoc(true);
    setUploadDocError(null);
    try {
      const formData = new FormData();
      formData.append('ownerType', 'vehicle');
      formData.append('ownerId', id);
      formData.append('documentType', uploadDocType);
      if (uploadExpiry.trim()) {
        formData.append('expiryDate', uploadExpiry.trim());
      }
      formData.append('file', uploadFile);
      await documentsApi.upload(formData);
      setUploadFile(null);
      setUploadExpiry('');
      const rows = await documentsApi.list('vehicle', id);
      setDocuments(rows);
    } catch (e) {
      setUploadDocError(e instanceof Error ? e.message : t('vehicleDetail.uploadFailed'));
    } finally {
      setUploadingDoc(false);
    }
  }

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
        <CardContent className="space-y-4 border-b border-slate-200 p-4">
          <p className="text-sm text-slate-600">{t('vehicleDetail.uploadDocumentHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t('vehicleDetail.colDocType')}
              </label>
              <Select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
                className="w-full"
              >
                {VEHICLE_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t('vehicleDetail.colExpiryDate')}
              </label>
              <Input
                type="date"
                value={uploadExpiry}
                onChange={(e) => setUploadExpiry(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t('vehicleDetail.uploadFile')}
              </label>
              <Input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => void handleUploadDocument()}
                disabled={uploadingDoc || !uploadFile}
                className="w-full"
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadingDoc ? t('vehicleDetail.uploading') : t('vehicleDetail.uploadDocument')}
              </Button>
            </div>
          </div>
          {uploadDocError ? <p className="text-sm text-red-600">{uploadDocError}</p> : null}
        </CardContent>
        <CardContent className="p-0">
          {documentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.documentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colDocType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colFileName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colExpiryDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.status')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colUploadedAt')}</TableHead>
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
          <CardTitle>{t('vehicleDetail.equipment')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={equipmentName}
              onChange={(e) => setEquipmentName(e.target.value)}
              placeholder={t('vehicleDetail.equipmentNamePlaceholder')}
            />
            <Input
              value={equipmentQty}
              onChange={(e) => setEquipmentQty(e.target.value)}
              className="sm:w-24"
              placeholder="Qty"
            />
            <Button onClick={() => void addEquipmentItem()} disabled={equipmentSaving || !equipmentName.trim()}>
              {t('vehicleDetail.equipmentAdd')}
            </Button>
          </div>
          {equipmentError ? (
            <p className="text-sm text-gray-500">{equipmentError}</p>
          ) : equipment.length === 0 ? (
            <p className="text-sm text-gray-500">{t('vehicleDetail.equipmentEmpty')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.equipmentColName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.equipmentColQty')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.equipmentColPhoto')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {equipment.map((item) => (
                  <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                    <TableCell className={FLEET_TABLE_CELL}>{item.name}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.quantity}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {item.photoDocumentId ? (
                        <DocumentFileLink
                          document={{
                            id: item.photoDocumentId,
                            fileName: `${item.name}.jpg`,
                            download_url: `/documents/${item.photoDocumentId}/download`,
                          }}
                          variant="link"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">{t('vehicleDetail.equipmentNoPhoto')}</span>
                      )}
                      <label className="mt-1 block cursor-pointer text-xs text-[#1a4d7a] hover:underline">
                        {equipmentPhotoUploadingId === item.id
                          ? t('vehicleDetail.equipmentPhotoUploading')
                          : t('vehicleDetail.equipmentPhotoUpload')}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={equipmentPhotoUploadingId === item.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void uploadEquipmentPhoto(item, file);
                          }}
                        />
                      </label>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{item.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicleDetail.serviceHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {serviceRecordsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.serviceHistoryLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.colTask')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.colRepairCompany')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.colMileage')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.colCost')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('serviceHistory.colNotes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {serviceRecords.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={7} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  serviceRecords.map((row) => (
                    <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.date)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.driver_name ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <ServiceRecordInlineField
                          record={row}
                          field="service_type"
                          canEdit={canEditServiceHistory}
                          onUpdated={handleServiceRecordUpdated}
                        />
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{row.repair_company}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {row.mileage_km !== null && row.mileage_km !== undefined
                          ? row.mileage_km.toLocaleString('de-DE')
                          : '-'}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{currency(row.cost_amount)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <ServiceRecordInlineField
                          record={row}
                          field="notes"
                          canEdit={canEditServiceHistory}
                          onUpdated={handleServiceRecordUpdated}
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
          <CardTitle>{t('vehicleDetail.assignmentHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.assignmentsLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.company')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.startTime')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.endTime')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {assignments.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={6} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  assignments.map((a) => (
                    <TableRow className={FLEET_TABLE_ROW} key={a.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(a.workDate)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {a.driver.firstName} {a.driver.lastName}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{a.company.name}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{a.startTime}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{a.endTime}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
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
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.driver')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colFirstUsed')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colLastUsed')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colTotalAssignments')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {driverHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                    {t('common.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                driverHistory.map((row) => (
                  <TableRow className={FLEET_TABLE_ROW} key={row.id}>
                    <TableCell className={FLEET_TABLE_CELL}>{row.driver}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.firstUsed)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{formatDate(row.lastUsed)}</TableCell>
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
          <CardTitle>{t('vehicleDetail.handoverHistory')}</CardTitle>
          <p className="text-sm text-slate-500">{t('vehicleDetail.handoverHistoryHint')}</p>
        </CardHeader>
        <CardContent className="p-0">
          {handoversError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.handoversLoadError')}</p>
          ) : (
            <VehicleHandoverHistory handovers={handovers} />
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
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colDescription')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colDamageValue')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {accidentRows.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={5} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  accidentRows.map((item) => (
                    <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {item.driver
                          ? `${item.driver.firstName} ${item.driver.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.description}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{currency(item.damageValue)}</TableCell>
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
        <CardHeader>
          <CardTitle>{t('vehicleDetail.cargoHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {incidentsError ? (
            <p className="p-4 text-sm text-gray-500">{t('vehicleDetail.cargoLoadError')}</p>
          ) : (
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.date')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colCargoName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colCargoOwner')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.colDamageValue')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('vehicleDetail.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {cargoRows.length === 0 ? (
                  <TableRow className={FLEET_TABLE_ROW}>
                    <TableCell colSpan={6} className={cn(FLEET_TABLE_CELL_MUTED, 'text-center')}>
                      {t('common.noRecords')}
                    </TableCell>
                  </TableRow>
                ) : (
                  cargoRows.map((item) => (
                    <TableRow className={FLEET_TABLE_ROW} key={item.id}>
                      <TableCell className={FLEET_TABLE_CELL}>{formatDate(item.incidentDateTime)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {item.driver
                          ? `${item.driver.firstName} ${item.driver.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.cargoName ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.cargoOwner ?? '-'}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{currency(item.damageValue)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.status}</TableCell>
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
