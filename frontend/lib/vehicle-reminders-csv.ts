import type { Vehicle } from '@/lib/types';
import type { CustomVehicleReminderDefinition } from '@/lib/custom-vehicle-reminders';
import type { VehicleReminderRow, VehicleRenewalKind } from '@/lib/vehicle-reminders';

const EXPORT_HEADERS = [
  'vehicle_plate',
  'renewal_type',
  'due_date',
  'due_soon_threshold',
  'due_soon_unit',
  'notifications',
  'comment',
  'status',
] as const;

const RENEWAL_KINDS = new Set<VehicleRenewalKind>([
  'emission_test',
  'registration',
  'insurance',
  'inspection',
]);

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function exportVehicleRemindersToCsv(rows: VehicleReminderRow[]): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const row of rows) {
    const thresholdWeeks = Math.max(1, Math.round(row.dueSoonThresholdDays / 7));
    const line = [
      row.vehiclePlate,
      row.renewalKind,
      row.dueDate,
      String(thresholdWeeks),
      'weeks',
      row.notificationsActive ? 'true' : 'false',
      row.comment ?? '',
      row.status,
    ].map((cell) => escapeCsvCell(cell));
    lines.push(line.join(','));
  }

  return lines.join('\n');
}

export function downloadVehicleRemindersCsv(rows: VehicleReminderRow[], filename = 'vehicle-reminders.csv') {
  const csv = exportVehicleRemindersToCsv(rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseVehicleRemindersCsv(
  text: string,
  vehicles: Vehicle[],
): Array<Omit<CustomVehicleReminderDefinition, 'id' | 'createdAt'>> {
  const plateToId = new Map(vehicles.map((vehicle) => [vehicle.plate_number.toLowerCase(), vehicle.id]));
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const plateIndex = header.indexOf('vehicle_plate');
  const typeIndex = header.indexOf('renewal_type');
  const dueDateIndex = header.indexOf('due_date');
  const thresholdIndex = header.indexOf('due_soon_threshold');
  const unitIndex = header.indexOf('due_soon_unit');
  const notificationsIndex = header.indexOf('notifications');
  const commentIndex = header.indexOf('comment');

  if (plateIndex < 0 || typeIndex < 0 || dueDateIndex < 0) {
    throw new Error('CSV must include vehicle_plate, renewal_type, and due_date columns.');
  }

  const results: Array<Omit<CustomVehicleReminderDefinition, 'id' | 'createdAt'>> = [];

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const plate = cells[plateIndex]?.trim();
    const renewalType = cells[typeIndex]?.trim() as VehicleRenewalKind;
    const dueDate = cells[dueDateIndex]?.trim();
    if (!plate || !dueDate || !RENEWAL_KINDS.has(renewalType)) continue;

    const vehicleId = plateToId.get(plate.toLowerCase());
    if (!vehicleId) continue;

    const threshold = Math.max(1, Number(cells[thresholdIndex] ?? '3') || 3);
    const unitRaw = (cells[unitIndex] ?? 'weeks').toLowerCase();
    const dueSoonThresholdUnit = unitRaw === 'days' ? 'days' : 'weeks';
    const notifications = (cells[notificationsIndex] ?? 'true').toLowerCase() !== 'false';

    results.push({
      vehicleId,
      renewalKind: renewalType,
      dueDate: dueDate.slice(0, 10),
      dueSoonThreshold: threshold,
      dueSoonThresholdUnit,
      notifications,
      watchers: [],
      comment: commentIndex >= 0 ? cells[commentIndex]?.trim() || undefined : undefined,
    });
  }

  return results;
}
