import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mimeTypeFromFileName } from './file-path.util';
import { DATEV_EXPORT_UPLOAD_ABSOLUTE_DIR } from './local-storage.service';
import { ObjectStorageService, type ObjectReadResult } from './object-storage.service';

export type StoredDatevExport = {
  storedPath: string;
  sha256: string;
  byteSize: number;
};

@Injectable()
export class DatevExportStorageService {
  constructor(private readonly objectStorage: ObjectStorageService) {
    mkdirSync(DATEV_EXPORT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildStoredPath(storedFileName: string): string {
    return `/uploads/datev-exports/${storedFileName}`;
  }

  buildFileName(periodStart: Date, periodEnd: Date): string {
    const start = periodStart.toISOString().slice(0, 10).replace(/-/g, '');
    const end = periodEnd.toISOString().slice(0, 10).replace(/-/g, '');
    return `datev-extf-${start}-${end}.csv`;
  }

  async save(storedFileName: string, contents: Buffer): Promise<StoredDatevExport> {
    const absolutePath = join(DATEV_EXPORT_UPLOAD_ABSOLUTE_DIR, storedFileName);
    writeFileSync(absolutePath, contents);

    const storedPath = this.buildStoredPath(storedFileName);
    await this.objectStorage.syncLocalFile(storedPath);

    return {
      storedPath,
      sha256: createHash('sha256').update(contents).digest('hex'),
      byteSize: contents.byteLength,
    };
  }

  async open(storedPath: string): Promise<ObjectReadResult | null> {
    return this.objectStorage.openStoredFile(storedPath);
  }

  mimeTypeFor(storedPath: string): string {
    return mimeTypeFromFileName(storedPath);
  }
}
