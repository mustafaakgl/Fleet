import { isRoutineServiceType } from '@/lib/service-record-categories';
import { parseServiceRecordTasks } from '@/lib/service-record-notes';
import type { Reminder, ServiceRecord, Vehicle } from '@/lib/types';
import { daysUntil } from '@/lib/utils';
import { getReminderCategory, normalizeReminder, parseReminderMetadata } from '@/lib/reminder-utils';

export type ServiceReminderTab = 'all' | 'due_soon' | 'overdue' | 'snoozed';

export type ServiceReminderStatus = 'due_soon' | 'overdue' | 'snoozed' | 'scheduled';

export interface ServiceReminderRow {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleStatus: Vehicle['status'];
  vehicleMileageKm?: number | null;
  serviceTask: string;
  intervalLabel: string;
  timeIntervalMonths: number;
  meterIntervalKm: number;
  status: ServiceReminderStatus;
  nextDueDate: string;
  remainingKm?: number | null;
  lastCompletedDate?: string;
  lastCompletedMileage?: number | null;
  compliancePercent: number;
  reminderId?: string;
  serviceRecordId?: string;
  source: 'service_record' | 'reminder' | 'custom';
}

export function serviceHistoryLogHref(row: ServiceReminderRow): string {
  if (row.serviceRecordId) return `/service-history/${row.serviceRecordId}`;
  const query = new URLSearchParams();
  query.set('vehicle_id', row.vehicleId);
  if (row.serviceTask) query.set('service_type', row.serviceTask);
  const qs = query.toString();
  return qs ? `/service-history?${qs}` : '/service-history';
}

export const COMMON_SERVICE_TASKS = [
  'Oil Change',
  'Tire Rotation',
  'Brake Service',
  'Annual Inspection',
  'TÜV / HU Inspection',
  'SP Inspection',
  'Diesel Emissions Fluid (DEF)',
  'Air Filter Replacement',
  'Coolant Flush',
  'Transmission Service',
  'Battery Replacement',
  'Wheel Alignment',
  'A/C Service',
  'Engine Diagnostic',
  'General Maintenance',
] as const;

type ServiceInterval = { months: number; km: number };

const DEFAULT_INTERVAL: ServiceInterval = { months: 6, km: 10_000 };

function intervalForTask(serviceType: string): ServiceInterval {
  const text = serviceType.toLowerCase();
  if (text.includes('oil') || text.includes('öl')) return { months: 12, km: 15_000 };
  if (text.includes('brake') || text.includes('brem')) return { months: 12, km: 20_000 };
  if (text.includes('tire') || text.includes('reifen')) return { months: 24, km: 40_000 };
  if (text.includes('inspection') || text.includes('inspektion')) return { months: 12, km: 15_000 };
  if (isRoutineServiceType(serviceType)) return { months: 6, km: 10_000 };
  return DEFAULT_INTERVAL;
}

function addMonthsIso(iso: string, months: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function classifyStatus(
  nextDueDate: string,
  backendStatus?: string,
): ServiceReminderStatus {
  if (backendStatus === 'ignored') return 'snoozed';
  const days = daysUntil(nextDueDate);
  if (days === null) return 'scheduled';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due_soon';
  return 'scheduled';
}

function complianceFromStatus(status: ServiceReminderStatus): number {
  if (status === 'overdue') return 72;
  if (status === 'due_soon') return 94;
  if (status === 'snoozed') return 88;
  return 100;
}

export function intervalLabel(interval: ServiceInterval, locale: string): string {
  const monthWord = interval.months === 1 ? 'month' : 'months';
  if (locale.startsWith('de')) {
    return `Alle ${interval.months} Monat(e) oder ${interval.km.toLocaleString('de-DE')} km`;
  }
  if (locale.startsWith('tr')) {
    return `${interval.months} ayda bir veya ${interval.km.toLocaleString('tr-TR')} km`;
  }
  return `Every ${interval.months} ${monthWord} or ${interval.km.toLocaleString('en-US')} km`;
}

function latestMileageByVehicle(serviceRecords: ServiceRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of serviceRecords) {
    if (record.mileage_km == null) continue;
    const current = map.get(record.vehicle_id);
    if (current == null || record.mileage_km > current) {
      map.set(record.vehicle_id, record.mileage_km);
    }
  }
  return map;
}

function remainingKm(
  lastMileage: number | null | undefined,
  intervalKm: number,
  vehicleMileage: number | null | undefined,
): number | null {
  if (lastMileage == null || vehicleMileage == null) return null;
  return Math.max(0, lastMileage + intervalKm - vehicleMileage);
}

export function matchesServiceTaskFilter(rowTask: string, filterTask: string): boolean {
  if (!filterTask) return true;
  const row = rowTask.trim().toLowerCase();
  const filter = filterTask.trim().toLowerCase();
  return row === filter || row.includes(filter) || filter.includes(row);
}

