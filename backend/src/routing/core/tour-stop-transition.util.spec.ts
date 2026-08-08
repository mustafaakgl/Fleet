import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideStopTransition,
  isTerminalStopStatus,
  type StopTransitionCurrent,
} from './tour-stop-transition.util';

const at = (
  status: StopTransitionCurrent['status'],
  clientEventId: string | null = null,
): StopTransitionCurrent => ({ status, clientEventId });

describe('decideStopTransition', () => {
  it('walks a stop forward through the normal sequence', () => {
    const arrive = decideStopTransition(at('pending'), { status: 'arrived' });
    assert.equal(arrive.apply, true);
    assert.deepEqual(arrive, { apply: true, setsArrivedAt: true, setsCompletedAt: false });

    const complete = decideStopTransition(at('arrived'), { status: 'completed' });
    assert.deepEqual(complete, { apply: true, setsArrivedAt: false, setsCompletedAt: true });
  });

  it('allows completing without an arrival first', () => {
    // Bir dokunusla bitirmek isteyen surucuyu iki adima zorlamiyoruz.
    assert.equal(decideStopTransition(at('pending'), { status: 'completed' }).apply, true);
  });

  /**
   * Cevrimdisi kuyruk baglanti gelince ayni olayi tekrar gonderebilir; ikinci
   * gonderim hicbir sey degistirmemeli.
   */
  it('ignores an event it has already applied', () => {
    const decision = decideStopTransition(at('completed', 'evt-1'), {
      status: 'completed',
      clientEventId: 'evt-1',
    });
    assert.deepEqual(decision, { apply: false, reason: 'duplicate_event' });
  });

  it('applies a different event even when one was applied before', () => {
    const decision = decideStopTransition(at('arrived', 'evt-1'), {
      status: 'completed',
      clientEventId: 'evt-2',
    });
    assert.equal(decision.apply, true);
  });

  /**
   * Kuyruk olaylari sirasi bozuk gelebilir. "vardim" olayi "tamamlandi"dan
   * sonra ulasirsa durak yeniden acilmamali.
   */
  it('refuses to walk a stop backwards', () => {
    assert.deepEqual(decideStopTransition(at('completed'), { status: 'arrived' }), {
      apply: false,
      reason: 'status_regression',
    });
    assert.deepEqual(decideStopTransition(at('skipped'), { status: 'arrived' }), {
      apply: false,
      reason: 'status_regression',
    });
  });

  it('treats completed and skipped as equally final', () => {
    // Ikisi de bitmis sayildigi icin birbirini ezebilir, ama geri gidemez.
    assert.equal(decideStopTransition(at('completed'), { status: 'skipped' }).apply, true);
    assert.equal(decideStopTransition(at('skipped'), { status: 'completed' }).apply, true);
  });

  it('rejects pending as a marking, since undo has its own endpoint', () => {
    assert.deepEqual(decideStopTransition(at('arrived'), { status: 'pending' }), {
      apply: false,
      reason: 'not_markable',
    });
  });

  it('re-applying the same status without an event id is harmless', () => {
    assert.equal(decideStopTransition(at('completed'), { status: 'completed' }).apply, true);
  });
});

describe('isTerminalStopStatus', () => {
  it('marks only the statuses that finish a stop', () => {
    assert.equal(isTerminalStopStatus('completed'), true);
    assert.equal(isTerminalStopStatus('skipped'), true);
    assert.equal(isTerminalStopStatus('arrived'), false);
    assert.equal(isTerminalStopStatus('pending'), false);
  });
});
