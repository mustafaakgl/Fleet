export function getTripPurposeLockAt(endedAt: Date): Date {
  return new Date(endedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function isTripPurposeLocked(endedAt: Date, now = new Date()): boolean {
  return now.getTime() > getTripPurposeLockAt(endedAt).getTime();
}

export function formatTripPurposeLockAt(endedAt: Date): Date {
  return getTripPurposeLockAt(endedAt);
}
