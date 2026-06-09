export type RepairPriorityClass = 'scheduled' | 'non_scheduled' | 'emergency' | 'none';

export const REPAIR_PRIORITY_OPTIONS: RepairPriorityClass[] = [
  'scheduled',
  'non_scheduled',
  'emergency',
  'none',
];

const EMERGENCY_KEYWORDS = [
  'emergency',
  'breakdown',
  'notfall',
  'panne',
  'urgent',
  'dringend',
  'unfall',
  'defekt',
  'ausfall',
];

const ROUTINE_KEYWORDS = [
  'routine',
  'periodic',
  'maintenance',
  'inspection',
  'tüv',
  'tuv',
  'oil change',
  'scheduled',
  'wartung',
  'inspektion',
];

function readNotesField(notes: string | undefined, key: string): string | null {
  if (!notes?.trim()) return null;
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'im');
  const match = notes.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function getRepairPriorityClass(
  serviceType: string,
  notes?: string,
): RepairPriorityClass {
  const fromNotes = readNotesField(notes, 'Priority') as RepairPriorityClass | null;
  if (fromNotes && REPAIR_PRIORITY_OPTIONS.includes(fromNotes)) {
    return fromNotes;
  }

  const normalized = serviceType.trim().toLowerCase();
  if (!normalized) return 'none';
  if (EMERGENCY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'emergency';
  }
  if (isRoutineServiceType(serviceType)) return 'scheduled';
  return 'non_scheduled';
}

export function isRoutineServiceType(serviceType: string): boolean {
  const normalized = serviceType.trim().toLowerCase();
  if (!normalized) return false;
  return ROUTINE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function matchesServiceCategory(
  serviceType: string,
  category: 'routine' | 'other',
): boolean {
  const routine = isRoutineServiceType(serviceType);
  return category === 'routine' ? routine : !routine;
}

export function monthRangeFromKey(monthKey: string): { from: string; to: string } | null {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return null;
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  const toIso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: toIso(from), to: toIso(to) };
}
