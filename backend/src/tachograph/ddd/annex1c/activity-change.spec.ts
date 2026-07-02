import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVITY_AVAILABLE,
  ACTIVITY_DRIVING,
  ACTIVITY_REST,
  ACTIVITY_WORK,
  CARD_INSERTED_MASK,
  CREW_MASK,
  MINUTES_MASK,
  SLOT_MASK,
} from './constants';
import { decodeActivityChangeInfo, encodeActivityChangeInfo } from './activity-change';
import { decodeTimeReal, encodeTimeReal } from './time-real';

describe('ActivityChangeInfo decode', () => {
  const cases: Array<{ hex: string; expected: ReturnType<typeof decodeActivityChangeInfo> }> = [
    { hex: '0000', expected: { slot: false, crew: false, cardInserted: false, activity: ACTIVITY_REST, minutes: 0 } },
    { hex: '0800', expected: { slot: false, crew: false, cardInserted: false, activity: ACTIVITY_AVAILABLE, minutes: 0 } },
    { hex: '1000', expected: { slot: false, crew: false, cardInserted: false, activity: ACTIVITY_WORK, minutes: 0 } },
    { hex: '1800', expected: { slot: false, crew: false, cardInserted: false, activity: ACTIVITY_DRIVING, minutes: 0 } },
    { hex: '01e0', expected: { slot: false, crew: false, cardInserted: false, activity: ACTIVITY_REST, minutes: 480 } },
    { hex: '21e0', expected: { slot: false, crew: false, cardInserted: true, activity: ACTIVITY_REST, minutes: 480 } },
    { hex: 'fbff', expected: { slot: true, crew: true, cardInserted: true, activity: ACTIVITY_DRIVING, minutes: 1023 } },
    { hex: '912c', expected: { slot: true, crew: false, cardInserted: false, activity: ACTIVITY_WORK, minutes: 300 } },
  ];

  for (const testCase of cases) {
    it(`decodes 0x${testCase.hex}`, () => {
      const raw = Number.parseInt(testCase.hex, 16);
      assert.deepEqual(decodeActivityChangeInfo(raw), testCase.expected);
    });
  }

  it('round-trips encoded values', () => {
    const info = {
      slot: true,
      crew: false,
      cardInserted: true,
      activity: ACTIVITY_DRIVING,
      minutes: 720,
    };
    const raw = encodeActivityChangeInfo(info);
    assert.equal(raw & SLOT_MASK, SLOT_MASK);
    assert.equal(raw & CREW_MASK, 0);
    assert.equal(raw & CARD_INSERTED_MASK, CARD_INSERTED_MASK);
    assert.equal(raw & MINUTES_MASK, 720);
    assert.deepEqual(decodeActivityChangeInfo(raw), info);
  });
});

describe('TimeReal codec', () => {
  it('encodes and decodes epoch seconds', () => {
    const epoch = 1_717_200_000;
    const buf = encodeTimeReal(epoch);
    assert.equal(buf.length, 4);
    assert.equal(decodeTimeReal(buf), epoch);
  });
});
