import type { FineStatus } from '@prisma/client';

export const DEFAULT_MATCH_TOLERANCE_MINUTES = 30;
export const PAYMENT_REMINDER_DAYS = [7, 3, 1] as const;
export const DRIVER_ACK_ESCALATION_HOURS = 48;

export const ALLOWED_FINE_TRANSITIONS: Record<FineStatus, FineStatus[]> = {
  neu: ['fahrer_zugeordnet', 'abgeschlossen'],
  fahrer_zugeordnet: ['fahrer_benachrichtigt', 'abgeschlossen'],
  fahrer_benachrichtigt: ['bezahlt', 'widerspruch', 'abgeschlossen'],
  bezahlt: ['abgeschlossen'],
  widerspruch: ['bezahlt', 'abgeschlossen'],
  abgeschlossen: [],
};

export const TERMINAL_FINE_STATUSES: FineStatus[] = ['bezahlt', 'widerspruch', 'abgeschlossen'];

export function normalizeDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dayRange(reference: Date): { start: Date; end: Date } {
  const start = normalizeDate(reference);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function parseTimeOnDate(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map((part) => Number(part));
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function isValidFineTransition(from: FineStatus, to: FineStatus): boolean {
  return ALLOWED_FINE_TRANSITIONS[from].includes(to);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function hoursSince(date: Date, reference = new Date()): number {
  return (reference.getTime() - date.getTime()) / 3_600_000;
}

export function daysUntilDate(target: Date, reference = new Date()): number {
  const start = normalizeDate(reference);
  const end = normalizeDate(target);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
