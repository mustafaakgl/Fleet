'use client';

import Link from 'next/link';
import { Bell, BellOff, Ellipsis, MessageSquare, Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeDueDate } from '@/lib/reminder-utils';
import {
  contactAvatarColor,
  formatDueSoonThreshold,
  type ContactReminderRow,
  type ContactReminderStatus,
} from '@/lib/contact-reminders';
import { cn, formatDate } from '@/lib/utils';

function statusLabel(status: ContactReminderStatus, t: (key: string) => string) {
  if (status === 'overdue') return t('contactReminders.statusOverdue');
  if (status === 'due_soon') return t('contactReminders.statusDueSoon');
  if (status === 'snoozed') return t('contactReminders.statusSnoozed');
  return t('contactReminders.statusUpcoming');
}

function statusClass(status: ContactReminderStatus) {
  if (status === 'overdue') return 'text-red-700';
  if (status === 'due_soon') return 'text-orange-600';
  return 'text-slate-600';
}

function displayNumber(row: ContactReminderRow): string {
  if (row.reminderId) return row.reminderId.slice(0, 8).toUpperCase();
  return row.id.replace(/^driver:/, '').slice(0, 8).toUpperCase();
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

interface ContactReminderDetailDrawerProps {
  row: ContactReminderRow;
  watched: boolean;
  onClose: () => void;
  onToggleWatch: () => void;
  onResolve: () => void;
}

export function ContactReminderDetailDrawer({
  row,
  watched,
  onClose,
  onToggleWatch,
  onResolve,
}: ContactReminderDetailDrawerProps) {
  const { t, i18n } = useTranslation();

  return (
    <aside className="flex h-[calc(100vh-8rem)] w-full max-w-md shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <Link
          href={`/drivers/${row.contactId}`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          {t('contactReminders.detail.title', { id: displayNumber(row) })} →
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
            aria-label={t('contactReminders.detail.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-xl font-bold text-slate-900">
          {t(`contactReminders.renewalType.${row.renewalKind}`)}
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {row.reminderId ? (
            <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={onResolve}>
              {t('reminders.resolve')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/drivers/${row.contactId}/edit`}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {t('contactReminders.detail.edit')}
            </Link>
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={t('expenseHistory.moreActions')}>
            <Ellipsis className="h-4 w-4" />
          </Button>
        </div>

        <dl className="mt-4">
          <DetailField label={t('contactReminders.colContact')}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
                  contactAvatarColor(row.contactName),
                )}
              >
                {row.contactInitials}
              </span>
              <Link href={`/drivers/${row.contactId}`} className="font-semibold text-blue-700 hover:underline">
                {row.contactName}
              </Link>
            </div>
          </DetailField>

          <DetailField label={t('contactReminders.colRenewalType')}>
            {t(`contactReminders.renewalType.${row.renewalKind}`)}
          </DetailField>

          <DetailField label={t('contactReminders.colStatus')}>
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

          <DetailField label={t('contactReminders.colDueDate')}>
            <div className={statusClass(row.status)}>
              <div>{formatDate(row.dueDate)}</div>
              <div className="text-xs">({formatRelativeDueDate(row.dueDate, i18n.language)})</div>
            </div>
          </DetailField>

          <DetailField label={t('contactReminders.detail.dueSoonThreshold')}>
            {formatDueSoonThreshold(row.dueSoonThresholdDays, i18n.language)}
          </DetailField>

          <DetailField label={t('contactReminders.detail.notifications')}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  row.notificationsActive ? 'bg-blue-500' : 'bg-slate-400',
                )}
              />
              {row.notificationsActive
                ? t('contactReminders.detail.notificationsActive')
                : t('contactReminders.detail.notificationsInactive')}
            </span>
          </DetailField>
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">{t('contactReminders.detail.comments')}</h3>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                contactAvatarColor(row.contactName),
              )}
            >
              {row.contactInitials}
            </span>
            <div className="relative flex-1">
              <MessageSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                disabled
                placeholder={t('contactReminders.detail.addComment')}
                className="h-9 pl-9 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
