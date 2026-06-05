export type StorageBucket = 'documents' | 'vehicles';

export abstract class StorageService {
  /** Internal storage path persisted in the database (not publicly served). */
  abstract buildStoredPath(bucket: StorageBucket, storedFileName: string): string;

  abstract buildDocumentDownloadPath(documentId: string): string;

  abstract buildVehiclePhotoDownloadPath(vehicleId: string): string;
}
