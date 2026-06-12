export const FLEET_FUEL_PERIOD_WEEKS = [4, 8, 12] as const;

export type FleetFuelPeriodWeeks = (typeof FLEET_FUEL_PERIOD_WEEKS)[number];

export function monthsAgoIso(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fleetFuelDateRange(weeks: number): { from: string; to: string } {
  return {
    from: monthsAgoIso(Math.ceil(weeks / 4)),
    to: todayIso(),
  };
}

export function formatWeekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split('-');
  if (!month || !day) return weekStart;
  return `${day}.${month}`;
}
