import type { ServiceRecord } from '@/lib/types';
import { getRepairPriorityClass } from '@/lib/service-record-categories';
import {
  parseServiceRecordLabels,
  parseServiceRecordReference,
  parseServiceRecordTasks,
} from '@/lib/service-record-notes';

const EXPORT_HEADERS = [
  'vehicle_plate',
  'completion_date',
  'service_task',
  'driver_name',
  'vendor',
  'cost',
  'mileage_km',
  'reference',
  'priority',
  'labels',
  'notes',
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatExportDate(value: string): string {
  return value.slice(0, 10);
}

export function exportServiceRecordsToCsv(records: ServiceRecord[]): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const record of records) {
    const tasks = parseServiceRecordTasks(record);
    const serviceTask = tasks.join('; ') || record.service_type;
    const labels = parseServiceRecordLabels(record.notes).join(', ');
    const reference = parseServiceRecordReference(record.notes);
    const priority = getRepairPriorityClass(record.service_type, record.notes);
    const freeNotes = record.notes
      ?.split('\n\n')
      .filter(
        (block) =>
          !block.startsWith('Reference:') &&
          !block.startsWith('Labels:') &&
          !block.startsWith('Priority:') &&
          !block.startsWith('Line items:') &&
          !block.startsWith('Linked issues:') &&
          !block.startsWith('Start:') &&
          !block.startsWith('Attachments:'),
      )
      .join(' ')
      .trim();

    const row = [
      record.vehicle_plate,
      formatExportDate(record.date),
      serviceTask,
      record.driver_name ?? '',
      record.vendor ?? '',
      String(record.cost_amount ?? 0),
      record.mileage_km != null ? String(record.mileage_km) : '',
      reference,
      priority === 'none' ? '' : priority,
      labels,
      freeNotes ?? '',
    ].map((cell) => escapeCsvCell(cell));

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function downloadServiceRecordsCsv(records: ServiceRecord[], filename = 'service-history.csv') {
  const csv = exportServiceRecordsToCsv(records);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
