import type { PrismaService } from '../prisma/prisma.service';

export const MAX_ACCIDENT_ATTACHMENTS = 8;

export const ACCIDENT_DOCUMENT_TYPES = [
  'Scene Photo',
  'Damage Photo',
  'Police Report',
  'Cargo Owner Document',
] as const;

export type AccidentAttachmentSummary = {
  id: string;
  fileName: string;
  documentType: string;
  download_url: string | null;
};

export function normalizeAccidentDocumentType(value?: string): string {
  const trimmed = value?.trim();
  if (trimmed && (ACCIDENT_DOCUMENT_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }
  return 'Scene Photo';
}

export async function loadAccidentAttachmentsByOwner(
  prisma: PrismaService,
  ownerIds: string[],
): Promise<Map<string, AccidentAttachmentSummary[]>> {
  if (ownerIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.document.findMany({
    where: {
      ownerType: 'accident',
      ownerId: { in: ownerIds },
      status: { not: 'archived' },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, ownerId: true, fileName: true, fileUrl: true, documentType: true },
  });

  const map = new Map<string, AccidentAttachmentSummary[]>();
  for (const row of rows) {
    const list = map.get(row.ownerId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      documentType: row.documentType,
      download_url: row.fileUrl ? `/driver/documents/${row.id}/download` : null,
    });
    map.set(row.ownerId, list);
  }
  return map;
}

export function accidentAttachmentNotes(
  incidentType: string,
  documentType: string,
): string {
  return `Attachment (${documentType}) for ${incidentType} incident`;
}
