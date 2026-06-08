export const TIMELINE_START_HOUR = 6;
export const TIMELINE_END_HOUR = 22;
export const SLOT_MINUTES = 30;

export function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIso(iso: string, delta: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

export function timeFromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function snapMinutes(minutes: number, slot = SLOT_MINUTES): number {
  return Math.round(minutes / slot) * slot;
}

export function timelineRangeMinutes() {
  const start = TIMELINE_START_HOUR * 60;
  const end = TIMELINE_END_HOUR * 60;
  return { start, end, total: end - start };
}

export function positionPercent(startMinutes: number, endMinutes: number) {
  const { start, total } = timelineRangeMinutes();
  const left = ((startMinutes - start) / total) * 100;
  const width = ((endMinutes - startMinutes) / total) * 100;
  return {
    left: Math.max(0, Math.min(100, left)),
    width: Math.max(0, Math.min(100 - left, width)),
  };
}

export function minutesFromClientX(clientX: number, gridRect: DOMRect): number {
  const { start, total } = timelineRangeMinutes();
  const ratio = (clientX - gridRect.left) / Math.max(gridRect.width, 1);
  const raw = start + ratio * total;
  return snapMinutes(Math.max(start, Math.min(start + total, raw)));
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function formatTime12h(time: string): string {
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw) || 0;
  const period = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')}${period}`;
}

export function formatDateUs(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${month}/${day}/${year}`;
}

export function vehicleAbbreviation(brand?: string, model?: string, plate?: string): string {
  const source = brand?.trim() || model?.trim() || plate?.trim() || 'VEH';
  return source.slice(0, 3).toUpperCase();
}
