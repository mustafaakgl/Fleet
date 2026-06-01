export type StorageBucket = 'documents';

export abstract class StorageService {
  abstract buildPublicUrl(bucket: StorageBucket, storedFileName: string): string;
}
