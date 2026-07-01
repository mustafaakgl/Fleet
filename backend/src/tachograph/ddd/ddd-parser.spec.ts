import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDddBuffer } from './ddd-parser';

const FIXTURE_DIR = join(__dirname, '__fixtures__');

describe('ddd-parser', () => {
  it('parses driver card sample fixture', () => {
    const buf = readFileSync(join(FIXTURE_DIR, 'sample-driver-card.ddd'));
    const parsed = parseDddBuffer(buf);

    assert.equal(parsed.fileType, 'card');
    assert.equal(parsed.driverCardNo, 'CARD-TR-0001');
    assert.equal(parsed.activities.length, 4);
    assert.equal(parsed.dailyTotals.length, 2);
    assert.equal(parsed.events.some((e) => e.type === 'overspeed'), true);
  });

  it('parses vu sample fixture', () => {
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
});
