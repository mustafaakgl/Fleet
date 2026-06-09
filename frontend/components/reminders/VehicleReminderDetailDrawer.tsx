'use client';

import Link from 'next/link';
import { Bell, BellOff, Ellipsis, MessageSquare, Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRAND_BTN_PRIMARY, BRAND_LINK } from '@/lib/brand-colors';
import { formatRelativeDueDate } from '@/lib/reminder-utils';
import {
  formatDueSoonThreshold,
  type VehicleReminderRow,
  type VehicleReminderStatus,
} from '@/lib/vehicle-reminders';
import { vehicleAbbreviation } from '@/lib/timeline-utils';
import { FLEET_SIDE_DRAWER } from '@/lib/fleet-table';
import { cn, formatDate } from '@/lib/utils';

function vehicleStatusDot(status: VehicleReminderRow['vehicleStatus']) {
  if (status === 'active') return 'bg-[#1a4d7a]';
  if (status === 'maintenance') return 'bg-orange-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
}

function statusLabel(status: VehicleReminderStatus, t: (key: string) => string) {
  if (status === 'overdue') return t('vehicleReminders.statusOverdue');
  if (status === 'due_soon') return t('vehicleReminders.statusDueSoon');
  if (status === 'snoozed') return t('vehicleReminders.statusSnoozed');
  return t('vehicleReminders.statusUpcoming');
}

function statusClass(status: VehicleReminderStatus) {
  if (status === 'overdue') return 'text-red-700';
  if (status === 'due_soon') return 'text-orange-600';
  if (status === 'snoozed') return 'text-slate-600';
  return 'text-slate-600';
}

function displayNumber(row: VehicleReminderRow): string {
  if (row.reminderId) return row.reminderId.slice(0, 8).toUpperCase();
  return row.id.replace(/^vehicle:/, '').slice(0, 8).toUpperCase();
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

interface VehicleReminderDetailDrawerProps {
  row: VehicleReminderRow;
  watched: boolean;
  onClose: () => void;
  onToggleWatch: () => void;
  onResolve: () => void;
}

export function VehicleReminderDetailDrawer({
  row,
  watched,
  onClose,
  onToggleWatch,
  onResolve,
}: VehicleReminderDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const badge = vehicleAbbreviation(row.vehicleBrand, row.vehicleModel, row.vehiclePlate);

  return (
    <aside className={cn(FLEET_SIDE_DRAWER, 'h-[calc(100vh-4rem)] lg:h-[calc(100vh-6rem)]')}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <Link
          href={`/vehicles/${row.vehicleId}`}
          className={cn('text-sm font-medium', BRAND_LINK)}
        >
          {t('vehicleReminders.detail.title', { id: displayNumber(row) })} →
        </Link>
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
            aria-label={t('vehicleReminders.detail.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-xl font-bold text-slate-900">{row.renewalLabel}</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {row.reminderId ? (
            <Button type="button" className={BRAND_BTN_PRIMARY} onClick={onResolve}>
              {t('reminders.resolve')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/vehicles/${row.vehicleId}/edit`}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {t('vehicleReminders.detail.edit')}
            </Link>
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
        </div>

        <dl className="mt-4">
          <DetailField label={t('vehicleReminders.colVehicle')}>
            <div className="flex flex-wrap items-center gap-2">
              {row.vehiclePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.vehiclePhotoUrl}
                  alt=""
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                  {badge}
                </span>
              )}
              <span className={cn('inline-block h-2 w-2 rounded-full', vehicleStatusDot(row.vehicleStatus))} />
              <Link href={`/vehicles/${row.vehicleId}`} className={cn('font-semibold', BRAND_LINK)}>
                {row.vehiclePlate}
              </Link>
            </div>
          </DetailField>

          <DetailField label={t('vehicleReminders.colRenewalType')}>
            <span className="font-medium">{row.renewalLabel}</span>
          </DetailField>

          <DetailField label={t('vehicleReminders.colStatus')}>
            <span className={cn('inline-flex items-center gap-1.5 font-medium', statusClass(row.status))}>
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  row.status === 'overdue' && 'bg-red-500',
                  row.status === 'due_soon' && 'bg-orange-500',
                  row.status === 'snoozed' && 'bg-slate-400',
                  row.status === 'upcoming' && 'bg-slate-400',
                )}
              />
              {statusLabel(row.status, t)}
            </span>
          </DetailField>

          <DetailField label={t('vehicleReminders.colDueDate')}>
            <div className={statusClass(row.status)}>
              <div>{formatDate(row.dueDate)}</div>
              <div className="text-xs">({formatRelativeDueDate(row.dueDate, i18n.language)})</div>
            </div>
          </DetailField>

          <DetailField label={t('vehicleReminders.detail.dueSoonThreshold')}>
            {formatDueSoonThreshold(row.dueSoonThresholdDays, i18n.language)}
          </DetailField>

          <DetailField label={t('vehicleReminders.detail.notifications')}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  row.notificationsActive ? 'bg-[#1a4d7a]' : 'bg-slate-400',
                )}
              />
              {row.notificationsActive
                ? t('vehicleReminders.detail.notificationsActive')
                : t('vehicleReminders.detail.notificationsInactive')}
            </span>
          </DetailField>
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">{t('vehicleReminders.detail.comments')}</h3>
          {row.comment ? (
            <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {row.comment}
            </p>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                ?
              </span>
              <div className="relative flex-1">
                <MessageSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  disabled
                  placeholder={t('vehicleReminders.detail.addComment')}
                  className="h-9 pl-9 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
