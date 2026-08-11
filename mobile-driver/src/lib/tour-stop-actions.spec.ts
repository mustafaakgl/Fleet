import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeStopId,
  completedStopCount,
  newClientEventId,
  nextStopAction,
} from './tour-stop-actions';
import type { DriverTourStop, DriverTourStopStatus } from '@/api/types';

function stop(id: string, sequence: number, status: DriverTourStopStatus): DriverTourStop {
  return { id, sequence, status } as DriverTourStop;
}

describe('nextStopAction', () => {
  it('offers arrival first, completion second', () => {
    assert.deepEqual(nextStopAction('pending'), {
      kind: 'mark',
      next: 'arrived',
      labelKey: 'tour.markArrived',
    });
    assert.deepEqual(nextStopAction('arrived'), {
      kind: 'mark',
      next: 'completed',
      labelKey: 'tour.markCompleted',
    });
  });

  it('offers undo on a finished stop, never a forward step', () => {
    // Sunucu durum gerilemesini reddediyor; ileri dugmesi gostermek surucuye
    // reddedilecek istek attirirdi.
    for (const status of ['completed', 'skipped'] as const) {
      assert.equal(nextStopAction(status).kind, 'reset');
    }
  });
});

describe('activeStopId', () => {
  it('points at the first unfinished stop in visit order', () => {
    const stops = [
      stop('c', 3, 'pending'),
      stop('a', 1, 'completed'),
      stop('b', 2, 'pending'),
    ];
    assert.equal(activeStopId(stops), 'b');
  });

  it('skips over a skipped stop', () => {
    const stops = [stop('a', 1, 'skipped'), stop('b', 2, 'pending')];
    assert.equal(activeStopId(stops), 'b');
  });

  it('returns nothing when the tour is done', () => {
    assert.equal(activeStopId([stop('a', 1, 'completed')]), null);
  });

  it('handles an empty tour', () => {
    assert.equal(activeStopId([]), null);
  });
});

describe('completedStopCount', () => {
  it('counts skipped stops as done — the driver is past them', () => {
    const stops = [
      stop('a', 1, 'completed'),
      stop('b', 2, 'skipped'),
      stop('c', 3, 'arrived'),
    ];
    assert.equal(completedStopCount(stops), 2);
  });
});

describe('newClientEventId', () => {
  it('stays within the field limit the server accepts', () => {
    const id = newClientEventId('a'.repeat(40), 'completed', 1786454242658);
    assert.ok(id.length <= 64, `${id.length}`);
  });

  it('differs between two taps on the same stop', () => {
    // Ayni dokunusun TEKRARI ayni kimligi tasimali; iki ayri dokunus degil.
    const first = newClientEventId('s1', 'arrived', 1);
    const second = newClientEventId('s1', 'arrived', 2);
    assert.notEqual(first, second);
  });
});
