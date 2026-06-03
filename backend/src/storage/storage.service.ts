export type StorageBucket = 'documents' | 'vehicles';

export abstract class StorageService {
  abstract buildPublicUrl(bucket: StorageBucket, storedFileName: string): string;
}
