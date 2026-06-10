import { join } from 'node:path';
import {
  uploadAbsoluteDirForBucket,
} from './local-storage.service';
import type { StorageBucket } from './storage.service';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const STORED_FILE_URL_PATTERN =
  /^\/uploads\/(documents|vehicles|license-photos|defect-photos|fine-documents)\/([^/]+)$/;

export function mimeTypeFromFileName(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  const extension = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function parseStoredFileUrl(
  fileUrl: string,
): { bucket: StorageBucket; storedFileName: string } | null {
  const match = fileUrl.match(STORED_FILE_URL_PATTERN);
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

  return join(uploadAbsoluteDirForBucket(parsed.bucket), parsed.storedFileName);
}
