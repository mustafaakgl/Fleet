import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertValidCheck,
  assertValidChecks,
  isBlocking,
  isUnknown,
  isVerified,
  summarizeChecks,
  type AutomationCheckResult,
} from './automation-check.contract';

function check(overrides: Partial<AutomationCheckResult> = {}): AutomationCheckResult {
  return {
    code: 'vat_id_format',
    status: 'verified',
    messageKey: 'automation.checks.vat_id_format.verified',
    ...overrides,
  };
}

describe('automation-check.contract — uc durumlu sozlesme', () => {
  it('yalnizca verified "gecti" sayilir', () => {
    assert.equal(isVerified(check({ status: 'verified' })), true);
    assert.equal(isVerified(check({ status: 'failed' })), false);
    assert.equal(
      isVerified(check({ status: 'unknown', unknownReason: 'service_unavailable' })),
      false,
    );
  });

  it('unknown, failed ile AYNI SEY DEGIL — ikisi ayri ayri sorulabiliyor', () => {
    const unknown = check({ status: 'unknown', unknownReason: 'service_unavailable' });
    assert.equal(isUnknown(unknown), true);
    assert.equal(isBlocking(unknown), false);

    const failed = check({ status: 'failed' });
    assert.equal(isBlocking(failed), true);
    assert.equal(isUnknown(failed), false);
  });

  it('tek bir unknown butun setin "hepsi dogrulandi" olmasini engeller', () => {
    const summary = summarizeChecks([
      check({ code: 'a', status: 'verified' }),
      check({ code: 'b', status: 'verified' }),
      check({ code: 'c', status: 'unknown', unknownReason: 'no_data' }),
    ]);

    assert.equal(summary.verified, 2);
    assert.equal(summary.unknown, 1);
    assert.equal(summary.allVerified, false);
    assert.equal(summary.hasUnknown, true);
  });

  it('hic kontrol calismadiysa "hepsi gecti" DENMEZ', () => {
    const summary = summarizeChecks([]);
    assert.equal(summary.allVerified, false);
    assert.equal(summary.total, 0);
  });

  it('gerekcesiz unknown kaydedilemez', () => {
    assert.throws(
      () => assertValidCheck(check({ status: 'unknown' })),
      /unknown without a reason/,
    );
    assert.throws(
      () => assertValidCheck(check({ status: 'unknown', unknownReason: '   ' })),
      /unknown without a reason/,
    );
  });

  it('gerekceli unknown ve diger durumlar gecerlidir', () => {
    assert.doesNotThrow(() =>
      assertValidChecks([
        check({ status: 'verified' }),
        check({ status: 'failed' }),
        check({ status: 'unknown', unknownReason: 'provider_timeout' }),
      ]),
    );
  });
});
