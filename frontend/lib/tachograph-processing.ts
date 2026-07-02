export type ProcessingTimeInput = {
  occurredAt: string;
  acknowledgedAt: string | null;
};

const MIN_SAMPLES = 5;

/** Average days between occurrence and acknowledgement; null if fewer than 5 closed records. */
export function computeAvgProcessingDays(items: ProcessingTimeInput[]): number | null {
  const closed = items.filter((row) => row.acknowledgedAt);
  if (closed.length < MIN_SAMPLES) {
    return null;
  }

  const totalDays = closed.reduce((sum, row) => {
    const start = new Date(row.occurredAt).getTime();
    const end = new Date(row.acknowledgedAt!).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return sum;
    return sum + Math.max(0, (end - start) / (24 * 3600 * 1000));
  }, 0);

  return Math.round(totalDays / closed.length);
}
