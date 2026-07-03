import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMotionState } from './motion-state.util';

const NOW_MS = Date.parse('2026-07-03T12:00:00.000Z');

describe('resolveMotionState', () => {
  it('returns moving at boundary speed 2.0 when ignition is on', () => {
    const result = resolveMotionState({
      presenceStatus: 'online',
      ignitionOn: true,
      speedKph: 2.0,
      idleSinceMs: NOW_MS - 60 * 60 * 1000,
      nowMs: NOW_MS,
      idleWatchMinutes: 10,
    });

    assert.equal(result.motionState, 'moving');
    assert.equal(result.idleSinceMs, undefined);
  });

  it('does not return idle at speed 1.9 before 10:00 threshold', () => {
    const result = resolveMotionState({
      presenceStatus: 'online',
      ignitionOn: true,
      speedKph: 1.9,
      idleSinceMs: NOW_MS - (9 * 60 + 59) * 1000,
      nowMs: NOW_MS,
      idleWatchMinutes: 10,
    });

    assert.equal(result.motionState, 'moving');
    assert.equal(result.idleSinceMs, undefined);
  });

  it('returns idle with idleSince at 10:00 threshold', () => {
    const idleSinceMs = NOW_MS - 10 * 60 * 1000;
    const result = resolveMotionState({
      presenceStatus: 'online',
      ignitionOn: true,
      speedKph: 1.9,
      idleSinceMs,
      nowMs: NOW_MS,
      idleWatchMinutes: 10,
    });

    assert.equal(result.motionState, 'idle');
    assert.equal(result.idleSinceMs, idleSinceMs);
  });

  it('returns stopped for ignition off while online', () => {
    const result = resolveMotionState({
      presenceStatus: 'online',
      ignitionOn: false,
      speedKph: 0,
      idleSinceMs: NOW_MS - 30 * 60 * 1000,
      nowMs: NOW_MS,
      idleWatchMinutes: 10,
    });

    assert.equal(result.motionState, 'stopped');
  });

  it('returns offline regardless of ignition and speed when presence is offline', () => {
    const result = resolveMotionState({
      presenceStatus: 'offline',
      ignitionOn: true,
      speedKph: 80,
      idleSinceMs: NOW_MS - 30 * 60 * 1000,
      nowMs: NOW_MS,
      idleWatchMinutes: 10,
    });

    assert.equal(result.motionState, 'offline');
  });
});
