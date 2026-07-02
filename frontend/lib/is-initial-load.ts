/** Show skeleton only on first load — keep stale data visible during refetch/polling. */
export function isInitialLoad(isLoading: boolean, hasData: boolean): boolean {
  return isLoading && !hasData;
}
