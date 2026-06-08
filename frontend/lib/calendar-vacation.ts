import type { FleetRequest } from '@/context/FleetDataContext';

export const DEFAULT_VACATION_ENTITLEMENT = 24;

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function enumerateDatesInclusive(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function datesInYear(year: number, from: string, to: string): string[] {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const start = from > yearStart ? from : yearStart;
  const end = to < yearEnd ? to : yearEnd;
  if (start > end) return [];
  return enumerateDatesInclusive(start, end);
}

const PENDING_REQUEST_STATUSES = new Set(['Pending', 'Needs Review']);

export function buildPendingVacationDateSet(
  requests: FleetRequest[],
  driverId: string,
  year: number,
): Set<string> {
  const dates = new Set<string>();
  for (const request of requests) {
    if (request.driverId !== driverId) continue;
    if (request.type !== 'Urlaub beantragen') continue;
    if (!PENDING_REQUEST_STATUSES.has(request.status)) continue;
    if (!request.dateFrom) continue;
    const dateTo = request.dateTo ?? request.dateFrom;
    for (const date of datesInYear(year, request.dateFrom, dateTo)) {
      dates.add(date);
    }
  }
  return dates;
}

export function countPendingVacationDays(
  requests: FleetRequest[],
  driverId: string,
  year: number,
): number {
  return buildPendingVacationDateSet(requests, driverId, year).size;
}

export function buildYearOptions(referenceDate = new Date()): number[] {
  const current = referenceDate.getFullYear();
  return [current - 1, current, current + 1];
}

export function clampYearOption(year: number, referenceDate = new Date()): number {
  const options = buildYearOptions(referenceDate);
  if (options.includes(year)) return year;
  return referenceDate.getFullYear();
}
