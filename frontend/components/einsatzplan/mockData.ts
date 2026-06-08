function toDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export const TODAY = toDateString(0);
export const TOMORROW = toDateString(1);

export const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => 6 + i);
