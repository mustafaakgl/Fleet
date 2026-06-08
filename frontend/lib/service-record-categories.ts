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
