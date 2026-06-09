'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BRAND_BTN_PRIMARY, BRAND_FOCUS, BRAND_LINK } from '@/lib/brand-colors';
import { saveCustomServiceReminder, type TimeUnit } from '@/lib/custom-service-reminders';
import { COMMON_SERVICE_TASKS } from '@/lib/service-reminders';
import { vehiclesApi } from '@/lib/api';
import type { Vehicle } from '@/lib/types';
import { FLEET_FILTER_INPUT, FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {hint ? <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden /> : null}
    </div>
  );
}

export function AddServiceReminderPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [serviceTask, setServiceTask] = useState('');
  const [timeInterval, setTimeInterval] = useState('6');
  const [timeIntervalUnit, setTimeIntervalUnit] = useState<TimeUnit>('months');
  const [timeDueSoonThreshold, setTimeDueSoonThreshold] = useState('2');
  const [timeDueSoonUnit, setTimeDueSoonUnit] = useState<TimeUnit>('weeks');
  const [meterIntervalKm, setMeterIntervalKm] = useState('10000');
  const [meterDueSoonKm, setMeterDueSoonKm] = useState('1000');
  const [manualOverride, setManualOverride] = useState(false);
  const [nextDueDate, setNextDueDate] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [watchers, setWatchers] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    vehiclesApi.list({ limit: 200 }).then((res) => setVehicles(res.data)).catch(() => setVehicles([]));
  }, []);

  function validate(): boolean {
    if (!vehicleId || !serviceTask.trim()) {
      setError(t('serviceReminders.create.missingRequired'));
      return false;
    }
    setError(null);
    return true;
  }

  function buildPayload() {
    return {
      vehicleId,
      serviceTask: serviceTask.trim(),
      timeInterval: Math.max(1, Number(timeInterval) || 1),
      timeIntervalUnit,
      timeDueSoonThreshold: Math.max(1, Number(timeDueSoonThreshold) || 1),
      timeDueSoonThresholdUnit: timeDueSoonUnit,
      meterIntervalKm: Math.max(0, Number(meterIntervalKm) || 0),
      meterDueSoonThresholdKm: Math.max(0, Number(meterDueSoonKm) || 0),
      notifications,
      watchers: watchers
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      manualOverride,
      nextDueDate: manualOverride && nextDueDate ? nextDueDate : undefined,
    };
  }

  function handleSave(redirectToList = true) {
    if (!validate()) return;
    setSaving(true);
    saveCustomServiceReminder(buildPayload());
    setSaving(false);
    if (redirectToList) {
      router.push('/reminders/service');
    } else {
      setVehicleId('');
      setServiceTask('');
      setError(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <Link href="/reminders/service" className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', BRAND_LINK)}>
          <ArrowLeft className="h-4 w-4" />
          {t('serviceReminders.title')}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">{t('serviceReminders.create.title')}</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">{t('serviceReminders.create.details')}</h2>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <FieldLabel label={t('serviceReminders.create.vehicle')} required />
            <Select
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('serviceReminders.create.selectPlaceholder')}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number} · {vehicle.brand} {vehicle.model}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel label={t('serviceReminders.create.serviceTask')} required />
            <Select
              value={serviceTask}
              onChange={(event) => setServiceTask(event.target.value)}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('serviceReminders.create.selectPlaceholder')}</option>
              {COMMON_SERVICE_TASKS.map((task) => (
                <option key={task} value={task}>
                  {task}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel label={t('serviceReminders.create.timeInterval')} hint />
              <div className="flex gap-2">
                <Input
                  value={timeInterval}
                  onChange={(event) => setTimeInterval(event.target.value)}
                  className={cn('w-24', FLEET_FILTER_INPUT, BRAND_FOCUS)}
                />
                <Select
                  value={timeIntervalUnit}
                  onChange={(event) => setTimeIntervalUnit(event.target.value as TimeUnit)}
                  className={cn('flex-1', FLEET_FILTER_SELECT, BRAND_FOCUS)}
                >
                  <option value="months">{t('serviceReminders.create.months')}</option>
                  <option value="weeks">{t('serviceReminders.create.weeks')}</option>
                </Select>
              </div>
            </div>

            <div>
              <FieldLabel label={t('serviceReminders.create.timeDueSoonThreshold')} hint />
              <div className="flex gap-2">
                <Input
                  value={timeDueSoonThreshold}
                  onChange={(event) => setTimeDueSoonThreshold(event.target.value)}
                  className={cn('w-24', FLEET_FILTER_INPUT, BRAND_FOCUS)}
                />
                <Select
                  value={timeDueSoonUnit}
                  onChange={(event) => setTimeDueSoonUnit(event.target.value as TimeUnit)}
                  className={cn('flex-1', FLEET_FILTER_SELECT, BRAND_FOCUS)}
                >
                  <option value="weeks">{t('serviceReminders.create.weeks')}</option>
                  <option value="months">{t('serviceReminders.create.months')}</option>
                </Select>
              </div>
            </div>

            <div>
              <FieldLabel label={t('serviceReminders.create.meterInterval')} hint />
              <div className="flex items-center gap-2">
                <Input
                  value={meterIntervalKm}
                  onChange={(event) => setMeterIntervalKm(event.target.value)}
                  className={cn('flex-1', FLEET_FILTER_INPUT, BRAND_FOCUS)}
                />
                <span className="text-[13px] text-slate-500">km</span>
              </div>
            </div>

            <div>
              <FieldLabel label={t('serviceReminders.create.meterDueSoonThreshold')} hint />
              <div className="flex items-center gap-2">
                <Input
                  value={meterDueSoonKm}
                  onChange={(event) => setMeterDueSoonKm(event.target.value)}
                  className={cn('flex-1', FLEET_FILTER_INPUT, BRAND_FOCUS)}
                />
                <span className="text-[13px] text-slate-500">km</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={manualOverride}
                onChange={(event) => setManualOverride(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1a4d7a] focus:ring-[#1a4d7a]"
              />
              <span className="text-[13px] text-slate-700">{t('serviceReminders.create.manualOverride')}</span>
            </label>
            <p className="pl-6 text-[12px] text-slate-500">{t('serviceReminders.create.manualOverrideHint')}</p>
            {manualOverride ? (
              <div className="pl-6">
                <Input
                  type="date"
                  value={nextDueDate}
                  onChange={(event) => setNextDueDate(event.target.value)}
                  className={cn('max-w-xs', FLEET_FILTER_INPUT, BRAND_FOCUS)}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(event) => setNotifications(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1a4d7a] focus:ring-[#1a4d7a]"
              />
              <span className="text-[13px] font-medium text-slate-700">{t('serviceReminders.create.notifications')}</span>
            </label>
            <p className="pl-6 text-[12px] leading-relaxed text-slate-500">
              {t('serviceReminders.create.notificationsHint')}
            </p>
          </div>

          <div>
            <FieldLabel label={t('serviceReminders.create.watchers')} />
            <Select
              value={watchers}
              onChange={(event) => setWatchers(event.target.value)}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('serviceReminders.create.selectPlaceholder')}</option>
            </Select>
          </div>

          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/reminders/service" className={cn('text-[13px] font-medium', BRAND_LINK)}>
            {t('common.cancel')}
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className={cn(FLEET_FILTER_SELECT, 'h-9')}
              disabled={saving}
              onClick={() => handleSave(false)}
            >
              {t('serviceReminders.create.saveAndAddAnother')}
            </Button>
            <Button type="button" className={BRAND_BTN_PRIMARY} disabled={saving} onClick={() => handleSave(true)}>
              {t('serviceReminders.create.saveReminder')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
