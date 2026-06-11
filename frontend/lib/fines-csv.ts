import type { Fine } from '@/lib/types';

const EXPORT_HEADERS = [
  'violation_at',
  'plate_number',
  'driver',
  'violation_type',
  'violation_category',
  'violation_location',
  'amount',
  'payment_due_date',
  'status',
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatExportDate(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function exportFinesToCsv(fines: Fine[]): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const fine of fines) {
    const row = [
      formatExportDate(fine.violation_at),
      fine.vehicle?.plate_number ?? '',
      fine.driver?.name ?? '',
      fine.violation_type,
      fine.violation_category,
      fine.violation_location,
      fine.amount != null ? String(fine.amount) : '',
      formatExportDate(fine.payment_due_date),
      fine.status,
    ].map((cell) => escapeCsvCell(cell));

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function downloadFinesCsv(fines: Fine[], filename = 'bussgelder.csv') {
  const csv = exportFinesToCsv(fines);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
