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

@Injectable()
export class LocalStorageService extends StorageService {
  constructor() {
    super();
    mkdirSync(DOCUMENT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
    mkdirSync(VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR, { recursive: true });
    mkdirSync(LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildStoredPath(bucket: StorageBucket, storedFileName: string): string {
    if (bucket === 'documents') {
      return `/uploads/documents/${storedFileName}`;
    }
    if (bucket === 'vehicles') {
      return `/uploads/vehicles/${storedFileName}`;
    }
    if (bucket === 'license-photos') {
      return `/uploads/license-photos/${storedFileName}`;
    }
    throw new Error(`Unsupported storage bucket: ${bucket}`);
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
