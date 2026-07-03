import type { TrackingPresenceStatus } from './tracking.types';

export type MotionState = 'moving' | 'idle' | 'stopped' | 'offline';

export type ResolveMotionStateInput = {
  presenceStatus: TrackingPresenceStatus;
  ignitionOn: boolean | null;
  speedKph: number | null;
  idleSinceMs: number | null;
  nowMs: number;
  idleWatchMinutes: number;
};

export function resolveMotionState(input: ResolveMotionStateInput): {
  motionState: MotionState;
  idleSinceMs?: number;
} {
  if (input.presenceStatus === 'offline') {
    return { motionState: 'offline' };
  }

  if (input.ignitionOn === false) {
    return { motionState: 'stopped' };
  }

  const speedKph = input.speedKph ?? 0;
  if (input.ignitionOn === true && speedKph >= 2) {
    return { motionState: 'moving' };
  }

  if (input.ignitionOn === true && speedKph < 2) {
    const idleWatchMs = input.idleWatchMinutes * 60 * 1000;
    if (input.idleSinceMs !== null && input.nowMs - input.idleSinceMs >= idleWatchMs) {
      return { motionState: 'idle', idleSinceMs: input.idleSinceMs };
    }
    return { motionState: 'moving' };
  }

  return speedKph >= 2 ? { motionState: 'moving' } : { motionState: 'stopped' };
}
