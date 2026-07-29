import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mimeTypeFromFileName } from './file-path.util';
import { INVOICE_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from './local-storage.service';
import { ObjectStorageService, type ObjectReadResult } from './object-storage.service';

export { INVOICE_DOCUMENT_UPLOAD_ABSOLUTE_DIR, INVOICE_DOCUMENT_UPLOAD_RELATIVE_DIR } from './local-storage.service';

export type StoredInvoiceDocument = {
  storedPath: string;
  sha256: string;
  byteSize: number;
};

/**
 * Write-once storage for legal invoice artifacts. There is deliberately no update or
 * delete: a finalized invoice's PDF and XML are immutable records under GoBD, and the
 * SHA-256 returned here is persisted so tampering is detectable later.
 */
@Injectable()
export class InvoiceDocumentStorageService {
  constructor(private readonly objectStorage: ObjectStorageService) {
    mkdirSync(INVOICE_DOCUMENT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildStoredPath(storedFileName: string): string {
    return `/uploads/invoice-documents/${storedFileName}`;
  }

  /**
   * File names embed the invoice number so an operator browsing the bucket can match a
   * file to a booking without a database lookup.
   */
  buildFileName(invoiceNumber: string, kind: 'rechnung' | 'zugferd' | 'xrechnung'): string {
    const slug = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, '-');
    const extension = kind === 'rechnung' ? 'pdf' : 'xml';
    return `${slug}-${kind}.${extension}`;
  }

  async save(storedFileName: string, contents: Uint8Array | string): Promise<StoredInvoiceDocument> {
    const buffer = typeof contents === 'string' ? Buffer.from(contents, 'utf8') : Buffer.from(contents);
    const absolutePath = join(INVOICE_DOCUMENT_UPLOAD_ABSOLUTE_DIR, storedFileName);
    writeFileSync(absolutePath, buffer);

    const storedPath = this.buildStoredPath(storedFileName);
    await this.objectStorage.syncLocalFile(storedPath);

    return {
      storedPath,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      byteSize: buffer.byteLength,
    };
  }

  async open(storedPath: string): Promise<ObjectReadResult | null> {
    return this.objectStorage.openStoredFile(storedPath);
  }

  mimeTypeFor(storedPath: string): string {
    return mimeTypeFromFileName(storedPath);
  }
}
