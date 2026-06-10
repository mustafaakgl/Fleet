import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class LicensePhotoCryptoService {
  private readonly logger = new Logger(LicensePhotoCryptoService.name);
  private readonly key: Buffer | null;

  constructor() {
    const raw = process.env.LICENSE_PHOTO_ENCRYPTION_KEY?.trim();
    if (!raw) {
      this.key = null;
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          'LICENSE_PHOTO_ENCRYPTION_KEY is not set — license photos will be stored without encryption.',
        );
      }
      return;
    }

    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      this.key = Buffer.from(raw, 'hex');
      return;
    }

    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length !== 32) {
      this.logger.warn('LICENSE_PHOTO_ENCRYPTION_KEY must be 32 bytes — encryption disabled.');
      this.key = null;
      return;
    }
    this.key = decoded;
  }

  get isEnabled(): boolean {
    return this.key !== null;
  }

  encrypt(plain: Buffer): Buffer {
    if (!this.key) {
      return plain;
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  decrypt(payload: Buffer): Buffer {
    if (!this.key) {
      return payload;
    }

    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid encrypted license photo payload');
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
