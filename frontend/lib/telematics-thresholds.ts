/** Client mirror of backend telematics-thresholds idle fuel constants. */
export const TELEMATICS_THRESHOLDS = {
  idleWatchMinutes: 10,
  idleFuelLitersPerHourTruck: 3.0,
  idleFuelLitersPerHourVan: 1.0,
  defaultFuelEurPerLiter: 1.75,
  /** Fleet blend when per-driver vehicle category is unavailable (mock-fleet ratio). */
  idleFuelLitersPerHourBlend: 0.7 * 3.0 + 0.3 * 1.0,
  mapSpeedGreenMaxKph: 50,
  mapSpeedAmberMaxKph: 80,
  speedingKph: 90,
} as const;

export function estimateIdleFuelCostEur(totalIdleMinPerDay: number, periodDays = 28): number {
  const idleHours = (totalIdleMinPerDay * periodDays) / 60;
  return idleHours * TELEMATICS_THRESHOLDS.idleFuelLitersPerHourBlend * TELEMATICS_THRESHOLDS.defaultFuelEurPerLiter;
}
