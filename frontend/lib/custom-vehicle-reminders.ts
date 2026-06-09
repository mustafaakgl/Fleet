import type { Vehicle } from '@/lib/types';
import {
  COMMON_VEHICLE_RENEWAL_TYPES,
  type VehicleReminderRow,
  type VehicleReminderStatus,
  type VehicleRenewalKind,
} from '@/lib/vehicle-reminders';
import { daysUntil } from '@/lib/utils';

const STORAGE_KEY = 'fleet:custom-vehicle-reminders';
const ATTACHMENTS_KEY = 'fleet:vehicle-reminder-attachments';

export type DueSoonUnit = 'weeks' | 'days';

export interface CustomVehicleReminderDefinition {
  id: string;
  vehicleId: string;
  renewalKind: VehicleRenewalKind;
  dueDate: string;
  dueSoonThreshold: number;
  dueSoonThresholdUnit: DueSoonUnit;
  notifications: boolean;
  watchers: string[];
  comment?: string;
  createdAt: string;
}

export interface VehicleReminderAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

function readAll(): CustomVehicleReminderDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CustomVehicleReminderDefinition[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: CustomVehicleReminderDefinition[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function readAttachments(): VehicleReminderAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ATTACHMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as VehicleReminderAttachment[]) : [];
  } catch {
    return [];
  }
}

function writeAttachments(items: VehicleReminderAttachment[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function listCustomVehicleReminders(): CustomVehicleReminderDefinition[] {
  return readAll();
}

export function saveCustomVehicleReminder(
  input: Omit<CustomVehicleReminderDefinition, 'id' | 'createdAt'> & { id?: string },
): CustomVehicleReminderDefinition {
  const items = readAll();
  const created: CustomVehicleReminderDefinition = {
    ...input,
    id: input.id ?? `custom-vr-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  items.unshift(created);
  writeAll(items);
  return created;
}

export function saveCustomVehicleRemindersBulk(
  definitions: Array<Omit<CustomVehicleReminderDefinition, 'id' | 'createdAt'>>,
): number {
  const items = readAll();
  let created = 0;
  for (const input of definitions) {
    items.unshift({
      ...input,
      id: `custom-vr-${Date.now()}-${created}`,
      createdAt: new Date().toISOString(),
    });
    created += 1;
  }
  writeAll(items);
  return created;
}

export function saveVehicleReminderAttachment(file: File): VehicleReminderAttachment | null {
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) return null;

  const attachment: VehicleReminderAttachment = {
    id: `vr-att-${Date.now()}`,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const items = readAttachments();
  items.unshift(attachment);
  writeAttachments(items.slice(0, 50));
  return attachment;
}

export function listVehicleReminderAttachments(): VehicleReminderAttachment[] {
  return readAttachments();
}

function dueSoonThresholdDays(definition: Pick<CustomVehicleReminderDefinition, 'dueSoonThreshold' | 'dueSoonThresholdUnit'>): number {
  if (definition.dueSoonThresholdUnit === 'weeks') {
    return definition.dueSoonThreshold * 7;
  }
  return definition.dueSoonThreshold;
}

function classifyStatus(dueDate: string): VehicleReminderStatus {
  const days = daysUntil(dueDate);
  if (days === null) return 'upcoming';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due_soon';
  return 'upcoming';
}

function renewalLabelForKind(kind: VehicleRenewalKind): string {
  return COMMON_VEHICLE_RENEWAL_TYPES.find((item) => item.kind === kind)?.label ?? 'Inspection';
}

export function buildCustomVehicleReminderRows(
  definitions: CustomVehicleReminderDefinition[],
  vehicles: Vehicle[],
): VehicleReminderRow[] {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  return definitions.flatMap((definition) => {
    const vehicle = vehicleById.get(definition.vehicleId);
    if (!vehicle) return [];

    const dueDate = definition.dueDate.slice(0, 10);
    const row: VehicleReminderRow = {
      id: `custom:${definition.id}`,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate_number,
      vehicleBrand: vehicle.brand,
      vehicleModel: vehicle.model,
      vehicleStatus: vehicle.status,
      vehiclePhotoUrl: vehicle.photo_url,
      renewalKind: definition.renewalKind,
      renewalLabel: renewalLabelForKind(definition.renewalKind),
      status: classifyStatus(dueDate),
      dueDate,
      dueSoonThresholdDays: dueSoonThresholdDays(definition),
      notificationsActive: definition.notifications,
      comment: definition.comment,
      source: 'custom',
    };

    return [row];
  });
}
