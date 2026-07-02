import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Annex1cDddParser } from './annex1c-parser';
import { TestTrustStore } from './signature/test-trust-store';
import {
  buildDrivingWithoutCardVuFile,
  buildSignedGen1CardFile,
  buildTwoDayGen1CardFile,
  buildWrapAroundGen1CardFile,
  corruptSignedBuffer,
  FIXTURE_EXPECTATIONS,
} from './__fixtures__/fixture-builder';
import { readRingDailyRecords } from './activity-change';
import { parseCardTlvBlocks } from './tlv';
import { EF_DRIVER_ACTIVITY_DATA_GEN1 } from './constants';

describe('Annex 1C fixture round-trip', () => {
  const parser = new Annex1cDddParser(new TestTrustStore());

  it('parses two-day Gen1 card file', () => {
    const buffer = buildTwoDayGen1CardFile();
    const parsed = parser.parse(buffer);

    assert.equal(parsed.fileType, 'card');
    assert.equal(parsed.generation, 1);
    assert.equal(parsed.driverCardNo, FIXTURE_EXPECTATIONS.twoDayCardNo);
    assert.equal(parsed.activities.length, 6);
    assert.equal(parsed.ok, true);
  });

  it('parses ring-buffer wrap-around card file', () => {
    const buffer = buildWrapAroundGen1CardFile();
    const records = parseCardTlvBlocks(buffer);
    const activityRecord = records.find((r) => r.fid === EF_DRIVER_ACTIVITY_DATA_GEN1);
    assert.ok(activityRecord);

    const ring = activityRecord.value.subarray(4);
    const oldest = activityRecord.value.readUInt16BE(0);
    const newest = activityRecord.value.readUInt16BE(2);
    assert.equal(oldest, 20);
    assert.equal(newest, 6);
    const daily = readRingDailyRecords(ring, oldest, newest);
    assert.equal(daily.length, 2);

    const parsed = parser.parse(buffer);
    assert.equal(parsed.activities.length, 4);
  });

  it('parses VU file with driving_without_card event', () => {
    const buffer = buildDrivingWithoutCardVuFile();
    const parsed = parser.parse(buffer);

    assert.equal(parsed.fileType, 'vu');
    assert.equal(parsed.vehicleVin, FIXTURE_EXPECTATIONS.vuVin);
    assert.equal(parsed.events.some((e) => e.code === 'driving_without_card'), true);
  });

  it('validates signed card signatures', () => {
    const buffer = buildSignedGen1CardFile();
    const parsed = parser.parse(buffer);

    assert.equal(parsed.signature.checked, true);
    assert.equal(parsed.signature.valid, true);
    assert.equal(parsed.driverCardNo, FIXTURE_EXPECTATIONS.signedCardNo);
  });

  it('rejects corrupted signed copy', () => {
    const buffer = corruptSignedBuffer(buildSignedGen1CardFile());
    const parsed = parser.parse(buffer);

    assert.equal(parsed.signature.checked, true);
    assert.equal(parsed.signature.valid, false);
    assert.ok(parsed.signature.details.some((d) => d.includes('Invalid')));
  });
});
