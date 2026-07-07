import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

export const MESSENGER_ATTACHMENT_MAX_COUNT = 3;
export const MESSENGER_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const MESSENGER_ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type MessengerAttachmentMimeType = (typeof MESSENGER_ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export function sanitizeAttachmentFileName(value: string): string {
  const fileName = (value || 'file').replace(/\\/g, '/').split('/').pop() ?? 'file';
  const sanitized = fileName.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  return sanitized.length > 0 ? sanitized : 'file';
}

function assertMimeType(mimeType: string): asserts mimeType is MessengerAttachmentMimeType {
  if (!MESSENGER_ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType as MessengerAttachmentMimeType)) {
    throw new BadRequestException('Unsupported attachment type. Allowed: PDF, JPG, PNG, WEBP.');
  }
}

function normalizeExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return extension.slice(0, 16);
}

export function assertMessengerAttachmentsInput(files: Express.Multer.File[]): void {
  if (files.length > MESSENGER_ATTACHMENT_MAX_COUNT) {
    throw new BadRequestException(`A maximum of ${MESSENGER_ATTACHMENT_MAX_COUNT} attachments is allowed.`);
  }

  for (const file of files) {
    assertMimeType(file.mimetype);
    if (file.size > MESSENGER_ATTACHMENT_MAX_SIZE_BYTES) {
      throw new BadRequestException('Each attachment must be 10MB or smaller.');
    }
  }
}

export async function sanitizeAttachmentBuffer(file: Express.Multer.File): Promise<Buffer> {
  assertMimeType(file.mimetype);

  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    return file.buffer;
  }

  try {
    const image = sharp(file.buffer, { failOn: 'none' }).rotate();

    if (file.mimetype === 'image/jpeg') {
      return await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    }

    if (file.mimetype === 'image/png') {
      return await image.png({ compressionLevel: 9 }).toBuffer();
    }

    return await image.webp({ quality: 90 }).toBuffer();
  } catch {
    throw new BadRequestException('Invalid image attachment.');
  }
}

export function buildStoredAttachmentFileName(originalName: string): string {
  return `${Date.now()}-${randomUUID()}${normalizeExtension(originalName)}`;
}
