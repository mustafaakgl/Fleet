'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineSearchSelect } from '@/components/expense-history/InlineSearchSelect';
import {
  PendingFileUpload,
  uploadServiceRecordFiles,
} from '@/components/expense-history/ServiceRecordFileUpload';
import { documentsApi, driversApi, serviceRecordsApi, vehiclesApi } from '@/lib/api';
import {
  REPAIR_PRIORITY_OPTIONS,
  type RepairPriorityClass,
} from '@/lib/service-record-categories';
import { COMMON_SERVICE_TASKS } from '@/lib/service-reminders';
import type { Driver, ServiceRecord, Vehicle } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CreateExpenseEntryDialogProps {
  open: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
  onCreated: (record: ServiceRecord, options?: { keepOpen?: boolean }) => void;
}

type LineItem = {
  id: string;
  description: string;
  amount: string;
};

type VehicleIncident = {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  date?: string;
};

const SERVICE_LABELS = [
  'maintenance',
  'compliance',
  'warranty',
  'tires',
  'brakes',
  'engine',
  'body',
] as const;

function nowDateTimeLocal(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toApiDate(value: string): string {
  return value.slice(0, 10);
}

function buildServiceType(priority: RepairPriorityClass, lineItems: LineItem[]): string {
  const tasks = lineItems
    .map((item) => item.description.trim())
    .filter(Boolean)
    .join('; ');
  if (!tasks) return 'General Maintenance';

  if (priority === 'scheduled') return tasks.includes('Scheduled') ? tasks : `Scheduled Maintenance — ${tasks}`;
  if (priority === 'emergency') return tasks.toLowerCase().includes('emergency') ? tasks : `Emergency Repair — ${tasks}`;
  return tasks;
}

function buildNotesPayload(input: {
  reference: string;
  labels: string[];
  startDate: string;
  priority: RepairPriorityClass;
  issueIds: string[];
  comments: string;
  lineItems: LineItem[];
}): string | undefined {
  const blocks: string[] = [];

  if (input.reference.trim()) blocks.push(`Reference: ${input.reference.trim()}`);
  if (input.labels.length > 0) blocks.push(`Labels: ${input.labels.join(', ')}`);
  if (input.startDate.trim()) blocks.push(`Start: ${input.startDate}`);
  if (input.priority !== 'none') blocks.push(`Priority: ${input.priority}`);
  if (input.issueIds.length > 0) blocks.push(`Linked issues: ${input.issueIds.join(', ')}`);

  const lineSummary = input.lineItems
    .filter((item) => item.description.trim())
    .map((item) => {
      const amount = Number(item.amount);
      const amountLabel = Number.isFinite(amount) && amount > 0 ? ` (€${amount.toFixed(2)})` : '';
      return `${item.description.trim()}${amountLabel}`;
    });
  if (lineSummary.length > 0) blocks.push(`Line items:\n- ${lineSummary.join('\n- ')}`);
  if (input.comments.trim()) blocks.push(input.comments.trim());

  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
      {children}
    </h3>
  );
}

