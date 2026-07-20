import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAccessDocumentType } from './documents.service';

describe('document type privacy', () => {
  it('hides private, salary, and medical documents from office', () => {
    for (const documentType of ['private', 'salary', 'medical']) {
      assert.equal(canAccessDocumentType('office', documentType), false);
    }
    assert.equal(canAccessDocumentType('office', 'public'), true);
  });

  it('keeps sensitive documents available to admin, boss, accounting, and the owner driver', () => {
    for (const role of ['admin', 'boss', 'accounting', 'driver']) {
      assert.equal(canAccessDocumentType(role, 'medical'), true);
    }
  });
});