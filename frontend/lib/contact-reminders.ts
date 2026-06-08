import type { Driver, ReminderType } from '@/lib/types';
import { daysUntil } from '@/lib/utils';
import { getReminderCategory, normalizeReminder } from '@/lib/reminder-utils';
import { formatDueSoonThreshold } from '@/lib/vehicle-reminders';

export type ContactReminderTab = 'all' | 'due_soon' | 'overdue';

export type ContactReminderStatus = 'overdue' | 'due_soon' | 'upcoming' | 'snoozed';

export type ContactRenewalKind =
  | 'license_renewal'
  | 'certification'
  | 'passport_renewal'
  | 'contract_renewal';

export interface ContactReminderRow {
  id: string;
  contactId: string;
  contactName: string;
  contactInitials: string;
  contactStatus: Driver['status'];
  renewalKind: ContactRenewalKind;
  renewalLabel: string;
  status: ContactReminderStatus;
  dueDate: string;
  dueSoonThresholdDays: number;
  notificationsActive: boolean;
  reminderId?: string;
  source: 'driver' | 'reminder';
}

export const COMMON_CONTACT_RENEWAL_TYPES: Array<{ kind: ContactRenewalKind; label: string }> = [
  { kind: 'license_renewal', label: 'License Renewal' },
  { kind: 'certification', label: 'Certification' },
  { kind: 'passport_renewal', label: 'Passport Renewal' },
  { kind: 'contract_renewal', label: 'Contract Renewal' },
];

const DEFAULT_DUE_SOON_DAYS = 21;

export function driverDisplayName(driver: Pick<Driver, 'first_name' | 'last_name'>): string {
  return `${driver.first_name} ${driver.last_name}`.trim();
}

export function driverInitials(driver: Pick<Driver, 'first_name' | 'last_name'>): string {
  const first = driver.first_name?.trim().charAt(0) ?? '';
  const last = driver.last_name?.trim().charAt(0) ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

function renewalKindFromReminderType(type: ReminderType, title: string): ContactRenewalKind {
  if (type === 'license_expiry') return 'license_renewal';
  if (type === 'passport_expiry') return 'passport_renewal';
  if (type === 'contract_expiry') return 'contract_renewal';
  if (type === 'document_expiry') return 'certification';
  const text = title.toLowerCase();
  if (text.includes('license') || text.includes('ehliyet') || text.includes('führerschein')) {
    return 'license_renewal';
  }
  if (text.includes('passport') || text.includes('pasaport') || text.includes('reisepass')) {
    return 'passport_renewal';
  }
  if (text.includes('contract') || text.includes('vertrag') || text.includes('sözleşme')) {
    return 'contract_renewal';
  }
  if (text.includes('certification') || text.includes('certificate') || text.includes('zertifikat')) {
    return 'certification';
  }
  return 'certification';
}

function renewalLabelForKind(kind: ContactRenewalKind): string {
  return COMMON_CONTACT_RENEWAL_TYPES.find((item) => item.kind === kind)?.label ?? 'Certification';
}

function classifyStatus(dueDate: string, backendStatus?: string): ContactReminderStatus {
  if (backendStatus === 'ignored') return 'snoozed';
  const days = daysUntil(dueDate);
  if (days === null) return 'upcoming';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due_soon';
  return 'upcoming';
}

function driverExpiryRows(driver: Driver): ContactReminderRow[] {
  const rows: ContactReminderRow[] = [];
  const name = driverDisplayName(driver);
  const initials = driverInitials(driver);
  const entries: Array<{ date?: string; kind: ContactRenewalKind }> = [
    { date: driver.license_expiry_date, kind: 'license_renewal' },
    { date: driver.passport_expiry_date, kind: 'passport_renewal' },
  ];

  for (const entry of entries) {
    if (!entry.date) continue;
    const dueDate = entry.date.slice(0, 10);
    rows.push({
      id: `driver:${driver.id}:${entry.kind}`,
      contactId: driver.id,
      contactName: name,
      contactInitials: initials,
      contactStatus: driver.status,
      renewalKind: entry.kind,
      renewalLabel: renewalLabelForKind(entry.kind),
      status: classifyStatus(dueDate),
      dueDate,
      dueSoonThresholdDays: DEFAULT_DUE_SOON_DAYS,
      notificationsActive: true,
      source: 'driver',
    });
  }

  return rows;
}

export function buildContactReminderRows(
  drivers: Driver[],
  rawReminders: Record<string, unknown>[],
): ContactReminderRow[] {
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const rowByKey = new Map<string, ContactReminderRow>();

  for (const driver of drivers) {
    for (const row of driverExpiryRows(driver)) {
      rowByKey.set(`${row.contactId}:${row.renewalKind}`, row);
    }
  }

  for (const raw of rawReminders) {
    const reminder = normalizeReminder(raw);
    if (getReminderCategory(reminder) !== 'contact') continue;
    if (reminder.status === 'resolved') continue;

    const driver =
      reminder.related_entity_type === 'driver'
        ? driverById.get(reminder.related_entity_id ?? '')
        : drivers.find((item) => driverDisplayName(item) === reminder.related_entity_name);

    const renewalKind = renewalKindFromReminderType(reminder.type, reminder.title);
    const contactId = driver?.id ?? reminder.related_entity_id ?? reminder.id;
    const key = `${contactId}:${renewalKind}`;
    const backendStatus = String(raw.status ?? '');
    const contactName = driver ? driverDisplayName(driver) : reminder.related_entity_name ?? reminder.title;
    const existing = rowByKey.get(key);

    if (existing) {
      existing.reminderId = reminder.id;
      existing.status = classifyStatus(reminder.due_date, backendStatus);
      existing.dueDate = reminder.due_date;
      existing.dueSoonThresholdDays = reminder.notify_before_days || existing.dueSoonThresholdDays;
      existing.notificationsActive = backendStatus !== 'ignored';
      if (driver) {
        existing.contactName = driverDisplayName(driver);
        existing.contactInitials = driverInitials(driver);
        existing.contactStatus = driver.status;
      }
      continue;
    }

    rowByKey.set(key, {
      id: `reminder:${reminder.id}`,
      contactId,
      contactName,
      contactInitials: driver ? driverInitials(driver) : contactName.slice(0, 2).toUpperCase(),
      contactStatus: driver?.status ?? 'active',
      renewalKind,
      renewalLabel: renewalLabelForKind(renewalKind),
      status: classifyStatus(reminder.due_date, backendStatus),
      dueDate: reminder.due_date,
      dueSoonThresholdDays: reminder.notify_before_days || DEFAULT_DUE_SOON_DAYS,
      notificationsActive: backendStatus !== 'ignored',
      reminderId: reminder.id,
      source: 'reminder',
    });
  }

  return [...rowByKey.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function filterContactReminderRows(
  rows: ContactReminderRow[],
  tab: ContactReminderTab,
): ContactReminderRow[] {
  if (tab === 'all') return rows;
  if (tab === 'due_soon') return rows.filter((row) => row.status === 'due_soon');
  return rows.filter((row) => row.status === 'overdue');
}

export function matchesContactRenewalTypeFilter(row: ContactReminderRow, filterKind: string): boolean {
  if (!filterKind) return true;
  return row.renewalKind === filterKind;
}

export function contactReminderCounts(rows: ContactReminderRow[]) {
  return {
    all: rows.length,
    dueSoon: rows.filter((row) => row.status === 'due_soon').length,
    overdue: rows.filter((row) => row.status === 'overdue').length,
  };
}

export { formatDueSoonThreshold };

export function contactAvatarColor(name: string): string {
  const palette = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[hash] ?? palette[0];
}
