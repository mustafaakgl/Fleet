import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { ObjectStorageService } from './object-storage.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    LocalStorageService,
    ObjectStorageService,
    {
      provide: StorageService,
      useExisting: LocalStorageService,
    },
  ],
  exports: [StorageService, LocalStorageService, ObjectStorageService],
})
export class StorageModule {}
