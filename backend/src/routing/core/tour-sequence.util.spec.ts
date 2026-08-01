import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_SEQUENCEABLE_STOPS,
  applyOptimizedOrder,
  splitDepotStops,
  toSequenceNumbers,
  validateSequenceInput,
  violatesPickupBeforeDelivery,
  type SequenceableStop,
} from './tour-sequence.util';

function stop(
  id: string,
  kind: SequenceableStop['kind'],
  assignmentId?: string | null,
  coords: [number, number] | null = [51.4, 6.7],
): SequenceableStop {
  return {
    id,
    kind,
    assignmentId: assignmentId ?? null,
    latitude: coords ? coords[0] : null,
    longitude: coords ? coords[1] : null,
  };
}

describe('tour-sequence.util', () => {
  describe('validateSequenceInput', () => {
    it('accepts a normal two-stop tour', () => {
      const issues = validateSequenceInput([stop('a', 'pickup', 'x'), stop('b', 'delivery', 'x')]);
      assert.deepEqual(issues, []);
    });

    it('rejects a tour with fewer than two stops', () => {
      const issues = validateSequenceInput([stop('a', 'pickup')]);
      assert.equal(issues[0]?.code, 'too_few_stops');
    });

    it('flags stops without coordinates and names the offender', () => {
      const issues = validateSequenceInput([
        stop('a', 'pickup', 'x'),
        stop('bad', 'delivery', 'x', null),
      ]);
      const issue = issues.find((i) => i.code === 'missing_coordinates');
      assert.equal(issue?.stopId, 'bad');
    });

    it('rejects more than one depot start or end', () => {
      const issues = validateSequenceInput([
        stop('d1', 'depot_start'),
        stop('d2', 'depot_start'),
        stop('e1', 'depot_end'),
        stop('e2', 'depot_end'),
      ]);
      assert.ok(issues.some((i) => i.code === 'multiple_depot_start'));
      assert.ok(issues.some((i) => i.code === 'multiple_depot_end'));
    });

    it('rejects tours beyond the sequencer limit', () => {
      const many = Array.from({ length: MAX_SEQUENCEABLE_STOPS + 1 }, (_, i) =>
        stop(`s${i}`, 'delivery'),
      );
      assert.ok(validateSequenceInput(many).some((i) => i.code === 'too_many_stops'));
    });
  });

  describe('splitDepotStops', () => {
    it('pulls depot stops out of the middle', () => {
      const { start, middle, end } = splitDepotStops([
        stop('d', 'depot_start'),
        stop('a', 'pickup'),
        stop('b', 'delivery'),
        stop('e', 'depot_end'),
      ]);
      assert.equal(start?.id, 'd');
      assert.equal(end?.id, 'e');
      assert.deepEqual(middle.map((s) => s.id), ['a', 'b']);
    });

    it('handles a tour without depots', () => {
      const { start, middle, end } = splitDepotStops([stop('a', 'pickup'), stop('b', 'delivery')]);
      assert.equal(start, null);
      assert.equal(end, null);
      assert.equal(middle.length, 2);
    });
  });

  describe('violatesPickupBeforeDelivery', () => {
    it('accepts pickup before delivery', () => {
      const ordered = [stop('p', 'pickup', 'job1'), stop('d', 'delivery', 'job1')];
      assert.equal(violatesPickupBeforeDelivery(ordered), false);
    });

    it('rejects delivery before its own pickup', () => {
      // Valhalla sadece gezgin satici cozer, bu kurali bilmez. Yuku almadan
      // teslime giden bir plan uretmektense optimizasyonu atlamak dogrudur.
      const ordered = [stop('d', 'delivery', 'job1'), stop('p', 'pickup', 'job1')];
      assert.equal(violatesPickupBeforeDelivery(ordered), true);
    });

    it('does not constrain a delivery whose pickup is not in this tour', () => {
      const ordered = [stop('d', 'delivery', 'job-elsewhere'), stop('p', 'pickup', 'job1')];
      assert.equal(violatesPickupBeforeDelivery(ordered), false);
    });

    it('checks each assignment independently', () => {
      const ordered = [
        stop('p1', 'pickup', 'job1'),
        stop('d2', 'delivery', 'job2'),
        stop('p2', 'pickup', 'job2'),
        stop('d1', 'delivery', 'job1'),
      ];
      assert.equal(violatesPickupBeforeDelivery(ordered), true);
    });
  });

  describe('applyOptimizedOrder', () => {
    const middle = [stop('a', 'pickup'), stop('b', 'delivery'), stop('c', 'delivery')];

    it('reorders according to the returned index list', () => {
      const result = applyOptimizedOrder(middle, [2, 0, 1]);
      assert.deepEqual(result?.map((s) => s.id), ['c', 'a', 'b']);
    });

    it('rejects an order with the wrong length', () => {
      assert.equal(applyOptimizedOrder(middle, [0, 1]), null);
    });

    it('rejects duplicate indexes', () => {
      assert.equal(applyOptimizedOrder(middle, [0, 0, 1]), null);
    });

    it('rejects out-of-range indexes', () => {
      assert.equal(applyOptimizedOrder(middle, [0, 1, 9]), null);
      assert.equal(applyOptimizedOrder(middle, [0, 1, -1]), null);
    });
  });

  it('numbers stops from one', () => {
    const numbered = toSequenceNumbers([stop('a', 'pickup'), stop('b', 'delivery')]);
    assert.deepEqual(numbered, [
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2 },
    ]);
  });
});
