import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  assertValidImageMagicBytes,
  assertTimestampWithinWindow,
  HandoverPhotoValidationError,
  sha256Hex,
  validateHandoverPhotoUpload,
} from './handover-photo-validation.util';

const FIXTURE_DIR = join(__dirname, '__fixtures__');

// Minimal valid JPEG (1x1) without EXIF — generated fixture.
const NO_EXIF_JPEG = readFileSync(join(FIXTURE_DIR, 'no-exif.jpg'));

describe('handover-photo-validation.util', () => {
  it('rejects invalid magic bytes', () => {
    assert.throws(
      () => assertValidImageMagicBytes(Buffer.from('not-an-image')),
      HandoverPhotoValidationError,
    );
  });

  it('rejects images without EXIF metadata', async () => {
    await assert.rejects(
      () =>
        validateHandoverPhotoUpload({
          buffer: NO_EXIF_JPEG,
          clientTakenAt: new Date().toISOString(),
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoverPhotoValidationError);
        assert.equal(error.code, 'missing_exif');
        return true;
      },
    );
  });

  it('rejects EXIF timestamps older than 10 minutes', async () => {
    const stale = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await assert.rejects(
      () =>
        validateHandoverPhotoUpload({
          buffer: NO_EXIF_JPEG,
          clientTakenAt: new Date().toISOString(),
          extractExif: async () => stale,
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoverPhotoValidationError);
        assert.equal(error.code, 'stale_exif');
        return true;
      },
    );
  });

  it('rejects client timestamps outside the allowed window', async () => {
    const now = new Date();
    const staleClient = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await assert.rejects(
      () =>
        validateHandoverPhotoUpload({
          buffer: NO_EXIF_JPEG,
          clientTakenAt: staleClient,
          serverNow: now,
          extractExif: async () => now,
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoverPhotoValidationError);
        assert.equal(error.code, 'stale_client_timestamp');
        return true;
      },
    );
  });

  it('accepts recent EXIF and client timestamps', async () => {
    const now = new Date();
    const result = await validateHandoverPhotoUpload({
      buffer: NO_EXIF_JPEG,
      clientTakenAt: now.toISOString(),
      serverNow: now,
      extractExif: async () => now,
    });

    assert.equal(result.validationStatus, 'validated');
    assert.ok(result.fileHash.length === 64);
    assert.equal(result.exifTakenAt.getTime(), now.getTime());
  });

  it('produces stable SHA-256 hashes for duplicate detection', () => {
    const hashA = sha256Hex(NO_EXIF_JPEG);
    const hashB = sha256Hex(NO_EXIF_JPEG);
    assert.equal(hashA, hashB);
    assert.notEqual(hashA, sha256Hex(Buffer.from('other')));
  });

  it('duplicate uploads share the same file hash (server rejects second upload)', async () => {
    const now = new Date();
    const first = await validateHandoverPhotoUpload({
      buffer: NO_EXIF_JPEG,
      clientTakenAt: now.toISOString(),
      serverNow: now,
      extractExif: async () => now,
    });
    const second = await validateHandoverPhotoUpload({
      buffer: Buffer.from(NO_EXIF_JPEG),
      clientTakenAt: now.toISOString(),
      serverNow: now,
      extractExif: async () => now,
    });
    assert.equal(first.fileHash, second.fileHash);
  });

  it('assertTimestampWithinWindow enforces the 10-minute rule', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60_000);
    assert.doesNotThrow(() => assertTimestampWithinWindow(recent, now, 'EXIF'));

    const old = new Date(now.getTime() - 11 * 60_000);
    assert.throws(() => assertTimestampWithinWindow(old, now, 'EXIF'), HandoverPhotoValidationError);
  });
});
