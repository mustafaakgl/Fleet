'use client';

import Link from 'next/link';
import {
  Bell,
  BellOff,
  ChevronDown,
  Ellipsis,
  MessageSquare,
  Pencil,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRAND_BTN_PRIMARY, BRAND_LINK } from '@/lib/brand-colors';
import { formatRelativeDueDate } from '@/lib/reminder-utils';
import { serviceHistoryLogHref, type ServiceReminderRow } from '@/lib/service-reminders';
import { vehicleAbbreviation } from '@/lib/timeline-utils';
import { FLEET_SIDE_DRAWER } from '@/lib/fleet-table';
import { cn, formatDate } from '@/lib/utils';

function vehicleStatusDot(status: ServiceReminderRow['vehicleStatus']) {
  if (status === 'active') return 'bg-brand-primary';
  if (status === 'maintenance') return 'bg-orange-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
}

function statusLabel(status: ServiceReminderRow['status'], t: (key: string) => string) {
  if (status === 'due_soon') return t('serviceReminders.statusDueSoon');
  if (status === 'overdue') return t('serviceReminders.statusOverdue');
  if (status === 'snoozed') return t('serviceReminders.statusSnoozed');
  return t('serviceReminders.statusScheduled');
}

function statusClass(status: ServiceReminderRow['status']) {
  if (status === 'overdue') return 'text-red-700';
  if (status === 'due_soon') return 'text-orange-600';
  if (status === 'snoozed') return 'text-slate-600';
  return 'text-slate-700';
}

function displayNumber(row: ServiceReminderRow): string {
  if (row.reminderId) return row.reminderId.slice(0, 8).toUpperCase();
  const raw = row.id.replace(/^service-record:/, '');
  return raw.slice(0, 8).toUpperCase();
}

function formatIntervalKm(km: number, locale: string) {
  return `${km.toLocaleString(locale)} km`;
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-slate-100 py-3', className)}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

interface ServiceReminderDetailDrawerProps {
  row: ServiceReminderRow;
  watched: boolean;
  onClose: () => void;
  onToggleWatch: () => void;
  onResolve: () => void;
}

export function ServiceReminderDetailDrawer({
  row,
  watched,
  onClose,
  onToggleWatch,
  onResolve,
}: ServiceReminderDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const badge = vehicleAbbreviation(row.vehicleBrand, row.vehicleModel, row.vehiclePlate);

  return (
    <aside className={cn(FLEET_SIDE_DRAWER, 'h-[calc(100vh-4rem)] lg:h-[calc(100vh-6rem)]')}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-medium text-slate-600">
          {t('serviceReminders.detail.title', { id: displayNumber(row) })}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onToggleWatch}
          >
            {watched ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {watched ? t('expenseHistory.unwatch') : t('expenseHistory.watch')}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label={t('serviceReminders.detail.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-xl font-bold text-slate-900">{row.serviceTask}</h2>
        <p className="mt-1 text-sm text-slate-500">{row.intervalLabel}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {row.reminderId ? (
            <Button type="button" className={BRAND_BTN_PRIMARY} onClick={onResolve}>
              {t('reminders.resolve')}
              <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" className={BRAND_BTN_PRIMARY} asChild>
              <Link href={serviceHistoryLogHref(row)}>
                {t('serviceReminders.logService')}
              </Link>
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={serviceHistoryLogHref(row)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {t('serviceReminders.detail.edit')}
            </Link>
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
        </div>

        <dl className="mt-4">
          <DetailField label={t('serviceReminders.colVehicle')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded bg-slate-100 px-1.5 text-[10px] font-bold uppercase text-slate-600">
                {badge}
              </span>
              <span className={cn('inline-block h-2 w-2 rounded-full', vehicleStatusDot(row.vehicleStatus))} />
              <Link href={`/vehicles/${row.vehicleId}`} className={cn('font-semibold', BRAND_LINK)}>
                {row.vehiclePlate}
              </Link>
              {row.vehicleMileageKm != null ? (
                <span className="text-slate-500">
                  · {row.vehicleMileageKm.toLocaleString(i18n.language)} km
                </span>
              ) : null}
            </div>
          </DetailField>

          <DetailField label={t('serviceReminders.colServiceTask')}>
            <span className="font-medium text-brand-primary">{row.serviceTask}</span>
          </DetailField>

          <DetailField label={t('serviceReminders.colStatus')}>
            <span className={cn('inline-flex items-center gap-1.5 font-medium', statusClass(row.status))}>
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  row.status === 'overdue' && 'bg-red-500',
                  row.status === 'due_soon' && 'bg-orange-500',
                  row.status === 'snoozed' && 'bg-slate-400',
                  row.status === 'scheduled' && 'bg-blue-500',
                )}
              />
              {statusLabel(row.status, t)}
            </span>
          </DetailField>

          <DetailField label={t('serviceReminders.colNextDue')}>
            <div className={statusClass(row.status)}>
              <div>{formatRelativeDueDate(row.nextDueDate, i18n.language)}</div>
              <div className="text-xs">{formatDate(row.nextDueDate)}</div>
              {row.remainingKm != null ? (
                <div className="mt-0.5 text-xs">
                  {t('serviceReminders.detail.remainingKm', {
                    value: row.remainingKm.toLocaleString(i18n.language),
                  })}
                </div>
              ) : null}
            </div>
          </DetailField>

          <DetailField label={t('serviceHistory.create.completionDate')}>
            {row.lastCompletedDate ? (
              <>
                {row.serviceRecordId ? (
                  <Link
                    href={`/service-history/${row.serviceRecordId}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {formatDate(row.lastCompletedDate)}
                  </Link>
                ) : (
                  <div>{formatDate(row.lastCompletedDate)}</div>
                )}
                {row.lastCompletedMileage != null ? (
                  <div className="text-xs text-slate-500">
                    {row.lastCompletedMileage.toLocaleString(i18n.language)} km
                  </div>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </DetailField>

          <DetailField label={t('serviceReminders.colCompliance')}>
            <span className="font-medium">{row.compliancePercent}%</span>
          </DetailField>

          <DetailField label={t('serviceReminders.colWorkOrder')}>—</DetailField>

          <DetailField label={t('serviceReminders.detail.timeInterval')}>
            {t('serviceReminders.detail.timeIntervalValue', { count: row.timeIntervalMonths })}
          </DetailField>

          <DetailField label={t('serviceReminders.detail.meterInterval')}>
            {formatIntervalKm(row.meterIntervalKm, i18n.language)}
          </DetailField>
        </dl>
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            ?
          </span>
          <div className="relative flex-1">
            <MessageSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              disabled
              placeholder={t('serviceReminders.detail.addComment')}
              className="h-9 pl-9 text-sm"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
