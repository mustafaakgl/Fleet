import type { Vehicle } from '@/lib/types';
import {
  type ServiceReminderRow,
  type ServiceReminderStatus,
  intervalLabel,
} from '@/lib/service-reminders';
import { daysUntil } from '@/lib/utils';

const STORAGE_KEY = 'fleet:custom-service-reminders';

export type TimeUnit = 'months' | 'weeks';

export interface CustomServiceReminderDefinition {
  id: string;
  vehicleId: string;
  serviceTask: string;
  timeInterval: number;
  timeIntervalUnit: TimeUnit;
  timeDueSoonThreshold: number;
  timeDueSoonThresholdUnit: TimeUnit;
  meterIntervalKm: number;
  meterDueSoonThresholdKm: number;
  notifications: boolean;
  watchers: string[];
  manualOverride: boolean;
  nextDueDate?: string;
  nextDueMeterKm?: number;
  createdAt: string;
}

function readAll(): CustomServiceReminderDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CustomServiceReminderDefinition[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: CustomServiceReminderDefinition[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function listCustomServiceReminders(): CustomServiceReminderDefinition[] {
  return readAll();
}

export function saveCustomServiceReminder(
  input: Omit<CustomServiceReminderDefinition, 'id' | 'createdAt'> & { id?: string },
): CustomServiceReminderDefinition {
  const items = readAll();
  const created: CustomServiceReminderDefinition = {
    ...input,
    id: input.id ?? `custom-sr-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  items.unshift(created);
  writeAll(items);
  return created;
}

function unitToMonths(value: number, unit: TimeUnit): number {
  if (unit === 'months') return value;
  return Math.max(1, Math.round(value / 4));
}

function addMonthsIso(iso: string, months: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function classifyStatus(nextDueDate: string): ServiceReminderStatus {
  const days = daysUntil(nextDueDate);
  if (days === null) return 'scheduled';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due_soon';
  return 'scheduled';
}

function complianceFromStatus(status: ServiceReminderStatus): number {
  if (status === 'overdue') return 72;
  if (status === 'due_soon') return 94;
  return 100;
}

export function defaultNextDueDate(definition: Pick<CustomServiceReminderDefinition, 'timeInterval' | 'timeIntervalUnit' | 'nextDueDate' | 'manualOverride'>): string {
  if (definition.manualOverride && definition.nextDueDate) {
    return definition.nextDueDate.slice(0, 10);
  }
  const months = unitToMonths(definition.timeInterval, definition.timeIntervalUnit);
  return addMonthsIso(new Date().toISOString().slice(0, 10), months);
}

export function buildCustomServiceReminderRows(
  definitions: CustomServiceReminderDefinition[],
  vehicles: Vehicle[],
  locale: string,
): ServiceReminderRow[] {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  return definitions.flatMap((definition) => {
    const vehicle = vehicleById.get(definition.vehicleId);
    if (!vehicle) return [];

    const months = unitToMonths(definition.timeInterval, definition.timeIntervalUnit);
    const interval = { months, km: definition.meterIntervalKm || 10_000 };
    const nextDueDate = defaultNextDueDate(definition);
    const status = classifyStatus(nextDueDate);

    const row: ServiceReminderRow = {
      id: `custom:${definition.id}`,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate_number,
      vehicleBrand: vehicle.brand,
      vehicleModel: vehicle.model,
      vehicleStatus: vehicle.status,
      vehicleMileageKm: null,
      serviceTask: definition.serviceTask,
      intervalLabel: intervalLabel(interval, locale),
      timeIntervalMonths: months,
      meterIntervalKm: interval.km,
      status,
      nextDueDate,
      remainingKm: definition.meterIntervalKm || null,
      compliancePercent: complianceFromStatus(status),
      source: 'custom',
    };

    return [row];
  });
}
