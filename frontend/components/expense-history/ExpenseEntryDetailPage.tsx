'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Ellipsis,
  Loader2,
  Pencil,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpenseEntrySidebar } from '@/components/expense-history/ExpenseEntrySidebar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useExpenseWatchlist } from '@/hooks/useExpenseWatchlist';
import {
  PendingFileUpload,
  uploadServiceRecordFiles,
} from '@/components/expense-history/ServiceRecordFileUpload';
import { documentsApi, driversApi, serviceRecordsApi, vehiclesApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { documentHasFile, openAuthenticatedDocument } from '@/lib/file-access';
import { canEditServiceRecords, canViewFinancials } from '@/lib/permissions';
import type { Document, Driver, ServiceRecord, Vehicle } from '@/lib/types';
import { vehicleAbbreviation } from '@/lib/timeline-utils';
import { cn } from '@/lib/utils';

function displayEntryId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function recordDateIso(value: string): string {
  return value.slice(0, 10);
}

function formatExpenseDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatAmount(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function displayText(value?: string | null): string {
  if (!value || value.trim() === '' || value === '—') return '—';
  return value;
}

function vehicleStatusDot(status?: Vehicle['status']) {
  if (status === 'active') return 'bg-[#1a4d7a]';
  if (status === 'maintenance') return 'bg-orange-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
}

type FormState = {
  vehicle_id: string;
  driver_id: string;
  date: string;
  service_type: string;
  vendor: string;
  repair_company: string;
  cost_amount: string;
  notes: string;
};

function toFormState(record: ServiceRecord): FormState {
  return {
    vehicle_id: record.vehicle_id,
    driver_id: record.driver_id ?? '',
    date: recordDateIso(record.date),
    service_type: record.service_type,
    vendor: record.vendor ?? '',
    repair_company: record.repair_company ?? '',
    cost_amount: record.cost_amount != null ? String(record.cost_amount) : '',
    notes: record.notes ?? '',
  };
}

function driverLabel(driver: Driver): string {
  return `${driver.first_name} ${driver.last_name}`.trim();
}

function DetailFieldRow({
  label,
  editing,
  view,
  children,
}: {
  label: string;
  editing: boolean;
  view: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-slate-100 py-4 sm:grid-cols-[160px_1fr] sm:gap-6">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="min-w-0 text-sm text-slate-900">{editing ? children : view}</div>
    </div>
  );
}

export function ExpenseEntryDetailPage({ entryId }: { entryId: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = getUser();
  const canEdit = canEditServiceRecords(user?.role ?? 'customer');
  const showAmounts = canViewFinancials(user?.role ?? 'customer');
  const { toggleWatch, watchedIds } = useExpenseWatchlist();
  const watched = watchedIds.includes(entryId);

  const [record, setRecord] = useState<ServiceRecord | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [photos, setPhotos] = useState<Document[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [receipts, setReceipts] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entry, vehiclePage, driverPage, allDocs] = await Promise.all([
        serviceRecordsApi.getById(entryId),
        vehiclesApi.list({ limit: 200 }),
        driversApi.list({ limit: 200 }),
        documentsApi.list('service_record', entryId),
      ]);
      setRecord(entry);
      setForm(toFormState(entry));
      setVehicles(vehiclePage.data);
      setDrivers(driverPage.data);
      setPhotos(allDocs.filter((doc) => doc.documentType === 'Photo'));
      setDocuments(allDocs.filter((doc) => doc.documentType === 'Service Document'));
      setReceipts(allDocs.filter((doc) => doc.documentType === 'Receipt'));
    } catch (e) {
      setRecord(null);
      setError(e instanceof Error ? e.message : t('expenseHistory.detail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [entryId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const vehicle = useMemo(
    () => vehicles.find((item) => item.id === (form?.vehicle_id ?? record?.vehicle_id)),
    [form?.vehicle_id, record?.vehicle_id, vehicles],
  );

  const driverName = useMemo(() => {
    if (record?.driver_name) return record.driver_name;
    const driver = drivers.find((item) => item.id === (form?.driver_id ?? record?.driver_id));
    return driver ? driverLabel(driver) : '—';
  }, [drivers, form?.driver_id, record?.driver_id, record?.driver_name]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function cancelEdit() {
    if (record) setForm(toFormState(record));
    setEditing(false);
    setSaveError(null);
  }

  async function saveChanges() {
    if (!record || !form) return;
    if (!form.service_type.trim()) {
      setSaveError(t('expenseHistory.create.missingFields'));
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await serviceRecordsApi.update(record.id, {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || undefined,
        date: form.date,
        service_type: form.service_type.trim(),
        vendor: form.vendor.trim() || undefined,
        repair_company: form.repair_company.trim() || '—',
        cost_amount: Number(form.cost_amount) || 0,
        notes: form.notes.trim() || undefined,
      });
      setRecord(updated);
      setForm(toFormState(updated));
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('expenseHistory.detail.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function reloadDocuments(recordId: string) {
    const allDocs = await documentsApi.list('service_record', recordId);
    setPhotos(allDocs.filter((doc) => doc.documentType === 'Photo'));
    setDocuments(allDocs.filter((doc) => doc.documentType === 'Service Document'));
    setReceipts(allDocs.filter((doc) => doc.documentType === 'Receipt'));
  }

  async function uploadAddedFiles(
    added: File[],
    documentType: 'Photo' | 'Service Document',
  ) {
    if (!record || added.length === 0) return;

    setUploading(true);
    setSaveError(null);
    try {
      await uploadServiceRecordFiles(record.id, added, documentType, documentsApi.upload);
      await reloadDocuments(record.id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('expenseHistory.detail.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  function renderDocumentList(items: Document[]) {
    if (items.length === 0) return <span className="text-slate-500">—</span>;
    return (
      <ul className="space-y-1">
        {items.map((doc) => (
          <li key={doc.id}>
            {documentHasFile(doc) ? (
              <button
                type="button"
                onClick={() => void openAuthenticatedDocument(doc.id, doc.fileName)}
                className="text-[#1a4d7a] hover:underline"
              >
                {doc.fileName}
              </button>
            ) : (
              <span className="text-slate-600">{doc.fileName || doc.documentType}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  if (error || !record || !form) {
    return (
      <EmptyState
        icon={Wallet}
        title={t('expenseHistory.detail.loadError')}
        subtitle={error ?? t('expenseHistory.detail.notFound')}
        actionLabel={t('expenseHistory.detail.backToList')}
        onAction={() => router.push('/service-history')}
      />
    );
  }

  const badge = vehicle
    ? vehicleAbbreviation(vehicle.brand, vehicle.model, vehicle.plate_number)
    : record.vehicle_plate.slice(0, 3).toUpperCase();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <Link
              href="/service-history"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#1a4d7a] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('expenseHistory.title')}
            </Link>
            <h1 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">
              {t('expenseHistory.detail.title', { id: displayEntryId(record.id) })}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn('gap-2', watched && 'border-[#1a4d7a] bg-[#e8f0f8] text-[#0b2342]')}
              onClick={() => toggleWatch(entryId)}
            >
              <Bell className="h-4 w-4" />
              {watched ? t('expenseHistory.detail.unwatch') : t('expenseHistory.detail.watch')}
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label={t('expenseHistory.moreActions')}>
              <Ellipsis className="h-4 w-4" />
            </Button>
            {canEdit && !editing ? (
              <Button type="button" variant="outline" className="gap-2" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                {t('common.edit')}
              </Button>
            ) : null}
            {canEdit && editing ? (
              <>
                <Button type="button" variant="ghost" onClick={cancelEdit} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  className="bg-[#1a4d7a] text-white hover:bg-[#0b2342]"
                  onClick={() => void saveChanges()}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('common.save')}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-6 sm:px-6">
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-5 pb-2">
              <h2 className="border-b border-slate-200 px-0 pb-4 pt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {t('expenseHistory.detail.allFields')}
              </h2>

              <DetailFieldRow
                label={t('expenseHistory.colVehicle')}
                editing={editing}
                view={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded bg-slate-100 px-1.5 text-[10px] font-bold uppercase text-slate-600">
                      {badge}
                    </span>
                    <span className={cn('inline-block h-2 w-2 rounded-full', vehicleStatusDot(vehicle?.status))} />
                    <Link
                      href={`/vehicles/${record.vehicle_id}`}
                      className="font-semibold text-[#1a4d7a] hover:underline"
                    >
                      {record.vehicle_plate}
                    </Link>
                  </div>
                }
              >
                <Select
                  value={form.vehicle_id}
                  onChange={(event) => updateForm('vehicle_id', event.target.value)}
                  className="max-w-md"
                >
                  {vehicles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.plate_number} · {item.brand} {item.model}
                    </option>
                  ))}
                </Select>
              </DetailFieldRow>

              <DetailFieldRow
                label={t('serviceHistory.colDriver')}
                editing={editing}
                view={displayText(driverName === '—' ? undefined : driverName)}
              >
                <Select
                  value={form.driver_id}
                  onChange={(event) => updateForm('driver_id', event.target.value)}
                  className="max-w-md"
                >
                  <option value="">{t('serviceHistory.create.selectDriver')}</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driverLabel(driver)}
                    </option>
                  ))}
                </Select>
              </DetailFieldRow>

              <DetailFieldRow
                label={t('expenseHistory.colDate')}
                editing={editing}
                view={
                  <span className="text-[#1a4d7a] underline decoration-[#1a4d7a]/40 underline-offset-2">
                    {formatExpenseDate(record.date, i18n.language)}
                  </span>
                }
              >
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) => updateForm('date', event.target.value)}
                  className="max-w-xs"
                />
              </DetailFieldRow>

              <DetailFieldRow
                label={t('expenseHistory.colType')}
                editing={editing}
                view={displayText(record.service_type)}
              >
                <Input
                  value={form.service_type}
                  onChange={(event) => updateForm('service_type', event.target.value)}
                  className="max-w-md"
                />
              </DetailFieldRow>

              <DetailFieldRow
                label={t('expenseHistory.colSource')}
                editing={editing}
                view={t('expenseHistory.sourceManual')}
              >
                <span className="text-slate-600">{t('expenseHistory.sourceManual')}</span>
              </DetailFieldRow>

              <DetailFieldRow
                label={t('expenseHistory.colVendor')}
                editing={editing}
                view={displayText(record.vendor)}
              >
                <Input
                  value={form.vendor}
                  onChange={(event) => updateForm('vendor', event.target.value)}
                  className="max-w-md"
                  placeholder={t('expenseHistory.create.vendorPlaceholder')}
                />
              </DetailFieldRow>

              <DetailFieldRow
                label={t('expenseHistory.colAmount')}
                editing={editing}
                view={showAmounts ? formatAmount(record.cost_amount, i18n.language) : '—'}
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_amount}
                  onChange={(event) => updateForm('cost_amount', event.target.value)}
                  className="max-w-xs"
                  disabled={!canEdit}
                />
              </DetailFieldRow>

              <DetailFieldRow
                label={t('serviceHistory.colNotes')}
                editing={editing}
                view={<span className="whitespace-pre-wrap">{displayText(record.notes)}</span>}
              >
                <textarea
                  value={form.notes}
                  onChange={(event) => updateForm('notes', event.target.value)}
                  rows={4}
                  className="flex min-h-[96px] w-full max-w-2xl rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1a4d7a]"
                />
              </DetailFieldRow>

              <DetailFieldRow
                label={t('expenseHistory.colRepairCompany')}
                editing={editing}
                view={displayText(record.repair_company)}
              >
                <Input
                  value={form.repair_company}
                  onChange={(event) => updateForm('repair_company', event.target.value)}
                  className="max-w-md"
                  placeholder={t('expenseHistory.create.repairCompanyPlaceholder')}
                />
              </DetailFieldRow>

              <DetailFieldRow
                label={t('serviceHistory.create.sectionPhotos')}
                editing={canEdit}
                view={renderDocumentList(photos)}
              >
                <div className="max-w-xl space-y-3">
                  {renderDocumentList(photos)}
                  <PendingFileUpload
                    label={t('serviceHistory.create.uploadPhotos')}
                    hint={t('serviceHistory.create.uploadPhotosHint')}
                    accept="image/*"
                    files={[]}
                    onChange={() => {}}
                    onAddFiles={(added) => uploadAddedFiles(added, 'Photo')}
                    disabled={uploading}
                    icon="photo"
                  />
                  {uploading ? (
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('expenseHistory.detail.uploading')}
                    </p>
                  ) : null}
                </div>
              </DetailFieldRow>

              <DetailFieldRow
                label={t('serviceHistory.create.sectionDocuments')}
                editing={canEdit}
                view={renderDocumentList([...documents, ...receipts])}
              >
                <div className="max-w-xl space-y-3">
                  {renderDocumentList([...documents, ...receipts])}
                  <PendingFileUpload
                    label={t('serviceHistory.create.uploadDocuments')}
                    hint={t('serviceHistory.create.uploadDocumentsHint')}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                    files={[]}
                    onChange={() => {}}
                    onAddFiles={(added) => uploadAddedFiles(added, 'Service Document')}
                    disabled={uploading}
                    icon="document"
                  />
                </div>
              </DetailFieldRow>

              {saveError ? <p className="py-3 text-sm text-red-600">{saveError}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <ExpenseEntrySidebar />
    </div>
  );
}
