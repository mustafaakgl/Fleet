export function driverTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
