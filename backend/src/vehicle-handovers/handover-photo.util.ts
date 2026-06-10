import { AssignmentStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Required when the driver’s vehicle changed since yesterday (exterior + tail lift + interior). */
export const HANDOVER_PHOTO_SLOTS = [
  'front',
  'right',
  'left',
  'rear',
  'tail_lift',
  'interior',
] as const;

export type HandoverPhotoSlot = (typeof HANDOVER_PHOTO_SLOTS)[number];

export type HandoverPhotoSummary = {
  id: string;
  fileName: string;
  download_url: string | null;
  validationStatus?: 'validated' | 'location_mismatch';
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

export type PhotoRequirementInput = {
  yesterdayVehicleId: string | null;
  currentVehicleId: string;
  yesterdayPlate?: string | null;
  todayPlate?: string | null;
};

export function normalizePlate(plate: string): string {
  return plate.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
}

function resolvePhotoRequirement(input: PhotoRequirementInput): {
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing';
  status: 'pending' | 'completed';
} {
  const vehicleChanged =
    input.yesterdayVehicleId !== null &&
    input.yesterdayVehicleId !== input.currentVehicleId;

  const yesterdayNorm = input.yesterdayPlate?.trim()
    ? normalizePlate(input.yesterdayPlate)
    : null;
  const todayNorm = input.todayPlate?.trim() ? normalizePlate(input.todayPlate) : null;
  const plateChanged =
    yesterdayNorm !== null &&
    todayNorm !== null &&
    yesterdayNorm !== todayNorm;

  const photoRequired = vehicleChanged || plateChanged;

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

export function calculatePhotoRequirement(
  yesterdayVehicleId: string | null,
  currentVehicleId: string,
): {
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing';
  status: 'pending' | 'completed';
};
export function calculatePhotoRequirement(input: PhotoRequirementInput): {
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing';
  status: 'pending' | 'completed';
};
export function calculatePhotoRequirement(
  arg1: string | null | PhotoRequirementInput,
  arg2?: string,
): {
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing';
  status: 'pending' | 'completed';
} {
  if (typeof arg1 === 'object' && arg1 !== null && 'currentVehicleId' in arg1) {
    return resolvePhotoRequirement(arg1);
  }

  return resolvePhotoRequirement({
    yesterdayVehicleId: arg1 as string | null,
    currentVehicleId: arg2!,
  });
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

export async function findYesterdayPlate(
  prisma: PrismaService,
  driverId: string,
  referenceDate = new Date(),
): Promise<string | null> {
  const { start, end } = getYesterdayRange(referenceDate);

  const checkin = await prisma.morningCheckin.findFirst({
    where: {
      driverId,
      date: { gte: start, lt: end },
    },
    orderBy: { submittedAt: 'desc' },
    select: { vehiclePlate: true },
  });
  if (checkin?.vehiclePlate?.trim()) {
    return checkin.vehiclePlate.trim();
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      driverId,
      workDate: { gte: start, lt: end },
      status: { notIn: [AssignmentStatus.cancelled] },
    },
    orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
    select: { vehicle: { select: { plateNumber: true } } },
  });

  return assignment?.vehicle?.plateNumber?.trim() ?? null;
}

export async function loadHandoverPhotosBySlot(
  prisma: PrismaService,
  handoverId: string,
  options?: { downloadPathPrefix?: string },
): Promise<HandoverPhotosBySlot> {
  const downloadPrefix = options?.downloadPathPrefix ?? '/driver/documents';

  const records = await prisma.handoverPhoto.findMany({
    where: { handoverId },
    orderBy: { createdAt: 'desc' },
    include: {
      document: {
        select: {
          id: true,
          documentType: true,
          fileName: true,
          fileUrl: true,
        },
      },
    },
  });

  const photos: HandoverPhotosBySlot = {};

  for (const record of records) {
    const slot = parseHandoverPhotoSlot(record.slot);
    if (!slot || photos[slot]) {
      continue;
    }

    photos[slot] = {
      id: record.document.id,
      fileName: record.document.fileName,
      download_url: record.document.fileUrl
        ? `${downloadPrefix}/${record.document.id}/download`
        : null,
      validationStatus: record.validationStatus,
    };
  }

  // Legacy rows created before handover_photos table existed.
  if (Object.keys(photos).length === 0) {
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

    for (const document of documents) {
      const slot = slotFromHandoverDocumentType(document.documentType);
      if (!slot || photos[slot]) {
        continue;
      }

      photos[slot] = {
        id: document.id,
        fileName: document.fileName,
        download_url: document.fileUrl ? `${downloadPrefix}/${document.id}/download` : null,
      };
    }
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
