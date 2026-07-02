import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDddBuffer } from './ddd-parser';
import { SyntheticDddParser } from './synthetic-ddd-parser';

const FIXTURE_DIR = join(__dirname, '__fixtures__');

describe('ddd-parser', () => {
  it('parses driver card sample fixture via synthetic fallback', () => {
    const buf = readFileSync(join(FIXTURE_DIR, 'sample-driver-card.ddd'));
    const parsed = parseDddBuffer(buf);

    assert.equal(parsed.fileType, 'card');
    assert.equal(parsed.driverCardNo, 'CARD-TR-0001');
    assert.equal(parsed.activities.length, 4);
    assert.equal(parsed.dailyTotals.length, 2);
    assert.equal(parsed.events.some((e) => e.type === 'overspeed'), true);
    assert.ok(parsed.warnings.some((w) => w.includes('synthetic')));
  });

  it('parses vu sample fixture via synthetic fallback', () => {
    const buf = readFileSync(join(FIXTURE_DIR, 'sample-vu.ddd'));
    const parsed = parseDddBuffer(buf);

    assert.equal(parsed.fileType, 'vu');
    assert.equal(parsed.vehicleVin, 'WDB96340310234567');
    assert.equal(parsed.activities.length >= 2, true);
    assert.equal(parsed.dailyTotals.length, 1);
  });

  it('returns graceful warning for broken file', () => {
    const buf = readFileSync(join(FIXTURE_DIR, 'sample-broken.ddd'));
    const parsed = parseDddBuffer(buf);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.warnings.length > 0, true);
  });

  it('parses legacy synthetic fixtures directly', () => {
    const buf = readFileSync(join(FIXTURE_DIR, 'sample-driver-card.ddd'));
    const parsed = new SyntheticDddParser().parse(buf);
    assert.equal(parsed.driverCardNo, 'CARD-TR-0001');
    assert.equal(parsed.warnings.some((w) => w.includes('synthetic')), false);
  });
});
