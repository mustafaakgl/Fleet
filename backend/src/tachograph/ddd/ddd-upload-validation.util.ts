const DDD_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.ddd',
  '.esm',
  '.tgd',
  '.c1b',
  '.v1b',
  '.v2b',
]);

export type DddUploadValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }
  return fileName.slice(dot).toLowerCase();
}

export function validateDddUpload(fileName: string, sizeBytes: number): DddUploadValidationResult {
  if (!fileName?.trim()) {
    return { ok: false, reason: 'file name is required' };
  }

  if (sizeBytes <= 0) {
    return { ok: false, reason: 'file is empty' };
  }

  if (sizeBytes > DDD_MAX_BYTES) {
    return { ok: false, reason: 'file exceeds 5 MB limit' };
  }

  const extension = extensionOf(fileName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, reason: 'unsupported DDD file extension' };
  }

  return { ok: true };
}

export const DDD_UPLOAD_MAX_BYTES = DDD_MAX_BYTES;
