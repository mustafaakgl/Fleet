export const CONNECTION_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export function connectionBackoffDelay(attempt: number): number {
  const index = Math.min(attempt, CONNECTION_BACKOFF_MS.length - 1);
  return CONNECTION_BACKOFF_MS[index];
}
