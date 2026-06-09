import type { Company } from '@/lib/types';

const EXPORT_HEADERS = [
  'name',
  'email',
  'phone',
  'address',
  'contact_person',
  'default_daily_revenue',
  'notes',
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportCompaniesToCsv(companies: Company[]): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const company of companies) {
    const row = [
      company.name,
      company.email ?? '',
      company.phone ?? '',
      company.address ?? '',
      company.contact_person ?? '',
      company.default_daily_revenue != null ? String(company.default_daily_revenue) : '',
      company.notes ?? '',
    ].map((cell) => escapeCsvCell(cell));

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function downloadCompaniesCsv(companies: Company[], filename = 'companies.csv') {
  const csv = exportCompaniesToCsv(companies);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
