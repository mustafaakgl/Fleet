import type { Document } from '@/lib/types';

const EXPORT_HEADERS = [
  'owner_type',
  'owner_ref',
  'document_type',
  'file_name',
  'expiry_date',
  'status',
  'notes',
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

export function exportDocumentsToCsv(
  documents: Document[],
  ownerRefByKey: Map<string, string>,
): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const document of documents) {
    const ownerRef =
      ownerRefByKey.get(`${document.ownerType}:${document.ownerId}`) ?? document.ownerId;
    const row = [
      document.ownerType,
      ownerRef,
      document.documentType,
      document.fileName,
      formatExportDate(document.expiryDate),
      document.status,
      document.notes ?? '',
    ].map((cell) => escapeCsvCell(cell));

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function downloadDocumentsCsv(
  documents: Document[],
  ownerRefByKey: Map<string, string>,
  filename = 'documents.csv',
) {
  const csv = exportDocumentsToCsv(documents, ownerRefByKey);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
