import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canApprove,
  ensureApprovable,
  ensureMutable,
  ensureSignable,
} from './equipment-issuance-state.util';

describe('equipment issuance state guards', () => {
  it('allows approve only for signed/manual_uploaded', () => {
    assert.equal(canApprove('pending_signature'), false);
    assert.equal(canApprove('signed'), true);
    assert.equal(canApprove('manual_uploaded'), true);
    assert.equal(canApprove('approved'), false);
  });

  it('blocks sign when not pending_signature', () => {
    assert.throws(() => ensureSignable('signed'));
    assert.throws(() => ensureSignable('approved'));
  });

  it('blocks mutation when approved or cancelled', () => {
    assert.throws(() => ensureMutable('approved'));
    assert.throws(() => ensureMutable('cancelled'));
    assert.doesNotThrow(() => ensureMutable('pending_signature'));
  });

  it('enforces approvable states', () => {
    assert.doesNotThrow(() => ensureApprovable('signed'));
    assert.doesNotThrow(() => ensureApprovable('manual_uploaded'));
    assert.throws(() => ensureApprovable('pending_signature'));
  });
});
