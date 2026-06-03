import { AssignmentStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export const HANDOVER_PHOTO_SLOTS = ['front', 'right', 'left', 'rear'] as const;

export type HandoverPhotoSlot = (typeof HANDOVER_PHOTO_SLOTS)[number];

export type HandoverPhotoSummary = {
  id: string;
  fileName: string;
  fileUrl: string | null;
};

export type HandoverPhotosBySlot = Partial<Record<HandoverPhotoSlot, HandoverPhotoSummary>>;

export function handoverPhotoDocumentType(slot: HandoverPhotoSlot): string {
  return `handover_photo_${slot}`;
}

export function parseHandoverPhotoSlot(value: string | undefined): HandoverPhotoSlot | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return HANDOVER_PHOTO_SLOTS.includes(normalized as HandoverPhotoSlot)
    ? (normalized as HandoverPhotoSlot)
    : null;
}

export function slotFromHandoverDocumentType(documentType: string): HandoverPhotoSlot | null {
  const prefix = 'handover_photo_';
  if (!documentType.startsWith(prefix)) {
    return null;
  }
  return parseHandoverPhotoSlot(documentType.slice(prefix.length));
}

export function calculatePhotoRequirement(
  yesterdayVehicleId: string | null,
  currentVehicleId: string,
): {
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing';
  status: 'pending' | 'completed';
} {
  const photoRequired = yesterdayVehicleId !== null && yesterdayVehicleId !== currentVehicleId;

  if (!photoRequired) {
    return {
      photoRequired: false,
      photoStatus: 'not_required',
      status: 'completed',
    };
  }

  return {
    photoRequired: true,
    photoStatus: 'missing',
    status: 'pending',
  };
}

export function getCalendarDayRange(referenceDate: Date): { start: Date; end: Date } {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getYesterdayRange(referenceDate: Date): { start: Date; end: Date } {
  const { start: todayStart } = getCalendarDayRange(referenceDate);
  const start = new Date(todayStart);
  start.setDate(start.getDate() - 1);
  return { start, end: todayStart };
}

export async function findYesterdayVehicleId(
  prisma: PrismaService,
  driverId: string,
  referenceDate = new Date(),
): Promise<string | null> {
  const { start, end } = getYesterdayRange(referenceDate);

  const assignment = await prisma.assignment.findFirst({
    where: {
      driverId,
      workDate: { gte: start, lt: end },
      status: { notIn: [AssignmentStatus.cancelled] },
    },
    orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
    select: { vehicleId: true },
  });

  return assignment?.vehicleId ?? null;
}

export async function loadHandoverPhotosBySlot(
  prisma: PrismaService,
  handoverId: string,
): Promise<HandoverPhotosBySlot> {
  const documents = await prisma.document.findMany({
    where: {
      ownerType: 'vehicle_handover',
      ownerId: handoverId,
      documentType: { startsWith: 'handover_photo_' },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      documentType: true,
      fileName: true,
      fileUrl: true,
    },
  });

  const photos: HandoverPhotosBySlot = {};

  for (const document of documents) {
    const slot = slotFromHandoverDocumentType(document.documentType);
    if (!slot || photos[slot]) {
      continue;
    }

    photos[slot] = {
      id: document.id,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
    };
  }

  return photos;
}

export function missingHandoverPhotoSlots(
  photoRequired: boolean,
  photos: HandoverPhotosBySlot,
): HandoverPhotoSlot[] {
  if (!photoRequired) {
    return [];
  }

  return HANDOVER_PHOTO_SLOTS.filter((slot) => !photos[slot]);
}

export function allRequiredHandoverPhotosUploaded(
  photoRequired: boolean,
  photos: HandoverPhotosBySlot,
): boolean {
  return missingHandoverPhotoSlots(photoRequired, photos).length === 0;
}
