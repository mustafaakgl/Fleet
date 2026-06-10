import type { DefectSeverity, DefectStatus, VehicleCategory } from '@prisma/client';

export const DEPARTURE_CHECK_REMINDER_MINUTES = 30;
export const DEPARTURE_CHECK_ESCALATION_MINUTES = 60;
export const MAX_DEFECT_PHOTOS = 5;
export const VEHICLE_DEFECT_WARNING_CODE = 'VEHICLE_DEFECT_WARNING';
export const DEPARTURE_CHECK_REQUIRED_CODE = 'DEPARTURE_CHECK_REQUIRED';

export type DefaultChecklistItem = {
  itemKey: string;
  label: string;
  description?: string;
  requiresPhotoOnDefect?: boolean;
};

export const DEFAULT_CHECKLIST_ITEMS: DefaultChecklistItem[] = [
  { itemKey: 'tires', label: 'Reifen / Bereifung', description: 'Profil, Schäden, Druck sichtbar ok' },
  { itemKey: 'brakes', label: 'Bremsen', description: 'Funktion, Geräusche, Pedalweg' },
  { itemKey: 'lights', label: 'Beleuchtung', description: 'Alle Pflichtlichter inkl. Brems-/Blinklicht' },
  { itemKey: 'mirrors', label: 'Spiegel & Sicht', description: 'Innenspiegel, Außenspiegel, Scheiben' },
  { itemKey: 'load_security', label: 'Ladungssicherung', description: 'Zurrgurte, Verdeck, Gewichtsverteilung' },
  { itemKey: 'first_aid', label: 'Verbandkasten', description: 'Vorhanden und zugänglich' },
  { itemKey: 'warning_triangle_vest', label: 'Warndreieck & Warnweste', description: 'Vorhanden und erreichbar' },
];

export const DEFAULT_TEMPLATE_NAMES: Record<VehicleCategory, string> = {
  truck: 'Abfahrtskontrolle — LKW',
  transporter: 'Abfahrtskontrolle — Transporter',
  car: 'Abfahrtskontrolle — PKW',
  special: 'Abfahrtskontrolle — Sonderfahrzeug',
};

export const ALLOWED_DEFECT_TRANSITIONS: Record<DefectStatus, DefectStatus[]> = {
  offen: ['in_reparatur', 'behoben'],
  in_reparatur: ['behoben'],
  behoben: ['bestaetigt'],
  bestaetigt: [],
};

export function normalizeDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function todayDate(reference = new Date()): Date {
  return normalizeDate(reference);
}

export function dayRange(reference = new Date()): { start: Date; end: Date } {
  const start = todayDate(reference);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function parseWorkDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid work date');
  }
  return normalizeDate(date);
}

export function vehicleHasBlockingCriticalDefect(
  defects: Array<{ severity: DefectSeverity; status: DefectStatus }>,
): boolean {
  return defects.some(
    (defect) => defect.severity === 'kritisch' && defect.status !== 'bestaetigt',
  );
}

export function vehicleDefectWarningMessage(): string {
  return 'Kritische Mängel am Fahrzeug offen — Fahrzeug nicht einsetzbar. Bestätigung erforderlich.';
}

export function isValidDefectTransition(from: DefectStatus, to: DefectStatus): boolean {
  return ALLOWED_DEFECT_TRANSITIONS[from].includes(to);
}

export function minutesSince(date: Date, reference = new Date()): number {
  return Math.floor((reference.getTime() - date.getTime()) / 60_000);
}

export function parseTimeOnDate(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map((part) => Number(part));
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
