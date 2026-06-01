import { Injectable } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StorageBucket, StorageService } from './storage.service';

export const DOCUMENT_UPLOAD_RELATIVE_DIR = join('uploads', 'documents');
export const DOCUMENT_UPLOAD_ABSOLUTE_DIR = join(process.cwd(), DOCUMENT_UPLOAD_RELATIVE_DIR);

@Injectable()
export class LocalStorageService extends StorageService {
  constructor() {
    super();
    mkdirSync(DOCUMENT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildPublicUrl(bucket: StorageBucket, storedFileName: string): string {
    if (bucket !== 'documents') {
      throw new Error(`Unsupported storage bucket: ${bucket}`);
    }
    return `/uploads/documents/${storedFileName}`;
  }

  generateDocumentFileName(originalName: string): string {
    const dotIdx = originalName.lastIndexOf('.');
    const extension = dotIdx >= 0 ? originalName.slice(dotIdx).toLowerCase() : '';
    return `${Date.now()}-${randomUUID()}${extension}`;
  }
}
