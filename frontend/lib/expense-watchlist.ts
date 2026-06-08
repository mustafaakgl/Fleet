const STORAGE_KEY = 'fleet:expense-watchlist';
export const EXPENSE_WATCHLIST_EVENT = 'fleet:expense-watchlist-changed';

const EMPTY_WATCHLIST: string[] = [];
let cachedSnapshot: string[] = EMPTY_WATCHLIST;
let cachedSerialized = '[]';

function parseIds(raw: string | null): string[] {
  if (!raw) return EMPTY_WATCHLIST;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_WATCHLIST;
    const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return ids.length === 0 ? EMPTY_WATCHLIST : ids;
  } catch {
    return EMPTY_WATCHLIST;
  }
}

function setCachedSnapshot(ids: string[]) {
  cachedSnapshot = ids.length === 0 ? EMPTY_WATCHLIST : ids;
  cachedSerialized = JSON.stringify(cachedSnapshot);
}

function readIdsFromStorage(): string[] {
  if (typeof window === 'undefined') return EMPTY_WATCHLIST;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  const serialized = raw ?? '[]';
  if (serialized === cachedSerialized) {
    return cachedSnapshot;
  }

  const ids = parseIds(raw);
  cachedSerialized = serialized;
  cachedSnapshot = ids;
  return cachedSnapshot;
}

function writeIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    setCachedSnapshot(ids);
    window.localStorage.setItem(STORAGE_KEY, cachedSerialized);
    window.dispatchEvent(new CustomEvent(EXPENSE_WATCHLIST_EVENT));
  } catch {
    // ignore storage errors
  }
}

/** Stable snapshot for useSyncExternalStore — same reference until data changes. */
export function getWatchedExpenseIds(): string[] {
  return readIdsFromStorage();
}

export function isExpenseWatched(id: string): boolean {
  return readIdsFromStorage().includes(id);
}

export function setExpenseWatched(id: string, watched: boolean): void {
  const current = readIdsFromStorage();
  let next: string[];

  if (watched) {
    if (current.includes(id)) return;
    next = [id, ...current];
  } else {
    if (!current.includes(id)) return;
    next = current.filter((item) => item !== id);
  }

  writeIds(next.length === 0 ? EMPTY_WATCHLIST : next);
}

export function toggleExpenseWatch(id: string): boolean {
  const watched = !isExpenseWatched(id);
  setExpenseWatched(id, watched);
  return watched;
}

export function subscribeExpenseWatchlist(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EXPENSE_WATCHLIST_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(EXPENSE_WATCHLIST_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}
