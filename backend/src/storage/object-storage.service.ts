import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { parseStoredFileUrl } from './file-path.util';
import {
  DOCUMENT_UPLOAD_ABSOLUTE_DIR,
  LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR,
  VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR,
} from './local-storage.service';
import type { StorageBucket } from './storage.service';

export type ObjectReadResult = {
  stream: Readable;
  contentType?: string;
};

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly s3?: S3Client;
  private readonly bucket: string;

  constructor() {
    this.driver = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
    this.bucket = process.env.S3_BUCKET?.trim() || 'fleet-uploads';
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        region: process.env.S3_REGION?.trim() || 'eu-central-1',
        endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials:
          process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
    }
  }

  get mode(): 'local' | 's3' {
    return this.driver;
  }

  async onModuleInit(): Promise<void> {
    const verify = await this.verifyConnection();
    if (this.driver === 's3' && verify.ok) {
      this.logger.log(`S3 bucket ready: ${this.bucket}`);
    } else if (this.driver === 's3' && verify.error) {
      this.logger.warn(`S3 bucket check failed (${this.bucket}): ${verify.error}`);
    }
  }

  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    if (this.driver !== 's3' || !this.s3) {
      return { ok: false, error: 's3_not_configured' };
    }

    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 's3_verify_failed';
      return { ok: false, error: message };
    }
  }

  private objectKey(bucket: StorageBucket, storedFileName: string): string {
    return `${bucket}/${storedFileName}`;
  }

  private localAbsolutePath(bucket: StorageBucket, storedFileName: string): string {
    const base =
      bucket === 'documents'
        ? DOCUMENT_UPLOAD_ABSOLUTE_DIR
        : bucket === 'vehicles'
          ? VEHICLE_PHOTO_UPLOAD_ABSOLUTE_DIR
          : LICENSE_PHOTO_UPLOAD_ABSOLUTE_DIR;
    return `${base}/${storedFileName}`;
  }

  async syncLocalFile(fileUrl: string): Promise<void> {
    if (this.driver !== 's3' || !this.s3) return;

    const parsed = parseStoredFileUrl(fileUrl);
    if (!parsed) return;

    const absolutePath = this.localAbsolutePath(parsed.bucket, parsed.storedFileName);
    if (!existsSync(absolutePath)) return;

    const body = readFileSync(absolutePath);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(parsed.bucket, parsed.storedFileName),
        Body: body,
      }),
    );
  }

  async openStoredFile(fileUrl: string): Promise<ObjectReadResult | null> {
    const parsed = parseStoredFileUrl(fileUrl);
    if (!parsed) return null;

    if (this.driver === 's3' && this.s3) {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(parsed.bucket, parsed.storedFileName),
        }),
      );
      if (!response.Body) return null;
      return {
        stream: response.Body as Readable,
        contentType: response.ContentType,
      };
    }

    const absolutePath = this.localAbsolutePath(parsed.bucket, parsed.storedFileName);
    if (!existsSync(absolutePath)) return null;
    return { stream: createReadStream(absolutePath) };
  }

  async deleteStoredFile(fileUrl: string): Promise<void> {
    const parsed = parseStoredFileUrl(fileUrl);
    if (!parsed) return;

    if (this.driver === 's3' && this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(parsed.bucket, parsed.storedFileName),
        }),
      );
    }
  }
}
