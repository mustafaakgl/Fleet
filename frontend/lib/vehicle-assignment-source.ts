/** Stable marker appended to assignment notes created from the vehicle timeline. */
export const VEHICLE_TIMELINE_NOTE_MARKER = '[fleet:vehicle_timeline]';

export function buildVehicleTimelineNotes(userNotes: string, fallback: string): string {
  const base = userNotes.trim() || fallback;
  if (base.includes(VEHICLE_TIMELINE_NOTE_MARKER)) return base;
  return `${base} ${VEHICLE_TIMELINE_NOTE_MARKER}`.trim();
}

export function isVehicleTimelineAssignment(notes?: string | null): boolean {
  return !!notes?.includes(VEHICLE_TIMELINE_NOTE_MARKER);
}
