import type { Reminder, ReminderType, Vehicle } from '@/lib/types';
import { daysUntil } from '@/lib/utils';
import { getReminderCategory, normalizeReminder, parseReminderMetadata } from '@/lib/reminder-utils';

export type VehicleReminderTab = 'all' | 'due_soon' | 'overdue';

export type VehicleReminderStatus = 'overdue' | 'due_soon' | 'upcoming' | 'snoozed';

export type VehicleRenewalKind = 'emission_test' | 'registration' | 'insurance' | 'inspection';

export interface VehicleReminderRow {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleStatus: Vehicle['status'];
  vehiclePhotoUrl?: string;
  renewalKind: VehicleRenewalKind;
  renewalLabel: string;
  status: VehicleReminderStatus;
  dueDate: string;
  dueSoonThresholdDays: number;
  notificationsActive: boolean;
  reminderId?: string;
  comment?: string;
  source: 'vehicle' | 'reminder' | 'custom';
}

export const COMMON_VEHICLE_RENEWAL_TYPES: Array<{ kind: VehicleRenewalKind; label: string }> = [
  { kind: 'emission_test', label: 'Emission Test' },
  { kind: 'registration', label: 'Registration' },
  { kind: 'insurance', label: 'Insurance' },
  { kind: 'inspection', label: 'Inspection' },
];

const DEFAULT_DUE_SOON_DAYS = 21;

function renewalKindFromReminderType(type: ReminderType, title: string): VehicleRenewalKind {
  if (type === 'tuv_expiry') return 'inspection';
  if (type === 'sp_expiry') return 'emission_test';
  if (type === 'insurance_expiry') return 'insurance';
  const text = title.toLowerCase();
  if (text.includes('registration')) return 'registration';
  if (text.includes('insurance') || text.includes('versicherung') || text.includes('sigorta')) {
    return 'insurance';
  }
  if (text.includes('emission') || text.includes('abgas')) return 'emission_test';
  if (text.includes('inspection') || text.includes('tuv') || text.includes('tüv') || text.includes('hu')) {
    return 'inspection';
  }
  return 'inspection';
}

function renewalLabelForKind(kind: VehicleRenewalKind): string {
  return COMMON_VEHICLE_RENEWAL_TYPES.find((item) => item.kind === kind)?.label ?? 'Inspection';
}

function classifyStatus(dueDate: string, backendStatus?: string): VehicleReminderStatus {
  if (backendStatus === 'ignored') return 'snoozed';
  const days = daysUntil(dueDate);
  if (days === null) return 'upcoming';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due_soon';
  return 'upcoming';
}

