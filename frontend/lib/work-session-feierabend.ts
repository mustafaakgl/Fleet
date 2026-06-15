const FEIERABEND_DATE_KEY = 'driver_feierabend_date';

function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFeierabendPausedToday(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(FEIERABEND_DATE_KEY) === localTodayIso();
}

export function markFeierabendToday(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(FEIERABEND_DATE_KEY, localTodayIso());
}

export function clearFeierabendPause(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(FEIERABEND_DATE_KEY);
}
