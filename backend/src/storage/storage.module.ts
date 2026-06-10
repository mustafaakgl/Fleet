import { Global, Module } from '@nestjs/common';
import { DefectPhotoCryptoService } from './defect-photo-crypto.service';
import { DefectPhotoStorageService } from './defect-photo-storage.service';
import { FineDocumentStorageService } from './fine-document-storage.service';
import { LicensePhotoCryptoService } from './license-photo-crypto.service';
import { LicensePhotoStorageService } from './license-photo-storage.service';
import { LocalStorageService } from './local-storage.service';
import { ObjectStorageService } from './object-storage.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    LocalStorageService,
    ObjectStorageService,
    LicensePhotoCryptoService,
    LicensePhotoStorageService,
    DefectPhotoCryptoService,
    DefectPhotoStorageService,
    FineDocumentStorageService,
    {
      provide: StorageService,
      useExisting: LocalStorageService,
    },
  ],
  exports: [
    StorageService,
    LocalStorageService,
    ObjectStorageService,
    LicensePhotoCryptoService,
    LicensePhotoStorageService,
    DefectPhotoCryptoService,
    DefectPhotoStorageService,
    FineDocumentStorageService,
  ],
})
export class StorageModule {}
