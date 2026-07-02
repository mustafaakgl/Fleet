/**
 * UTC-only time helpers. Do not use local timezone — DST would produce 23/25h days.
 * All tachograph rule evaluation uses epoch milliseconds in UTC.
 */

/** ISO week key `YYYY-Www` (week starts Monday 00:00 UTC). */
export function isoWeekKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const week = getIsoWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getIsoWeekNumber(date: Date): number {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Monday 00:00 UTC of the ISO week containing `ms`. */
export function isoWeekStartMs(ms: number): number {
  const date = new Date(ms);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + diffToMonday,
    0,
    0,
    0,
    0,
  );
}

export function addMs(ms: number, deltaMs: number): number {
  return ms + deltaMs;
}

export function addSecondsMs(ms: number, seconds: number): number {
  return ms + seconds * 1000;
}

export function overlapsRange(
  startMs: number,
  endMs: number,
  range: { fromMs: number; toMs: number },
): boolean {
  return endMs > range.fromMs && startMs < range.toMs;
}
