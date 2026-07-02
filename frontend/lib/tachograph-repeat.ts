export type RepeatCountInfringement = {
  id: string;
  driverId: string | null;
  type: string;
  occurredAt: string;
  driver?: { id: string; firstName: string; lastName: string } | null;
};

export type RepeatOffenderRow = {
  driverId: string;
  driverName: string;
  type: string;
  count: number;
};

const WINDOW_MS = 90 * 24 * 3600 * 1000;

function repeatKey(driverId: string, type: string): string {
  return `${driverId}:${type}`;
}

/** Count infringements per (driverId, type) within the last 90 days. */
export function computeRepeatCounts(
  infringements: RepeatCountInfringement[],
  nowMs = Date.now(),
): Map<string, number> {
  const cutoff = nowMs - WINDOW_MS;
  const counts = new Map<string, number>();

  for (const row of infringements) {
    if (!row.driverId) continue;
    const occurredMs = new Date(row.occurredAt).getTime();
    if (Number.isNaN(occurredMs) || occurredMs < cutoff) continue;
    const key = repeatKey(row.driverId, row.type);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

export function getRepeatCount(
  counts: Map<string, number>,
  driverId: string | null | undefined,
  type: string,
): number {
  if (!driverId) return 0;
  return counts.get(repeatKey(driverId, type)) ?? 0;
}

/** Top repeat offenders (driver + type pairs with count ≥ minCount), sorted by count desc. */
export function topRepeatOffenders(
  infringements: RepeatCountInfringement[],
  options?: { limit?: number; minCount?: number; nowMs?: number },
): RepeatOffenderRow[] {
  const limit = options?.limit ?? 3;
  const minCount = options?.minCount ?? 2;
  const counts = computeRepeatCounts(infringements, options?.nowMs);

  const driverNames = new Map<string, string>();
  for (const row of infringements) {
    if (row.driverId && row.driver) {
      driverNames.set(row.driverId, `${row.driver.firstName} ${row.driver.lastName}`);
    }
  }

  const rows: RepeatOffenderRow[] = [];
  for (const [key, count] of counts.entries()) {
    if (count < minCount) continue;
    const [driverId, type] = key.split(':');
    rows.push({
      driverId,
      driverName: driverNames.get(driverId) ?? driverId,
      type,
      count,
    });
  }

  return rows.sort((a, b) => b.count - a.count).slice(0, limit);
}

export function infringementAgeDays(occurredAt: string, nowMs = Date.now()): number {
  const occurredMs = new Date(occurredAt).getTime();
  if (Number.isNaN(occurredMs)) return 0;
  return Math.max(0, Math.floor((nowMs - occurredMs) / (24 * 3600 * 1000)));
}
