export function driverTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type DriverPortalStatusDomain =
  | 'assignment'
  | 'driver'
  | 'equipmentIssuance'
  | 'request'
  | 'document'
  | 'incident';

const STATUS_TRANSLATION_KEYS: Record<DriverPortalStatusDomain, Record<string, string>> = {
  assignment: {
    planned: 'driverPortal.status.assignment.planned',
    confirmed: 'driverPortal.status.assignment.confirmed',
    in_progress: 'driverPortal.status.assignment.inProgress',
    completed: 'driverPortal.status.assignment.completed',
    cancelled: 'driverPortal.status.assignment.cancelled',
  },
  driver: {
    active: 'driverPortal.status.driver.active',
    inactive: 'driverPortal.status.driver.inactive',
    on_leave: 'driverPortal.status.driver.onLeave',
    sick: 'driverPortal.status.driver.sick',
    terminated: 'driverPortal.status.driver.terminated',
  },
  equipmentIssuance: {
    pending_signature: 'driverPortal.status.equipmentIssuance.pendingSignature',
    signed: 'driverPortal.status.equipmentIssuance.signed',
    manual_uploaded: 'driverPortal.status.equipmentIssuance.manualUploaded',
    approved: 'driverPortal.status.equipmentIssuance.approved',
    cancelled: 'driverPortal.status.equipmentIssuance.cancelled',
  },
  request: {
    pending: 'driverPortal.status.request.pending',
    approved: 'driverPortal.status.request.approved',
    rejected: 'driverPortal.status.request.rejected',
    cancelled: 'driverPortal.status.request.cancelled',
    needs_review: 'driverPortal.status.request.needsReview',
  },
  document: {
    valid: 'driverPortal.status.document.valid',
    expiring_soon: 'driverPortal.status.document.expiringSoon',
    expired: 'driverPortal.status.document.expired',
    missing: 'driverPortal.status.document.missing',
    archived: 'driverPortal.status.document.archived',
  },
  incident: {
    pending: 'driverPortal.status.incident.pending',
    under_review: 'driverPortal.status.incident.underReview',
    approved: 'driverPortal.status.incident.approved',
    rejected: 'driverPortal.status.incident.rejected',
    closed: 'driverPortal.status.incident.closed',
  },
};

export function translateStatus(domain: DriverPortalStatusDomain, value: string): string {
  return STATUS_TRANSLATION_KEYS[domain][value] ?? `driverPortal.status.${domain}.${value}`;
}

export function driverAssignmentStatusClass(status: string): string {
  if (status === 'in_progress') return 'bg-emerald-50 text-emerald-700';
  if (status === 'confirmed') return 'bg-blue-50 text-blue-700';
  if (status === 'completed') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

export const DRIVER_REQUEST_TYPES = [
  'vacation',
  'sick_leave',
  'training',
  'business_trip',
  'doctor_appointment',
  'special_leave',
  'overtime_compensation',
  'free_day',
  'other',
] as const;

export const DRIVER_MESSENGER_LANGUAGES = [
  { code: 'pl', label: 'Polski' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
] as const;

export const HANDOVER_PHOTO_SLOTS = [
  'front',
  'right',
  'left',
  'rear',
  'tail_lift',
  'interior',
] as const;
