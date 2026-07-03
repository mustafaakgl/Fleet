/** Central telematics alarm and trip thresholds (override via env in tests). */
export const TELEMATICS_THRESHOLDS = {
  ignitionOffDebounceMs: Number(process.env.TELEMATICS_IGNITION_OFF_DEBOUNCE_MS ?? 5 * 60 * 1000),
  speedingKph: Number(process.env.TELEMATICS_SPEEDING_KPH ?? 90),
  harshAccelDeltaKph: Number(process.env.TELEMATICS_HARSH_ACCEL_KPH ?? 12),
  harshBrakeDeltaKph: Number(process.env.TELEMATICS_HARSH_BRAKE_KPH ?? 12),
  idleSpeedKph: 2,
  idleWatchMinutes: 10,
  coolantHighC: Number(process.env.TELEMATICS_COOLANT_HIGH_C ?? 105),
  voltageLowV: Number(process.env.TELEMATICS_VOLTAGE_LOW_V ?? 11.8),
  fuelTheftDropPct: Number(process.env.TELEMATICS_FUEL_THEFT_DROP_PCT ?? 15),
  fuelTheftWindowMs: Number(process.env.TELEMATICS_FUEL_THEFT_WINDOW_MS ?? 10 * 60 * 1000),
  alarmSuppressionMs: Number(process.env.TELEMATICS_ALARM_SUPPRESSION_MS ?? 4 * 60 * 60 * 1000),
  deviceSilentMs: Number(process.env.TELEMATICS_DEVICE_SILENT_MS ?? 30 * 60 * 1000),
  watchdogIntervalMs: Number(process.env.TELEMATICS_WATCHDOG_INTERVAL_MS ?? 5 * 60 * 1000),
  /** Idle fuel burn (litres per hour) for cost estimates — truck vs van. */
  idleFuelLitersPerHourTruck: 3.0,
  idleFuelLitersPerHourVan: 1.0,
  defaultFuelEurPerLiter: 1.75,
} as const;