export function buildServiceReminderRows(
  vehicles: Vehicle[],
  serviceRecords: ServiceRecord[],
  rawReminders: Record<string, unknown>[],
  locale: string,
): ServiceReminderRow[] {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const mileageByVehicle = latestMileageByVehicle(serviceRecords);
  const rows: ServiceReminderRow[] = [];
  const seen = new Set<string>();

  const latestByVehicleTask = new Map<
    string,
    { record: ServiceRecord; task: string; completionDate: string }
  >();

  for (const record of serviceRecords) {
    const completionDate = record.date.slice(0, 10);
    for (const task of parseServiceRecordTasks(record)) {
      const key = `${record.vehicle_id}:${task.toLowerCase()}`;
      const existing = latestByVehicleTask.get(key);
      if (!existing || completionDate > existing.completionDate) {
        latestByVehicleTask.set(key, { record, task, completionDate });
      }
    }
  }

  for (const { record, task, completionDate } of latestByVehicleTask.values()) {
    const vehicle = vehicleById.get(record.vehicle_id);
    if (!vehicle) continue;

    const interval = intervalForTask(task);
    const nextDueDate = addMonthsIso(completionDate, interval.months);
    const status = classifyStatus(nextDueDate);
    const vehicleMileageKm = mileageByVehicle.get(vehicle.id) ?? record.mileage_km ?? null;
    const key = `${vehicle.id}:${task.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      id: `service-record:${record.id}:${task.toLowerCase()}`,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate_number,
      vehicleBrand: vehicle.brand,
      vehicleModel: vehicle.model,
      vehicleStatus: vehicle.status,
      vehicleMileageKm,
      serviceTask: task,
      intervalLabel: intervalLabel(interval, locale),
      timeIntervalMonths: interval.months,
      meterIntervalKm: interval.km,
      status,
      nextDueDate,
      remainingKm: remainingKm(record.mileage_km, interval.km, vehicleMileageKm),
      lastCompletedDate: completionDate,
      lastCompletedMileage: record.mileage_km ?? null,
      compliancePercent: complianceFromStatus(status),
      serviceRecordId: record.id,
      source: 'service_record',
    });
  }

  for (const raw of rawReminders) {
    const reminder = normalizeReminder(raw);
    if (getReminderCategory(reminder) !== 'service') continue;
    if (reminder.status === 'resolved') continue;

    const vehicle =
      reminder.related_entity_type === 'vehicle'
        ? vehicleById.get(reminder.related_entity_id ?? '')
        : vehicles.find((item) => item.plate_number === reminder.related_entity_name);

    const vehicleId = vehicle?.id ?? reminder.related_entity_id ?? reminder.id;
    const key = `reminder:${reminder.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const backendStatus = String(raw.status ?? '');
    const status = classifyStatus(reminder.due_date, backendStatus);
    const metadata = parseReminderMetadata(reminder.message);
    const serviceTask = metadata?.serviceTask ?? reminder.title;
    const interval =
      metadata?.timeInterval && metadata.timeIntervalUnit
        ? {
            months:
              metadata.timeIntervalUnit === 'months'
                ? metadata.timeInterval
                : Math.max(1, Math.round(metadata.timeInterval / 4)),
            km: metadata.meterIntervalKm ?? intervalForTask(serviceTask).km,
          }
        : intervalForTask(serviceTask);
    const vehicleMileageKm = vehicle ? (mileageByVehicle.get(vehicle.id) ?? null) : null;

    rows.push({
      id: key,
      vehicleId: vehicle?.id ?? vehicleId,
      vehiclePlate: vehicle?.plate_number ?? reminder.related_entity_name ?? '—',
      vehicleBrand: vehicle?.brand ?? '',
      vehicleModel: vehicle?.model ?? '',
      vehicleStatus: vehicle?.status ?? 'active',
      vehicleMileageKm,
      serviceTask,
      intervalLabel: intervalLabel(interval, locale),
      timeIntervalMonths: interval.months,
      meterIntervalKm: interval.km,
      status,
      nextDueDate: reminder.due_date,
      remainingKm: null,
      compliancePercent: complianceFromStatus(status),
      reminderId: reminder.id,
      source: 'reminder',
    });
  }

  return rows.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

export function filterServiceReminderRows(
  rows: ServiceReminderRow[],
  tab: ServiceReminderTab,
): ServiceReminderRow[] {
  if (tab === 'all') return rows;
  if (tab === 'due_soon') return rows.filter((row) => row.status === 'due_soon');
  if (tab === 'overdue') return rows.filter((row) => row.status === 'overdue');
  return rows.filter((row) => row.status === 'snoozed');
}

export function serviceReminderHref(params: {
  vehicleId?: string;
  task?: string;
  tab?: ServiceReminderTab;
}): string {
  const query = new URLSearchParams();
  if (params.vehicleId) query.set('vehicle_id', params.vehicleId);
  if (params.task) query.set('task', params.task);
  if (params.tab) query.set('tab', params.tab);
  const qs = query.toString();
  return qs ? `/reminders/service?${qs}` : '/reminders/service';
}

export function serviceReminderCounts(rows: ServiceReminderRow[]) {
  return {
    all: rows.length,
    dueSoon: rows.filter((row) => row.status === 'due_soon').length,
    overdue: rows.filter((row) => row.status === 'overdue').length,
    snoozed: rows.filter((row) => row.status === 'snoozed').length,
    overdueVehicles: new Set(rows.filter((row) => row.status === 'overdue').map((row) => row.vehicleId)).size,
    dueSoonVehicles: new Set(rows.filter((row) => row.status === 'due_soon').map((row) => row.vehicleId)).size,
    snoozedVehicles: new Set(rows.filter((row) => row.status === 'snoozed').map((row) => row.vehicleId)).size,
    averageCompliance:
      rows.length === 0
        ? 0
        : Math.round(rows.reduce((sum, row) => sum + row.compliancePercent, 0) / rows.length),
  };
}
