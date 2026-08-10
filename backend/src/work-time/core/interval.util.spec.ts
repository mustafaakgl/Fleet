import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { intersectIntervals, mergeIntervals, subtractIntervals } from './interval.util';

function at(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 7, 10, hours, minutes, 0, 0));
}

function interval(from: string, to: string) {
  return { from: at(from), to: at(to) };
}

function shape(intervals: Array<{ from: Date; to: Date }>): string[] {
  return intervals.map(
    (item) => `${item.from.toISOString().slice(11, 16)}-${item.to.toISOString().slice(11, 16)}`,
  );
}

describe('intersectIntervals', () => {
  it('keeps only the part inside the window', () => {
    const result = intersectIntervals([interval('06:00', '08:00')], interval('07:00', '17:00'));

    assert.deepEqual(shape(result), ['07:00-08:00']);
  });

  it('drops intervals fully outside the window', () => {
    assert.deepEqual(intersectIntervals([interval('03:00', '04:00')], interval('07:00', '17:00')), []);
  });

  it('returns nothing for an empty or reversed window', () => {
    assert.deepEqual(intersectIntervals([interval('08:00', '09:00')], interval('10:00', '10:00')), []);
    assert.deepEqual(intersectIntervals([interval('08:00', '09:00')], interval('12:00', '10:00')), []);
  });
});

describe('mergeIntervals', () => {
  it('joins touching intervals', () => {
    const result = mergeIntervals([interval('12:00', '12:08'), interval('12:08', '12:16')]);

    assert.deepEqual(shape(result), ['12:00-12:16']);
  });

  it('joins overlapping intervals regardless of input order', () => {
    const result = mergeIntervals([interval('12:10', '12:40'), interval('12:00', '12:20')]);

    assert.deepEqual(shape(result), ['12:00-12:40']);
  });

  it('swallows an interval fully contained in the previous one', () => {
    // Sonrakinin bitisi oncekinden erkense pencere KISALMAMALI.
    const result = mergeIntervals([interval('12:00', '13:00'), interval('12:10', '12:20')]);

    assert.deepEqual(shape(result), ['12:00-13:00']);
  });

  it('keeps intervals separated by more than the gap apart', () => {
    const result = mergeIntervals([interval('12:00', '12:10'), interval('12:40', '12:50')]);

    assert.deepEqual(shape(result), ['12:00-12:10', '12:40-12:50']);
  });

  it('drops empty and reversed intervals', () => {
    assert.deepEqual(mergeIntervals([interval('12:00', '12:00'), interval('13:00', '12:00')]), []);
  });
});

describe('subtractIntervals', () => {
  it('removes a fully covering cut', () => {
    assert.deepEqual(
      subtractIntervals([interval('12:06', '12:47')], [interval('12:05', '12:48')]),
      [],
    );
  });

  it('keeps the uncovered tail', () => {
    const result = subtractIntervals([interval('12:00', '12:47')], [interval('12:00', '12:30')]);

    assert.deepEqual(shape(result), ['12:30-12:47']);
  });

  it('splits an interval when the cut sits in the middle', () => {
    const result = subtractIntervals([interval('12:00', '13:00')], [interval('12:20', '12:30')]);

    assert.deepEqual(shape(result), ['12:00-12:20', '12:30-13:00']);
  });

  it('applies several cuts to the same interval', () => {
    const result = subtractIntervals(
      [interval('12:00', '13:00')],
      [interval('12:10', '12:20'), interval('12:40', '12:50')],
    );

    assert.deepEqual(shape(result), ['12:00-12:10', '12:20-12:40', '12:50-13:00']);
  });

  it('leaves the interval untouched when cuts do not overlap', () => {
    const result = subtractIntervals([interval('12:00', '12:30')], [interval('14:00', '15:00')]);

    assert.deepEqual(shape(result), ['12:00-12:30']);
  });
});
