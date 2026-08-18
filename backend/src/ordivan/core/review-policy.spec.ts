import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNoteAcceptable, resolveNoteRequirement } from './review-policy';

const field = (overrides: Partial<{ fieldName: string; changed: boolean; criticalLowConfidence: boolean }> = {}) => ({
  fieldName: 'documentKind',
  changed: false,
  criticalLowConfidence: false,
  ...overrides,
});

describe('review-policy — aciklama ne zaman zorunlu', () => {
  it('rutin onayda aciklama OPSIYONEL', () => {
    const requirement = resolveNoteRequirement({
      decision: 'approved',
      proposalType: 'document.classification',
      fields: [field({ changed: true })],
    });

    assert.equal(requirement.required, false);
    assert.equal(isNoteAcceptable(requirement, ''), true);
  });

  it('red her zaman aciklama ister', () => {
    const requirement = resolveNoteRequirement({
      decision: 'rejected',
      proposalType: 'document.classification',
      rejectionCategory: 'incorrect_value',
      fields: [],
    });

    assert.deepEqual(requirement, { required: true, reason: 'reject' });
    assert.equal(isNoteAcceptable(requirement, ''), false);
    assert.equal(isNoteAcceptable(requirement, 'Beleg passt nicht zum Fahrzeug'), true);
  });

  it('red sebebi "other" ise gerekce ayrica isaretlenir', () => {
    const requirement = resolveNoteRequirement({
      decision: 'rejected',
      proposalType: 'document.classification',
      rejectionCategory: 'other',
      fields: [],
    });

    assert.deepEqual(requirement, { required: true, reason: 'rejection_category_other' });
  });

  it('kritik + dusuk guvenli alan DEGISTIRILMEDEN onaylaniyorsa aciklama ister', () => {
    const requirement = resolveNoteRequirement({
      decision: 'approved',
      proposalType: 'document.classification',
      fields: [field({ criticalLowConfidence: true, changed: false })],
    });

    assert.deepEqual(requirement, {
      required: true,
      reason: 'critical_low_confidence_unchanged',
    });
  });

  it('ayni alan DEGISTIRILDIYSE aciklama istenmez — insan zaten mudahale etti', () => {
    const requirement = resolveNoteRequirement({
      decision: 'approved',
      proposalType: 'document.classification',
      fields: [field({ criticalLowConfidence: true, changed: true })],
    });

    assert.equal(requirement.required, false);
  });

  it('cok kisa metin zorunlulugu karsilamaz', () => {
    const requirement = resolveNoteRequirement({
      decision: 'rejected',
      proposalType: 'x',
      rejectionCategory: 'duplicate',
      fields: [],
    });

    assert.equal(isNoteAcceptable(requirement, '  ok '), false);
  });
});