function VehicleGate({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function CreateExpenseEntryDialog({
  open,
  vehicles,
  onClose,
  onCreated,
}: CreateExpenseEntryDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [vehicleId, setVehicleId] = useState('');
  const [priorityClass, setPriorityClass] = useState<RepairPriorityClass | ''>('');
  const [completionDate, setCompletionDate] = useState('');
  const [showStartDate, setShowStartDate] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [reference, setReference] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vendor, setVendor] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ id: 'line-1', description: '', amount: '' }]);
  const [costAmount, setCostAmount] = useState('');
  const [costTouched, setCostTouched] = useState(false);
  const [mileageKm, setMileageKm] = useState('');
  const [comments, setComments] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [repairCompanies, setRepairCompanies] = useState<string[]>([]);
  const [dialogVehicles, setDialogVehicles] = useState<Vehicle[]>(vehicles);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [incidents, setIncidents] = useState<VehicleIncident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasVehicle = Boolean(vehicleId);

  const availableVehicles = dialogVehicles.length > 0 ? dialogVehicles : vehicles;

  const resetForm = useCallback(() => {
    setVehicleId(availableVehicles[0]?.id ?? '');
    setPriorityClass('');
    setCompletionDate(nowDateTimeLocal());
    setShowStartDate(false);
    setStartDate('');
    setReference('');
    setDriverId('');
    setVendor('');
    setLabels([]);
    setLineItems([{ id: `line-${Date.now()}`, description: '', amount: '' }]);
    setCostAmount('');
    setCostTouched(false);
    setMileageKm('');
    setComments('');
    setPhotoFiles([]);
    setDocumentFiles([]);
    setSelectedIssueIds([]);
    setIncidents([]);
    setError(null);
  }, [availableVehicles]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || vehicleId || availableVehicles.length === 0) return;
    setVehicleId(availableVehicles[0].id);
  }, [open, vehicleId, availableVehicles]);

  useEffect(() => {
    if (!open) return;
    setDialogVehicles(vehicles);
    serviceRecordsApi
      .getRepairCompanies()
      .then((companies) => setRepairCompanies(companies.filter(Boolean)))
      .catch(() => setRepairCompanies([]));
    vehiclesApi
      .list({ limit: 500 })
      .then((page) => setDialogVehicles(page.data))
      .catch(() => setDialogVehicles(vehicles));
    driversApi
      .list({ limit: 200 })
      .then((page) => setDrivers(page.data))
      .catch(() => setDrivers([]));
  }, [open, vehicles]);

  const vehicleOptions = useMemo(
    () =>
      availableVehicles.map((vehicle) => ({
        value: vehicle.id,
        label: `${vehicle.plate_number} · ${vehicle.brand} ${vehicle.model}`,
        searchText: `${vehicle.plate_number} ${vehicle.brand} ${vehicle.model}`,
      })),
    [availableVehicles],
  );

  const driverOptions = useMemo(
    () =>
      drivers.map((driver) => ({
        value: driver.id,
        label: `${driver.first_name} ${driver.last_name}`.trim(),
        searchText: `${driver.first_name} ${driver.last_name}`,
      })),
    [drivers],
  );

  const lineItemsTotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    [lineItems],
  );

  useEffect(() => {
    if (!costTouched) {
      setCostAmount(lineItemsTotal > 0 ? lineItemsTotal.toFixed(2) : '');
    }
  }, [lineItemsTotal, costTouched]);

  useEffect(() => {
    if (!open || !vehicleId) {
      setIncidents([]);
      setSelectedIssueIds([]);
      return;
    }

    let active = true;
    setIncidentsLoading(true);
    vehiclesApi
      .getIncidents(vehicleId)
      .then((rows) => {
        if (!active) return;
        setIncidents(Array.isArray(rows) ? (rows as VehicleIncident[]) : []);
      })
      .catch(() => {
        if (active) setIncidents([]);
      })
      .finally(() => {
        if (active) setIncidentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, vehicleId]);

  const vendorOptions = useMemo(() => {
    const values = new Set(repairCompanies);
    if (vendor.trim()) values.add(vendor.trim());
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [repairCompanies, vendor]);

  function toggleLabel(label: string) {
    setLabels((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  function toggleIssue(id: string) {
    setSelectedIssueIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function updateLineItem(id: string, patch: Partial<LineItem>) {
    setLineItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((current) => [...current, { id: `line-${Date.now()}`, description: '', amount: '' }]);
  }

  function removeLineItem(id: string) {
    setLineItems((current) => (current.length <= 1 ? current : current.filter((item) => item.id !== id)));
  }

  async function submit(keepOpen: boolean) {
    if (!vehicleId || !completionDate) {
      setError(t('serviceHistory.create.missingFields'));
      return;
    }

    const validLineItems = lineItems.filter((item) => item.description.trim());
    if (validLineItems.length === 0) {
      setError(t('serviceHistory.create.missingLineItems'));
      return;
    }

    const total = Number(costAmount) || lineItemsTotal;
    const resolvedPriority: RepairPriorityClass = priorityClass || 'none';
    const vendorValue = vendor.trim();

    setSaving(true);
    setError(null);
    try {
      const created = await serviceRecordsApi.create({
        vehicle_id: vehicleId,
        driver_id: driverId || undefined,
        date: toApiDate(completionDate),
        service_type: buildServiceType(resolvedPriority, validLineItems),
        vendor: vendorValue || undefined,
        repair_company: vendorValue || t('serviceHistory.create.defaultVendor'),
        cost_amount: total,
        mileage_km: mileageKm.trim() ? Number(mileageKm) : undefined,
        notes: buildNotesPayload({
          reference,
          labels,
          startDate: showStartDate ? startDate : '',
          priority: resolvedPriority,
          issueIds: selectedIssueIds,
          comments,
          lineItems: validLineItems,
        }),
      });

      const uploads: Promise<void>[] = [];
      if (photoFiles.length > 0) {
        uploads.push(
          uploadServiceRecordFiles(created.id, photoFiles, 'Photo', documentsApi.upload),
        );
      }
      if (documentFiles.length > 0) {
        uploads.push(
          uploadServiceRecordFiles(
            created.id,
            documentFiles,
            'Service Document',
            documentsApi.upload,
          ),
        );
      }
      if (uploads.length > 0) await Promise.all(uploads);

      onCreated(created, { keepOpen });
      if (keepOpen) {
        resetForm();
      } else {
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('serviceHistory.create.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-4">
          <DialogTitle>{t('serviceHistory.create.title')}</DialogTitle>
        </DialogHeader>

        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-5"
        >
          <section className="space-y-4">
            <SectionTitle>{t('serviceHistory.create.sectionDetails')}</SectionTitle>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="service-vehicle">
                  {t('serviceHistory.create.vehicle')} <span className="text-red-600">*</span>
                </Label>
                <InlineSearchSelect
                  id="service-vehicle"
                  value={vehicleId}
                  onChange={setVehicleId}
                  options={vehicleOptions}
                  placeholder={t('serviceHistory.create.selectVehicle')}
                  searchPlaceholder={t('serviceHistory.create.searchVehicle')}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="service-priority">{t('serviceHistory.create.priorityClass')}</Label>
                <Select
                  id="service-priority"
                  value={priorityClass}
                  onChange={(event) => setPriorityClass(event.target.value as RepairPriorityClass | '')}
                  className="w-full"
                >
                  <option value="">{t('serviceHistory.create.selectPriority')}</option>
                  {REPAIR_PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(`serviceHistory.priority.${option}`)}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500">{t('serviceHistory.create.priorityHelp')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-completion">
                  {t('serviceHistory.create.completionDate')} <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="service-completion"
                  type="datetime-local"
                  value={completionDate}
                  onChange={(event) => setCompletionDate(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-mileage">{t('serviceHistory.create.meter')}</Label>
                <Input
                  id="service-mileage"
                  type="number"
                  min="0"
                  value={mileageKm}
                  onChange={(event) => setMileageKm(event.target.value)}
                  placeholder="km"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="text-sm font-medium text-brand-primary hover:underline"
                  onClick={() => setShowStartDate((current) => !current)}
                >
                  {t('serviceHistory.create.setStartDate')}
                </button>
                {showStartDate ? (
                  <div className="mt-2 space-y-2">
                    <Label htmlFor="service-start">{t('serviceHistory.create.startDate')}</Label>
                    <Input
                      id="service-start"
                      type="datetime-local"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-driver">{t('serviceHistory.create.driver')}</Label>
                <InlineSearchSelect
                  id="service-driver"
                  value={driverId}
                  onChange={setDriverId}
                  options={driverOptions}
                  placeholder={t('serviceHistory.create.selectDriver')}
                  searchPlaceholder={t('serviceHistory.create.searchDriver')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-reference">{t('serviceHistory.create.reference')}</Label>
                <Input
                  id="service-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={t('serviceHistory.create.referencePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-vendor">{t('serviceHistory.create.vendor')}</Label>
                <Input
                  id="service-vendor"
                  list="service-vendor-suggestions"
                  value={vendor}
                  onChange={(event) => setVendor(event.target.value)}
                  placeholder={t('serviceHistory.create.vendorPlaceholder')}
                />
                <datalist id="service-vendor-suggestions">
                  {vendorOptions.map((company) => (
                    <option key={company} value={company} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-cost">{t('serviceHistory.create.cost')}</Label>
                <Input
                  id="service-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={costAmount}
                  onChange={(event) => {
                    setCostTouched(true);
                    setCostAmount(event.target.value);
                  }}
                  placeholder="0.00"
                />
                <p className="text-xs text-slate-500">{t('serviceHistory.create.costHelp')}</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>{t('serviceHistory.create.labels')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_LABELS.map((label) => {
                    const active = labels.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleLabel(label)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-brand-primary bg-surface text-brand-primary'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {t(`serviceHistory.create.label.${label}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>{t('serviceHistory.create.sectionIssues')}</SectionTitle>
            {!hasVehicle ? (
              <VehicleGate message={t('serviceHistory.create.selectVehicleFirst')} />
            ) : incidentsLoading ? (
              <p className="text-sm text-slate-500">{t('serviceHistory.create.loadingIssues')}</p>
            ) : incidents.length === 0 ? (
              <VehicleGate message={t('serviceHistory.create.noIssues')} />
            ) : (
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                {incidents.map((incident, index) => {
                  const id = incident.id ?? `incident-${index}`;
                  const label =
                    incident.title ||
                    incident.description ||
                    incident.type ||
                    t('serviceHistory.create.issueFallback', { index: index + 1 });
                  return (
                    <label key={id} className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedIssueIds.includes(id)}
                        onChange={() => toggleIssue(id)}
                        className="mt-0.5"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionTitle>{t('serviceHistory.create.sectionLineItems')}</SectionTitle>
            {!hasVehicle ? (
              <VehicleGate message={t('serviceHistory.create.selectVehicleFirst')} />
            ) : (
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_140px_auto]">
                    <div className="space-y-1">
                      <Label htmlFor={`${item.id}-desc`}>
                        {t('serviceHistory.create.lineItemTask')}
                        {index === 0 ? <span className="text-red-600"> *</span> : null}
                      </Label>
                      <Input
                        id={`${item.id}-desc`}
                        list="service-task-suggestions"
                        value={item.description}
                        onChange={(event) => updateLineItem(item.id, { description: event.target.value })}
                        placeholder={t('serviceHistory.create.lineItemPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${item.id}-amount`}>{t('serviceHistory.create.lineItemAmount')}</Label>
                      <Input
                        id={`${item.id}-amount`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount}
                        onChange={(event) => updateLineItem(item.id, { amount: event.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={lineItems.length <= 1}
                        onClick={() => removeLineItem(item.id)}
                        aria-label={t('serviceHistory.create.removeLineItem')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <datalist id="service-task-suggestions">
                  {COMMON_SERVICE_TASKS.map((task) => (
                    <option key={task} value={task} />
                  ))}
                </datalist>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('serviceHistory.create.addLineItem')}
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionTitle>{t('serviceHistory.create.sectionPhotos')}</SectionTitle>
            <PendingFileUpload
              id="service-photos"
              label={t('serviceHistory.create.uploadPhotos')}
              hint={t('serviceHistory.create.uploadPhotosHint')}
              accept="image/*"
              files={photoFiles}
              onChange={setPhotoFiles}
              disabled={saving}
              icon="photo"
            />
          </section>

          <section className="space-y-3">
            <SectionTitle>{t('serviceHistory.create.sectionDocuments')}</SectionTitle>
            <PendingFileUpload
              id="service-documents"
              label={t('serviceHistory.create.uploadDocuments')}
              hint={t('serviceHistory.create.uploadDocumentsHint')}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
              files={documentFiles}
              onChange={setDocumentFiles}
              disabled={saving}
              icon="document"
            />
          </section>

          <section className="space-y-2">
            <SectionTitle>{t('serviceHistory.create.sectionComments')}</SectionTitle>
            <textarea
              id="service-comments"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              rows={4}
              className="flex min-h-[96px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary"
              placeholder={t('serviceHistory.create.commentsPlaceholder')}
            />
          </section>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>

        <DialogFooter className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void submit(true)}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('serviceHistory.create.saveAndAddAnother')}
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={saving}
              className="bg-brand-primary text-white hover:bg-brand-primary"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('serviceHistory.create.saveEntry')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
