import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

@Module({
  providers: [
    LocalStorageService,
    {
      provide: StorageService,
      useExisting: LocalStorageService,
    },
  ],
  exports: [StorageService, LocalStorageService],
})
export class StorageModule {}
