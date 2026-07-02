/** Human-readable duration: "9 h 42 min" (no decimal hours). */
export function formatDurationS(totalS: number): string {
  const rounded = Math.round(totalS);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} min`);
  }
  if (parts.length === 0) {
    parts.push(`${seconds} s`);
  }
  return parts.join(' ');
}

export function parseInfringementEvidence(notes: string | null | undefined): Record<string, unknown> | null {
  if (!notes) {
    return null;
  }
  try {
    const parsed = JSON.parse(notes) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
