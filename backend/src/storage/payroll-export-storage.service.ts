import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mimeTypeFromFileName } from './file-path.util';
import { PAYROLL_EXPORT_UPLOAD_ABSOLUTE_DIR } from './local-storage.service';
import { ObjectStorageService, type ObjectReadResult } from './object-storage.service';

export type StoredPayrollExport = {
  storedPath: string;
  sha256: string;
  byteSize: number;
};

/**
 * DATEV Lohn ihracat dosyalari. DatevExportStorageService ile ayni sekil, AYRI
 * kova: Rechnungswesen ve Lohn iki farkli DATEV urunu ve dosyalarinin
 * karismasi yanlis dosyayi yanlis muhasebeye gonderir.
 */
@Injectable()
export class PayrollExportStorageService {
  constructor(private readonly objectStorage: ObjectStorageService) {
    mkdirSync(PAYROLL_EXPORT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildStoredPath(storedFileName: string): string {
    return `/uploads/payroll-exports/${storedFileName}`;
  }

  buildFileName(year: number, month: number, format: string): string {
    return `lohn-${format}-${year}${String(month).padStart(2, '0')}.csv`;
  }

  async save(storedFileName: string, contents: Buffer): Promise<StoredPayrollExport> {
    const absolutePath = join(PAYROLL_EXPORT_UPLOAD_ABSOLUTE_DIR, storedFileName);
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
