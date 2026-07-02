import type { TachoActivityLike, TachoWorkStateLike } from './types';

const SECOND = 1000;

export function ms(iso: string): number {
  return Date.parse(iso);
}

export function hours(value: number): number {
  return Math.round(value * 3600);
}

export function minutes(value: number): number {
  return Math.round(value * 60);
}

export function seconds(value: number): number {
  return Math.round(value);
}

export function activity(
  workState: TachoWorkStateLike,
  startedAtIso: string,
  durationSeconds: number,
  id?: string,
): TachoActivityLike {
  const startedAtMs = ms(startedAtIso);
  return {
    id: id ?? `${workState}-${startedAtMs}`,
    startedAtMs,
    endedAtMs: startedAtMs + durationSeconds * SECOND,
    durationS: durationSeconds,
    workState,
  };
}

export function chain(...items: TachoActivityLike[]): TachoActivityLike[] {
  let cursor = items[0]?.startedAtMs ?? 0;
  const result: TachoActivityLike[] = [];

  for (const item of items) {
    const normalized = {
      ...item,
      startedAtMs: cursor,
      endedAtMs: cursor + item.durationS * SECOND,
    };
    result.push(normalized);
    cursor = normalized.endedAtMs;
  }

  return result;
}

export function fullRange(activities: TachoActivityLike[]) {
  const start = activities[0]?.startedAtMs ?? 0;
  const end = activities[activities.length - 1]?.endedAtMs ?? start + 1;
  return { fromMs: start, toMs: end + SECOND };
}
