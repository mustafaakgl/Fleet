import { DocumentOwnerType, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export type RequestAttachmentSummary = {
  id: string;
  fileName: string;
  download_url: string | null;
};

export async function loadRequestAttachmentsByOwner(
  prisma: PrismaService,
  ownerType: Extract<DocumentOwnerType, 'request' | 'transport_request'>,
  ownerIds: string[],
): Promise<Map<string, RequestAttachmentSummary[]>> {
  if (ownerIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.document.findMany({
    where: {
      ownerType,
      ownerId: { in: ownerIds },
      status: { not: 'archived' },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, ownerId: true, fileName: true, fileUrl: true },
  });

  const map = new Map<string, RequestAttachmentSummary[]>();
  for (const row of rows) {
    const list = map.get(row.ownerId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      download_url: row.fileUrl ? `/driver/documents/${row.id}/download` : null,
    });
    map.set(row.ownerId, list);
  }
  return map;
}

export function requestAttachmentDocumentType(index: number): string {
  return `request_attachment_${index + 1}`;
}