function vehicleExpiryRows(vehicle: Vehicle, seen: Set<string>): VehicleReminderRow[] {
  const rows: VehicleReminderRow[] = [];
  const entries: Array<{ date?: string; kind: VehicleRenewalKind }> = [
    { date: vehicle.tuv_expiry_date, kind: 'inspection' },
    { date: vehicle.sp_expiry_date, kind: 'emission_test' },
    { date: vehicle.insurance_expiry_date, kind: 'insurance' },
    { date: vehicle.registration_expiry_date, kind: 'registration' },
  ];

  for (const entry of entries) {
    if (!entry.date) continue;
    const dueDate = entry.date.slice(0, 10);
    const key = `${vehicle.id}:${entry.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      id: `vehicle:${vehicle.id}:${entry.kind}`,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate_number,
      vehicleBrand: vehicle.brand,
      vehicleModel: vehicle.model,
      vehicleStatus: vehicle.status,
      vehiclePhotoUrl: vehicle.photo_url,
      renewalKind: entry.kind,
      renewalLabel: renewalLabelForKind(entry.kind),
      status: classifyStatus(dueDate),
      dueDate,
      dueSoonThresholdDays: DEFAULT_DUE_SOON_DAYS,
      notificationsActive: true,
      source: 'vehicle',
    });
  }

  return rows;
}

export function buildVehicleReminderRows(
  vehicles: Vehicle[],
  rawReminders: Record<string, unknown>[],
): VehicleReminderRow[] {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const rowByKey = new Map<string, VehicleReminderRow>();

  for (const vehicle of vehicles) {
    for (const row of vehicleExpiryRows(vehicle, new Set())) {
      const key = `${row.vehicleId}:${row.renewalKind}`;
      rowByKey.set(key, row);
    }
  }

  for (const raw of rawReminders) {
    const reminder = normalizeReminder(raw);
    if (getReminderCategory(reminder) !== 'vehicle') continue;
    if (reminder.status === 'resolved') continue;

    const vehicle =
      reminder.related_entity_type === 'vehicle'
        ? vehicleById.get(reminder.related_entity_id ?? '')
        : vehicles.find((item) => item.plate_number === reminder.related_entity_name);

    const metadata = parseReminderMetadata(reminder.message);
    const renewalKind = metadata?.renewalKind ?? renewalKindFromReminderType(reminder.type, reminder.title);
    const vehicleId = vehicle?.id ?? reminder.related_entity_id ?? reminder.id;
    const key = metadata?.category === 'vehicle' ? `reminder:${reminder.id}` : `${vehicleId}:${renewalKind}`;
    const backendStatus = String(raw.status ?? '');
    const existing = metadata?.category === 'vehicle' ? undefined : rowByKey.get(key);

    if (existing) {
      existing.reminderId = reminder.id;
      existing.status = classifyStatus(reminder.due_date, backendStatus);
      existing.dueDate = reminder.due_date;
      existing.dueSoonThresholdDays = reminder.notify_before_days || existing.dueSoonThresholdDays;
      existing.notificationsActive = backendStatus !== 'ignored';
      if (metadata?.comment) existing.comment = metadata.comment;
      if (vehicle) {
        existing.vehiclePlate = vehicle.plate_number;
        existing.vehicleBrand = vehicle.brand;
        existing.vehicleModel = vehicle.model;
        existing.vehicleStatus = vehicle.status;
        existing.vehiclePhotoUrl = vehicle.photo_url;
      }
      continue;
    }

    rowByKey.set(key, {
      id: `reminder:${reminder.id}`,
      vehicleId,
      vehiclePlate: vehicle?.plate_number ?? reminder.related_entity_name ?? '—',
      vehicleBrand: vehicle?.brand ?? '',
      vehicleModel: vehicle?.model ?? '',
      vehicleStatus: vehicle?.status ?? 'active',
      vehiclePhotoUrl: vehicle?.photo_url,
      renewalKind,
      renewalLabel: renewalLabelForKind(renewalKind),
      status: classifyStatus(reminder.due_date, backendStatus),
      dueDate: reminder.due_date,
      dueSoonThresholdDays: reminder.notify_before_days || DEFAULT_DUE_SOON_DAYS,
      notificationsActive: metadata?.notifications ?? backendStatus !== 'ignored',
      comment: metadata?.comment,
      reminderId: reminder.id,
      source: 'reminder',
    });
  }

  return [...rowByKey.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function filterVehicleReminderRows(
  rows: VehicleReminderRow[],
  tab: VehicleReminderTab,
): VehicleReminderRow[] {
  if (tab === 'all') return rows;
  if (tab === 'due_soon') return rows.filter((row) => row.status === 'due_soon');
  return rows.filter((row) => row.status === 'overdue');
}

export function matchesRenewalTypeFilter(row: VehicleReminderRow, filterKind: string): boolean {
  if (!filterKind) return true;
  return row.renewalKind === filterKind;
}

export function vehicleReminderCounts(rows: VehicleReminderRow[]) {
  return {
    all: rows.length,
    dueSoon: rows.filter((row) => row.status === 'due_soon').length,
    overdue: rows.filter((row) => row.status === 'overdue').length,
  };
}

export function formatDueSoonThreshold(days: number, locale: string): string {
  if (days >= 7 && days % 7 === 0) {
    const weeks = days / 7;
    if (locale.startsWith('de')) return `${weeks} Woche(n)`;
    if (locale.startsWith('tr')) return `${weeks} hafta`;
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  if (locale.startsWith('de')) return `${days} Tag(e)`;
  if (locale.startsWith('tr')) return `${days} gün`;
  return days === 1 ? '1 day' : `${days} days`;
}
