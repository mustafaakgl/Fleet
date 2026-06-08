'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  getWatchedExpenseIds,
  setExpenseWatched,
  subscribeExpenseWatchlist,
  toggleExpenseWatch,
} from '@/lib/expense-watchlist';

const SERVER_SNAPSHOT: string[] = [];

export function useExpenseWatchlist() {
  const watchedIds = useSyncExternalStore(
    subscribeExpenseWatchlist,
    getWatchedExpenseIds,
    () => SERVER_SNAPSHOT,
  );

  const isWatched = useCallback((id: string) => watchedIds.includes(id), [watchedIds]);

  const toggleWatch = useCallback((id: string) => toggleExpenseWatch(id), []);

  const watch = useCallback((id: string) => setExpenseWatched(id, true), []);

  const unwatch = useCallback((id: string) => setExpenseWatched(id, false), []);

  return { watchedIds, isWatched, toggleWatch, watch, unwatch };
}
