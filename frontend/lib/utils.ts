import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, differenceInDays } from 'date-fns';
import { RiskLevel, ReminderStatus } from './types';

export type DriverRiskScore = 'green' | 'yellow' | 'red';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | undefined | null): string {
  if (!date) return '—';
  try {
    return format(parseISO(date), 'dd.MM.yyyy');
  } catch {
    return date;
  }
}

export function daysUntil(date: string | undefined | null): number | null {
  if (!date) return null;
  try {
    return differenceInDays(parseISO(date), new Date());
  } catch {
    return null;
  }
}

export function expiryBadgeColor(date: string | undefined | null): string {
  const days = daysUntil(date);
  if (days === null) return 'bg-gray-100 text-gray-600';
  if (days < 0) return 'bg-red-100 text-red-700';
  if (days <= 30) return 'bg-red-100 text-red-700';
  if (days <= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

export function riskLevelColor(risk: RiskLevel): string {
  switch (risk) {
    case 'red':
      return 'bg-red-100 text-red-700';
    case 'yellow':
      return 'bg-yellow-100 text-yellow-700';
    case 'green':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export function getDriverRiskScore(accidentCount: number): DriverRiskScore {
  if (accidentCount >= 3) return 'red';
  if (accidentCount === 2) return 'yellow';
  return 'green';
}

export function getDriverRiskLabel(riskScore: DriverRiskScore): 'Niedrig' | 'Mittel' | 'Hoch' {
  if (riskScore === 'red') return 'Hoch';
  if (riskScore === 'yellow') return 'Mittel';
  return 'Niedrig';
}

export function getDriverRiskBadgeClass(riskScore: DriverRiskScore): string {
  if (riskScore === 'red') return 'border-red-200 bg-red-100 text-red-700';
  if (riskScore === 'yellow') return 'border-amber-200 bg-amber-100 text-amber-700';
  return 'border-emerald-200 bg-emerald-100 text-emerald-700';
}

export function formatAccidentCountLabel(accidentCount: number): string {
  if (accidentCount === 1) return '1 Unfall';
  return `${accidentCount} Unfälle`;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'completed':
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'inactive':
    case 'cancelled':
    case 'rejected':
      return 'bg-gray-100 text-gray-600';
    case 'on_leave':
    case 'in_progress':
    case 'planned':
    case 'pending':
      return 'bg-blue-100 text-blue-700';
    case 'sick':
    case 'broken':
    case 'maintenance':
      return 'bg-orange-100 text-orange-700';
    case 'terminated':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export function reminderStatusColor(status: ReminderStatus): string {
  return status === 'open' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
}

export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

/** Resolves API-relative asset paths (e.g. /uploads/...) to an absolute URL for img/Image src. */
export function resolveAssetUrl(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return fileUrl;
  }

  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
  try {
    const origin = new URL(base).origin;
    return `${origin}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
  } catch {
    return fileUrl;
  }
}
