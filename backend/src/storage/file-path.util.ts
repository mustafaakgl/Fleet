import { join } from 'node:path';
import {
  DOCUMENT_UPLOAD_ABSOLUTE_DIR,
  LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR,
  VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR,
} from './local-storage.service';
import type { StorageBucket } from './storage.service';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function mimeTypeFromFileName(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  const extension = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function parseStoredFileUrl(
  fileUrl: string,
): { bucket: StorageBucket; storedFileName: string } | null {
  const match = fileUrl.match(/^\/uploads\/(documents|vehicles|license-photos)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    bucket: match[1] as StorageBucket,
    storedFileName: match[2],
  };
}

export function resolveAbsolutePathFromStoredUrl(fileUrl: string): string | null {
  const parsed = parseStoredFileUrl(fileUrl);
  if (!parsed) {
    return null;
  }

  const baseDir =
    parsed.bucket === 'documents'
      ? DOCUMENT_UPLOAD_ABSOLUTE_DIR
      : parsed.bucket === 'vehicles'
        ? VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR
        : LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR;
  return join(baseDir, parsed.storedFileName);
}
