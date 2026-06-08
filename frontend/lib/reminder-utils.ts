import type { Reminder, ReminderType } from '@/lib/types';
import { remindersApi } from '@/lib/api';

export type ReminderCategory = 'service' | 'vehicle' | 'contact';

export function normalizeReminder(raw: Record<string, unknown>): Reminder {
  const dueRaw = raw.dueDate ?? raw.due_date;
  const dueDate =
    typeof dueRaw === 'string'
      ? dueRaw.slice(0, 10)
      : dueRaw instanceof Date
        ? dueRaw.toISOString().slice(0, 10)
        : '';

  const statusRaw = String(raw.status ?? 'open');
  const status: Reminder['status'] =
    statusRaw === 'resolved' ? 'resolved' : 'open';

  return {
    id: String(raw.id ?? ''),
    type: String(raw.reminderType ?? raw.type ?? 'custom') as ReminderType,
    title: String(raw.title ?? ''),
    message: String(raw.description ?? raw.message ?? ''),
    due_date: dueDate,
    notify_before_days: Number(raw.notifyBeforeDays ?? raw.notify_before_days ?? 0),
    status,
    related_entity_type: String(raw.targetType ?? raw.related_entity_type ?? ''),
    related_entity_id: String(raw.targetId ?? raw.related_entity_id ?? ''),
    related_entity_name: raw.related_entity_name ? String(raw.related_entity_name) : undefined,
    created_at: raw.createdAt ? String(raw.createdAt) : undefined,
  };
}

export function getReminderCategory(reminder: Reminder): ReminderCategory {
  if (
    reminder.type === 'tuv_expiry' ||
    reminder.type === 'sp_expiry' ||
    reminder.type === 'insurance_expiry'
  ) {
    return 'vehicle';
  }
  if (
    reminder.type === 'license_expiry' ||
    reminder.type === 'passport_expiry' ||
    reminder.type === 'contract_expiry'
  ) {
    return 'contact';
  }
  if (reminder.type === 'document_expiry' && reminder.related_entity_type === 'driver') {
    return 'contact';
  }
  if (reminder.type === 'custom') {
    const text = `${reminder.title} ${reminder.message}`.toLowerCase();
    if (
      text.includes('tuv') ||
      text.includes('sp') ||
      text.includes('insurance') ||
      text.includes('registration')
    ) {
      return 'vehicle';
    }
    if (
      text.includes('license') ||
      text.includes('passport') ||
      text.includes('contract') ||
      text.includes('ehliyet') ||
      text.includes('pasaport')
    ) {
      return 'contact';
    }
    return 'service';
  }
  return 'service';
}

export function formatRelativeDueDate(date: string, locale: string): string {
  const days = Math.round(
    (new Date(`${date.slice(0, 10)}T12:00:00`).getTime() - Date.now()) / 86_400_000,
  );
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(days) >= 14) {
    const weeks = Math.round(days / 7);
    return rtf.format(weeks, 'week');
  }
  return rtf.format(days, 'day');
}

export async function fetchActiveReminders(): Promise<Record<string, unknown>[]> {
  const [open, ignored] = await Promise.all([
    remindersApi.list({ status: 'open' }),
    remindersApi.list({ status: 'ignored' }),
  ]);
  return [...open, ...ignored] as unknown as Record<string, unknown>[];
}
