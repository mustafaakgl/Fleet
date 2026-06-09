'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, HelpCircle, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getUser } from '@/lib/auth';
import { BRAND_BTN_PRIMARY, BRAND_FOCUS, BRAND_LINK } from '@/lib/brand-colors';
import type { DueSoonUnit } from '@/lib/custom-vehicle-reminders';
import { remindersApi, vehiclesApi } from '@/lib/api';
import { COMMON_VEHICLE_RENEWAL_TYPES, type VehicleRenewalKind } from '@/lib/vehicle-reminders';
import type { Vehicle } from '@/lib/types';
import { FLEET_FILTER_INPUT, FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

function FieldLabel({
  label,
  required,
  hint,
  locked,
}: {
  label: string;
  required?: boolean;
  hint?: boolean;
  locked?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {locked ? <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden /> : null}
      {hint ? <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden /> : null}
    </div>
  );
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function AddVehicleReminderPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [renewalKind, setRenewalKind] = useState<VehicleRenewalKind | ''>('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueSoonThreshold, setDueSoonThreshold] = useState('3');
  const [dueSoonUnit, setDueSoonUnit] = useState<DueSoonUnit>('weeks');
  const [notifications, setNotifications] = useState(true);
  const [watchers, setWatchers] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const initials = useMemo(() => {
    const user = getUser();
    return userInitials(user?.name ?? user?.email ?? '?');
  }, []);

  useEffect(() => {
    vehiclesApi.list({ limit: 200 }).then((res) => setVehicles(res.data)).catch(() => setVehicles([]));
  }, []);

  function validate(): boolean {
    if (!vehicleId || !renewalKind || !dueDate) {
      setError(t('vehicleReminders.create.missingRequired'));
      return false;
    }
    setError(null);
    return true;
  }

  function buildPayload() {
    return {
      vehicleId,
      renewalKind,
      dueDate,
      dueSoonThreshold: Math.max(1, Number(dueSoonThreshold) || 1),
      dueSoonThresholdUnit: dueSoonUnit,
      notifications,
      watchers: watchers
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      comment: comment.trim() || undefined,
    };
  }

  async function handleSave(redirectToList = true) {
    if (!validate() || !renewalKind) return;
    setSaving(true);
    setError(null);
    try {
      await remindersApi.createVehicleReminder({
        ...buildPayload(),
        renewalKind,
      });
      if (redirectToList) {
        router.push('/reminders/vehicle');
      } else {
        setVehicleId('');
        setRenewalKind('');
        setComment('');
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vehicleReminders.create.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <Link href="/reminders/vehicle" className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', BRAND_LINK)}>
          <ArrowLeft className="h-4 w-4" />
          {t('vehicleReminders.title')}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">{t('vehicleReminders.create.title')}</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="space-y-5 px-5 py-5">
          <div>
            <FieldLabel label={t('vehicleReminders.create.vehicle')} required />
            <Select
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('vehicleReminders.create.selectPlaceholder')}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number} · {vehicle.brand} {vehicle.model}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel label={t('vehicleReminders.create.renewalType')} required locked />
            <Select
              value={renewalKind}
              onChange={(event) => setRenewalKind(event.target.value as VehicleRenewalKind)}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('vehicleReminders.create.selectPlaceholder')}</option>
              {COMMON_VEHICLE_RENEWAL_TYPES.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {t(`vehicleReminders.renewalType.${item.kind}`)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel label={t('vehicleReminders.create.dueDate')} required />
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={cn('w-full pl-9', FLEET_FILTER_INPUT, BRAND_FOCUS)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label={t('vehicleReminders.create.dueSoonThreshold')} hint />
            <div className="flex gap-2">
              <Input
                value={dueSoonThreshold}
                onChange={(event) => setDueSoonThreshold(event.target.value)}
                className={cn('w-24', FLEET_FILTER_INPUT, BRAND_FOCUS)}
              />
              <Select
                value={dueSoonUnit}
                onChange={(event) => setDueSoonUnit(event.target.value as DueSoonUnit)}
                className={cn('flex-1', FLEET_FILTER_SELECT, BRAND_FOCUS)}
              >
                <option value="weeks">{t('vehicleReminders.create.weeks')}</option>
                <option value="days">{t('vehicleReminders.create.days')}</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(event) => setNotifications(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1a4d7a] focus:ring-[#1a4d7a]"
              />
              <span className="text-[13px] font-medium text-slate-700">{t('vehicleReminders.create.notifications')}</span>
            </label>
            <p className="pl-6 text-[12px] leading-relaxed text-slate-500">
              {t('vehicleReminders.create.notificationsHint')}
            </p>
          </div>

          <div>
            <FieldLabel label={t('vehicleReminders.create.watchers')} />
            <Select
              value={watchers}
              onChange={(event) => setWatchers(event.target.value)}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('vehicleReminders.create.selectPlaceholder')}</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">{t('vehicleReminders.create.comments')}</h2>
        </div>
        <div className="px-5 py-5">
          <FieldLabel label={t('vehicleReminders.create.comment')} />
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
              {initials}
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('vehicleReminders.create.commentPlaceholder')}
              rows={4}
              className={cn(
                'min-h-[6rem] w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#1a4d7a] focus:outline-none focus:ring-1 focus:ring-[#1a4d7a]',
              )}
            />
          </div>
        </div>
      </div>

      {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/reminders/vehicle" className={cn('text-[13px] font-medium', BRAND_LINK)}>
          {t('common.cancel')}
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className={cn(FLEET_FILTER_SELECT, 'h-9')}
            disabled={saving}
            onClick={() => void handleSave(false)}
          >
            {t('vehicleReminders.create.saveAndAddAnother')}
          </Button>
          <Button type="button" className={BRAND_BTN_PRIMARY} disabled={saving} onClick={() => void handleSave(true)}>
            {t('vehicleReminders.create.saveReminder')}
          </Button>
        </div>
      </div>
    </div>
  );
}
