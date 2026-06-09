import type { Vehicle } from '@/lib/types';

const EXPORT_HEADERS = [
  'plate_number',
  'brand',
  'model',
  'year',
  'vin',
  'internal_code',
  'status',
  'tuv_expiry_date',
  'sp_expiry_date',
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

export function exportVehiclesToCsv(vehicles: Vehicle[]): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const vehicle of vehicles) {
    const row = [
      vehicle.plate_number,
      vehicle.brand,
      vehicle.model,
      vehicle.year != null ? String(vehicle.year) : '',
      vehicle.vin ?? '',
      vehicle.internal_code ?? '',
      vehicle.status,
      formatExportDate(vehicle.tuv_expiry_date),
      formatExportDate(vehicle.sp_expiry_date),
    ].map((cell) => escapeCsvCell(cell));

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function downloadVehiclesCsv(vehicles: Vehicle[], filename = 'vehicles.csv') {
  const csv = exportVehiclesToCsv(vehicles);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
