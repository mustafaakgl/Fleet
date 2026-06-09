import type { Driver } from '@/lib/types';

const EXPORT_HEADERS = [
  'first_name',
  'last_name',
  'employee_number',
  'email',
  'phone',
  'license_number',
  'license_expiry_date',
  'status',
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatExportDate(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function exportDriversToCsv(drivers: Driver[]): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const driver of drivers) {
    const row = [
      driver.first_name,
      driver.last_name,
      driver.employee_number ?? '',
      driver.email ?? '',
      driver.phone ?? '',
      driver.license_number ?? '',
      formatExportDate(driver.license_expiry_date),
      driver.status,
    ].map((cell) => escapeCsvCell(cell));

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function downloadDriversCsv(drivers: Driver[], filename = 'drivers.csv') {
  const csv = exportDriversToCsv(drivers);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
