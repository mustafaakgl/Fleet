import { Injectable } from '@nestjs/common';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LicensePhotoCryptoService } from './license-photo-crypto.service';
import { LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR } from './local-storage.service';
import { ObjectStorageService } from './object-storage.service';
import { resolveAbsolutePathFromStoredUrl } from './file-path.util';

export type LicensePhotoSlot = 'front' | 'back' | 'selfie' | 'license_front' | 'license_back';

@Injectable()
export class LicensePhotoStorageService {
  constructor(
    private readonly crypto: LicensePhotoCryptoService,
    private readonly objectStorage: ObjectStorageService,
  ) {
    mkdirSync(LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR, { recursive: true });
  }

  buildStoredPath(storedFileName: string): string {
    return `/uploads/license-photos/${storedFileName}`;
  }

  generateFileName(originalName: string, slot: LicensePhotoSlot): string {
    const dotIdx = originalName.lastIndexOf('.');
    const extension = dotIdx >= 0 ? originalName.slice(dotIdx).toLowerCase() : '.jpg';
    return `${Date.now()}-${slot}-${randomUUID()}${extension}.enc`;
  }

  async saveEncrypted(originalName: string, slot: LicensePhotoSlot, buffer: Buffer): Promise<string> {
    const storedFileName = this.generateFileName(originalName, slot);
    const encrypted = this.crypto.encrypt(buffer);
    const absolutePath = join(LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR, storedFileName);
    writeFileSync(absolutePath, encrypted);

    const storedPath = this.buildStoredPath(storedFileName);
    await this.objectStorage.syncLocalFile(storedPath);
    return storedPath;
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

  private mimeFromFileName(storedPath: string): string {
    const base = storedPath.replace(/\.enc$/i, '');
    if (base.endsWith('.png')) return 'image/png';
    if (base.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
