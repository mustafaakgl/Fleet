import { createHash } from 'node:crypto';
import exifr from 'exifr';

export const HANDOVER_PHOTO_MAX_AGE_MS = 10 * 60 * 1000;
export const HANDOVER_LOCATION_MISMATCH_METERS = 500;

export type HandoverPhotoValidationStatus = 'validated' | 'location_mismatch';

export class HandoverPhotoValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid_image'
      | 'missing_exif'
      | 'stale_exif'
      | 'stale_client_timestamp'
      | 'missing_client_timestamp'
      | 'duplicate_hash',
  ) {
    super(message);
    this.name = 'HandoverPhotoValidationError';
  }
}

const IMAGE_MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
];

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function assertValidImageMagicBytes(buffer: Buffer): void {
  if (!buffer || buffer.length < 12) {
    throw new HandoverPhotoValidationError('Invalid image file', 'invalid_image');
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    throw new HandoverPhotoValidationError('Invalid image file', 'invalid_image');
  }
}

export async function extractExifTakenAt(buffer: Buffer): Promise<Date | null> {
  try {
    const parsed = await exifr.parse(buffer, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
    if (!parsed) {
      return null;
    }

    const raw = parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.ModifyDate;
    if (!raw) {
      return null;
    }

    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export async function extractExifGps(buffer: Buffer): Promise<{ lat: number; lng: number } | null> {
  try {
    const gps = await exifr.gps(buffer);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }
    return { lat: gps.latitude, lng: gps.longitude };
  } catch {
    return null;
  }
}

export function parseClientTakenAt(value: string | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function assertTimestampWithinWindow(
  takenAt: Date,
  serverNow: Date,
  label: 'EXIF' | 'client',
): void {
  const delta = Math.abs(serverNow.getTime() - takenAt.getTime());
  if (delta > HANDOVER_PHOTO_MAX_AGE_MS) {
    if (label === 'EXIF') {
      throw new HandoverPhotoValidationError(
        'Photo must be taken in real time (EXIF timestamp is too old)',
        'stale_exif',
      );
    }
    throw new HandoverPhotoValidationError(
      'Photo must be taken in real time (client timestamp is too old)',
      'stale_client_timestamp',
    );
  }
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

export function resolveLocationValidationStatus(
  photoLat: number | null | undefined,
  photoLng: number | null | undefined,
  referenceLat: number | null | undefined,
  referenceLng: number | null | undefined,
): HandoverPhotoValidationStatus {
  if (
    photoLat == null ||
    photoLng == null ||
    referenceLat == null ||
    referenceLng == null
  ) {
    return 'validated';
  }

  const distance = haversineMeters(photoLat, photoLng, referenceLat, referenceLng);
  return distance > HANDOVER_LOCATION_MISMATCH_METERS ? 'location_mismatch' : 'validated';
}

export type ValidateHandoverPhotoInput = {
  buffer: Buffer;
  clientTakenAt?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  serverNow?: Date;
  extractExif?: (buffer: Buffer) => Promise<Date | null>;
};

export type ValidateHandoverPhotoResult = {
  fileHash: string;
  exifTakenAt: Date;
  clientTakenAt: Date;
  validationStatus: HandoverPhotoValidationStatus;
  gpsLat: number | null;
  gpsLng: number | null;
};

export async function validateHandoverPhotoUpload(
  input: ValidateHandoverPhotoInput,
): Promise<ValidateHandoverPhotoResult> {
  const serverNow = input.serverNow ?? new Date();
  const extractExif = input.extractExif ?? extractExifTakenAt;

  assertValidImageMagicBytes(input.buffer);

  const fileHash = sha256Hex(input.buffer);
  const exifTakenAt = await extractExif(input.buffer);
  if (!exifTakenAt) {
    throw new HandoverPhotoValidationError(
      'Photo must include camera EXIF metadata (gallery or screenshot images are not allowed)',
      'missing_exif',
    );
  }

  assertTimestampWithinWindow(exifTakenAt, serverNow, 'EXIF');

  const clientTakenAt = parseClientTakenAt(input.clientTakenAt);
  if (!clientTakenAt) {
    throw new HandoverPhotoValidationError(
      'Client capture timestamp is required',
      'missing_client_timestamp',
    );
  }
  assertTimestampWithinWindow(clientTakenAt, serverNow, 'client');

  const exifGps = await extractExifGps(input.buffer);
  const gpsLat = input.gpsLat ?? exifGps?.lat ?? null;
  const gpsLng = input.gpsLng ?? exifGps?.lng ?? null;

  return {
    fileHash,
    exifTakenAt,
    clientTakenAt,
    validationStatus: 'validated',
    gpsLat,
    gpsLng,
  };
}
