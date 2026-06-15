import type { DriverLicense, LicenseCheck, LicenseCheckStatus } from '@prisma/client';

export const LICENSE_CLASSES = [
  'AM',
  'A1',
  'A2',
  'A',
  'B',
  'BE',
  'C1',
  'C1E',
  'C',
  'CE',
  'D1',
  'D1E',
  'D',
  'DE',
  'L',
  'T',
] as const;

export type LicenseComplianceBadge = 'green' | 'yellow' | 'red';

export const PERIODIC_CHECK_INTERVAL_MONTHS = 6;
export const CHECK_WARNING_DAYS = 14;
export const CHECK_REMINDER_DAYS = 3;
export const CHECK_ESCALATION_DAYS = 7;
/** License expiry windows — handled by RemindersService (driver.licenseExpiryDate). */
export const LICENSE_EXPIRY_NOTIFY_DAYS = [90, 60, 30, 7] as const;

export type LicenseComplianceInput = {
  license: Pick<DriverLicense, 'expiresAt' | 'nextCheckDueAt' | 'deletedAt'> | null;
  latestCheck: Pick<LicenseCheck, 'status' | 'checkDate' | 'verifiedAt'> | null;
  hasPendingCheck: boolean;
  referenceDate?: Date;
};

export function normalizeDate(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function diffInDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((normalizeDate(to).getTime() - normalizeDate(from).getTime()) / msPerDay);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return normalizeDate(result);
}

export function computeComplianceBadge(input: LicenseComplianceInput): LicenseComplianceBadge {
  const today = normalizeDate(input.referenceDate ?? new Date());

  if (!input.license || input.license.deletedAt) {
    return 'red';
  }

  const expiresAt = normalizeDate(input.license.expiresAt);
  if (expiresAt < today) {
    return 'red';
  }

  if (input.latestCheck?.status === 'rejected') {
    return 'red';
  }

  if (input.hasPendingCheck) {
    return 'yellow';
  }

  const nextCheckDue = input.license.nextCheckDueAt
    ? normalizeDate(input.license.nextCheckDueAt)
    : null;

  if (nextCheckDue && nextCheckDue <= today) {
    return 'red';
  }

  if (nextCheckDue) {
    const daysUntilCheck = diffInDays(today, nextCheckDue);
    if (daysUntilCheck <= CHECK_WARNING_DAYS) {
      return 'yellow';
    }
  }

  const daysUntilExpiry = diffInDays(today, expiresAt);
  if (daysUntilExpiry <= CHECK_WARNING_DAYS) {
    return 'yellow';
  }

  if (!input.latestCheck || input.latestCheck.status !== 'approved') {
    return 'red';
  }

  return 'green';
}

export function complianceBlocksAssignment(badge: LicenseComplianceBadge): boolean {
  return badge === 'red';
}

export function complianceWarningMessage(badge: LicenseComplianceBadge, locale = 'de'): string | null {
  if (badge !== 'red') return null;
  if (locale === 'tr') {
    return 'Sürücünün dijital ehliyet kontrolü geçersiz veya süresi dolmuş (Halterhaftung). Atamaya devam etmek istiyor musunuz?';
  }
  if (locale === 'en') {
    return 'Driver license compliance is invalid or overdue (Halterhaftung). Continue with assignment anyway?';
  }
  return 'Digitale Führerscheinkontrolle ungültig oder überfällig (Halterhaftung). Trotzdem zuweisen?';
}

export function parseLicenseClasses(value: string[] | string | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(/[,;\s]+/);
  const normalized = raw
    .map((item) => item.trim().toUpperCase())
    .filter((item) => LICENSE_CLASSES.includes(item as (typeof LICENSE_CLASSES)[number]));
  return Array.from(new Set(normalized));
}

export function isTerminalCheckStatus(status: LicenseCheckStatus): boolean {
  return status === 'approved' || status === 'rejected';
}
