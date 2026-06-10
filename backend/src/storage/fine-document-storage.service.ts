import { Injectable } from '@nestjs/common';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DefectPhotoCryptoService } from './defect-photo-crypto.service';
import { FINE_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from './local-storage.service';
import { ObjectStorageService } from './object-storage.service';
import { resolveAbsolutePathFromStoredUrl } from './file-path.util';

export { FINE_DOCUMENT_UPLOAD_ABSOLUTE_DIR, FINE_DOCUMENT_UPLOAD_RELATIVE_DIR } from './local-storage.service';

@Injectable()
export class FineDocumentStorageService {
  constructor(
    private readonly crypto: DefectPhotoCryptoService,
    private readonly objectStorage: ObjectStorageService,
  ) {
    mkdirSync(FINE_DOCUMENT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildStoredPath(storedFileName: string): string {
    return `/uploads/fine-documents/${storedFileName}`;
  }

  generateFileName(originalName: string): string {
    const dotIdx = originalName.lastIndexOf('.');
    const extension = dotIdx >= 0 ? originalName.slice(dotIdx).toLowerCase() : '.pdf';
    return `${Date.now()}-fine-${randomUUID()}${extension}.enc`;
  }

  async saveEncrypted(originalName: string, buffer: Buffer): Promise<{ storedPath: string; mimeType: string }> {
    const storedFileName = this.generateFileName(originalName);
    const encrypted = this.crypto.encrypt(buffer);
    const absolutePath = join(FINE_DOCUMENT_UPLOAD_ABSOLUTE_DIR, storedFileName);
    writeFileSync(absolutePath, encrypted);

    const storedPath = this.buildStoredPath(storedFileName);
    await this.objectStorage.syncLocalFile(storedPath);
    return { storedPath, mimeType: this.mimeFromFileName(originalName) };
  }

  async readDecrypted(storedPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const absolutePath = resolveAbsolutePathFromStoredUrl(storedPath);
    if (!absolutePath) return null;

    try {
      const encrypted = readFileSync(absolutePath);
      const plain = this.crypto.decrypt(encrypted);
      return { buffer: plain, contentType: this.mimeFromFileName(storedPath) };
    } catch {
      return null;
    }
  }

  async deleteStored(storedPath: string | null | undefined): Promise<void> {
    if (!storedPath) return;
    await this.objectStorage.deleteStoredFile(storedPath);
    const absolutePath = resolveAbsolutePathFromStoredUrl(storedPath);
    if (absolutePath) {
      await unlink(absolutePath).catch(() => undefined);
    }
  }

  private mimeFromFileName(fileName: string): string {
    const base = fileName.replace(/\.enc$/i, '').toLowerCase();
    if (base.endsWith('.pdf')) return 'application/pdf';
    if (base.endsWith('.png')) return 'image/png';
    if (base.endsWith('.webp')) return 'image/webp';
    if (base.endsWith('.jpg') || base.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
  }
}
