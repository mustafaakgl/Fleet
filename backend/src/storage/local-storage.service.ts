import { Injectable } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StorageBucket, StorageService } from './storage.service';

export const DOCUMENT_UPLOAD_RELATIVE_DIR = join('uploads', 'documents');
export const DOCUMENT_UPLOAD_ABSOLUTE_DIR = join(process.cwd(), DOCUMENT_UPLOAD_RELATIVE_DIR);
export const VEHICLE_PHOTO_UPLOAD_RELATIVE_DIR = join('uploads', 'vehicles');
export const VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR = join(process.cwd(), VEHICLE_PHOTO_UPLOAD_RELATIVE_DIR);
export const LICENSE_PHOTO_UPLOAD_RELATIVE_DIR = join('uploads', 'license-photos');
export const LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR = join(process.cwd(), LICENSE_PHOTO_UPLOAD_RELATIVE_DIR);
export const DEFECT_PHOTO_UPLOAD_RELATIVE_DIR = join('uploads', 'defect-photos');
export const DEFECT_PHOTO_UPLOAD_ABSOLUTE_DIR = join(process.cwd(), DEFECT_PHOTO_UPLOAD_RELATIVE_DIR);
export const FINE_DOCUMENT_UPLOAD_RELATIVE_DIR = join('uploads', 'fine-documents');
export const FINE_DOCUMENT_UPLOAD_ABSOLUTE_DIR = join(process.cwd(), FINE_DOCUMENT_UPLOAD_RELATIVE_DIR);

const UPLOAD_ABSOLUTE_DIRS: Record<StorageBucket, string> = {
  documents: DOCUMENT_UPLOAD_ABSOLUTE_DIR,
  vehicles: VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR,
  'license-photos': LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR,
  'defect-photos': DEFECT_PHOTO_UPLOAD_ABSOLUTE_DIR,
  'fine-documents': FINE_DOCUMENT_UPLOAD_ABSOLUTE_DIR,
};

export function uploadAbsoluteDirForBucket(bucket: StorageBucket): string {
  return UPLOAD_ABSOLUTE_DIRS[bucket];
}

@Injectable()
export class LocalStorageService extends StorageService {
  constructor() {
    super();
    for (const dir of Object.values(UPLOAD_ABSOLUTE_DIRS)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  buildStoredPath(bucket: StorageBucket, storedFileName: string): string {
    return `/uploads/${bucket}/${storedFileName}`;
  }

  buildDocumentDownloadPath(documentId: string): string {
    return `/documents/${documentId}/download`;
  }

  buildVehiclePhotoDownloadPath(vehicleId: string): string {
    return `/vehicles/${vehicleId}/photo`;
  }

  generateDocumentFileName(originalName: string): string {
    const dotIdx = originalName.lastIndexOf('.');
    const extension = dotIdx >= 0 ? originalName.slice(dotIdx).toLowerCase() : '';
    return `${Date.now()}-${randomUUID()}${extension}`;
  }
}
