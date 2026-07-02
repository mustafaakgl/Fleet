import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DDD_UPLOAD_MAX_BYTES, validateDddUpload } from './ddd-upload-validation.util';

describe('validateDddUpload', () => {
  it('accepts allowed extensions case-insensitively', () => {
    assert.deepEqual(validateDddUpload('driver.DDD', 1024), { ok: true });
    assert.deepEqual(validateDddUpload('unit.esm', 1024), { ok: true });
    assert.deepEqual(validateDddUpload('archive.TGD', 1024), { ok: true });
    assert.deepEqual(validateDddUpload('card.C1B', 1024), { ok: true });
    assert.deepEqual(validateDddUpload('vu.V1B', 1024), { ok: true });
    assert.deepEqual(validateDddUpload('vu.v2b', 1024), { ok: true });
  });

  it('accepts exactly 5 MB and rejects one byte over', () => {
    assert.deepEqual(validateDddUpload('driver.ddd', DDD_UPLOAD_MAX_BYTES), { ok: true });
    assert.deepEqual(validateDddUpload('driver.ddd', DDD_UPLOAD_MAX_BYTES + 1), {
      ok: false,
      reason: 'file exceeds 5 MB limit',
    });
  });

  it('rejects unsupported extensions', () => {
    assert.deepEqual(validateDddUpload('malware.exe', 1024), {
      ok: false,
      reason: 'unsupported DDD file extension',
    });
  });

  it('rejects empty files', () => {
    assert.deepEqual(validateDddUpload('driver.ddd', 0), {
      ok: false,
      reason: 'file is empty',
    });
  });
});
