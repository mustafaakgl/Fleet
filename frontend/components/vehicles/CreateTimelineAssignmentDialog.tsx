'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Loader2 } from 'lucide-react';
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
import { assignmentsApi } from '@/lib/api';
import { buildVehicleTimelineNotes } from '@/lib/vehicle-assignment-source';
import { formatDateUs, formatTime12h, minutesFromTime } from '@/lib/timeline-utils';
import type { Company, Driver, Vehicle } from '@/lib/types';

export type TimelineDraft = {
  vehicle: Vehicle;
  workDate: string;
  startTime: string;
  endTime: string;
};

interface CreateTimelineAssignmentDialogProps {
  open: boolean;
  draft: TimelineDraft | null;
  vehicles: Vehicle[];
  drivers: Driver[];
  companies: Company[];
  onClose: () => void;
  onCreated: () => void;
}

function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">
      {children} <span className="text-red-500">*</span>
    </Label>
  );
}

export function CreateTimelineAssignmentDialog({
  open,
  draft,
  vehicles,
  drivers,
  companies,
  onClose,
  onCreated,
}: CreateTimelineAssignmentDialogProps) {
  const { t } = useTranslation();
  const [vehicleId, setVehicleId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [driverId, setDriverId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !draft) return;
    setVehicleId(draft.vehicle.id);
    setWorkDate(draft.workDate);
    setStartTime(draft.startTime);
    setEndTime(draft.endTime);
    setDriverId('');
    setCompanyId('');
    setComment('');
    setError(null);
  }, [open, draft]);

  useEffect(() => {
    if (!driverId) {
      setCompanyId('');
      return;
    }
    const driver = drivers.find((item) => item.id === driverId);
    if (!driver?.current_company_name) {
      setCompanyId('');
      return;
    }
    const match = companies.find(
      (item) => item.name.toLowerCase() === driver.current_company_name?.toLowerCase(),
    );
    setCompanyId(match?.id ?? '');
  }, [driverId, drivers, companies]);

  const selectedVehicle = vehicles.find((item) => item.id === vehicleId) ?? draft?.vehicle ?? null;
  const company = companies.find((item) => item.id === companyId);
  const canSave = Boolean(
    selectedVehicle && driverId && companyId && startTime && endTime && workDate,
  );

  const timePreview = useMemo(
    () => ({
      start: formatTime12h(startTime || '00:00'),
      end: formatTime12h(endTime || '00:00'),
    }),
    [startTime, endTime],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedVehicle || !driverId || !company) {
      setError(t('vehicleAssignments.create.missingFields'));
      return;
    }

    if (minutesFromTime(endTime) <= minutesFromTime(startTime)) {
      setError(t('vehicleAssignments.create.invalidRange'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await assignmentsApi.create({
        driver_id: driverId,
        vehicle_id: selectedVehicle.id,
        company_id: company.id,
        company_name: company.name,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        cargo_name: t('vehicleAssignments.create.defaultCargo'),
        cargo_owner: company.name,
        pickup_address: t('vehicleAssignments.create.defaultPickup'),
        delivery_address: t('vehicleAssignments.create.defaultDelivery'),
        notes: buildVehicleTimelineNotes(
          comment.trim(),
          t('vehicleAssignments.create.defaultNotes'),
        ),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const text = Array.isArray(message) ? message.join(' ') : message;
      setError(
        text === 'CONFLICT'
          ? t('assignmentForm.conflict')
          : text || t('vehicleAssignments.create.error'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle className="text-left text-xl font-semibold text-slate-900">
            {selectedVehicle
              ? t('vehicleAssignments.create.titleFor', { plate: selectedVehicle.plate_number })
              : t('vehicleAssignments.create.title')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <RequiredLabel htmlFor="timeline-vehicle">
              {t('vehicleAssignments.create.assignedVehicle')}
            </RequiredLabel>
            <Select
              id="timeline-vehicle"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              className="w-full border-emerald-500 focus:ring-emerald-500"
            >
              <option value="">{t('vehicleAssignments.create.selectVehicle')}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number} · {vehicle.brand} {vehicle.model}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <RequiredLabel htmlFor="timeline-driver">{t('vehicleAssignments.create.operator')}</RequiredLabel>
            <Select
              id="timeline-driver"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className="w-full border-emerald-500 focus:ring-emerald-500"
            >
              <option value="">{t('vehicleAssignments.create.selectDriver')}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.first_name} {driver.last_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <RequiredLabel htmlFor="timeline-company">{t('vehicleAssignments.create.company')}</RequiredLabel>
            <Select
              id="timeline-company"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              className="w-full border-emerald-500 focus:ring-emerald-500"
            >
              <option value="">{t('vehicleAssignments.create.selectCompany')}</option>
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-800">
                {t('vehicleAssignments.create.startDateTime')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="date"
                    value={workDate}
                    onChange={(event) => setWorkDate(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {t('vehicleAssignments.create.startHelper', { time: timePreview.start, date: formatDateUs(workDate) })}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-800">
                {t('vehicleAssignments.create.endDateTime')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="pl-9" />
                </div>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {t('vehicleAssignments.create.endHelper', { time: timePreview.end, date: formatDateUs(workDate) })}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline-comment" className="text-sm font-semibold text-slate-800">
              {t('vehicleAssignments.create.comment')}
            </Label>
            <textarea
              id="timeline-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('vehicleAssignments.create.commentPlaceholder')}
              rows={4}
              className="flex min-h-[96px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <DialogFooter className="border-t border-slate-200 px-0 pb-0 pt-4 sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className="text-emerald-700 hover:text-emerald-800">
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !canSave} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('vehicleAssignments.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
