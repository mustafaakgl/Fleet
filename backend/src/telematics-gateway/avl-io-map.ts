export type NormalizedTelemetryEvents = Array<{
  type: 'speeding' | 'harsh_accel' | 'harsh_brake' | 'harsh_corner' | 'crash';
  value: number;
  threshold?: number;
}>;

export type NormalizedTelemetryDtc = Array<{
  code: string;
  description?: string;
  severity: 'medium' | 'critical';
}>;

export type ParsedIoValue = number | bigint;

export type ParsedAvlIo = {
  eventId: number;
  totalCount: number;
  values: Map<number, ParsedIoValue>;
};

export const TELEMATICS_IO_MAP = {
  // TODO device-side verify (FOTA IO config): exact IDs and scaling vary by firmware/profile.
  // FMC130 usually provides subset via OBD adapter; FMC650 typically exposes richer FMS/CAN set.
  fields: {
    ignition: [239, 1],
    rpm: [32],
    fuelLevelPct: [86, 90],
    coolantTemp: [112],
    voltageMv: [66],
    odometerMeters: [16],
  },
  events: {
    overspeed: [255],
    harshAccel: [253],
    harshBrake: [254],
    harshCorner: [246],
  },
  dtc: {
    ids: [272, 385],
  },
  thresholds: {
    overspeedKph: 90,
    harshAccel: 3,
    harshBrake: 3,
    harshCorner: 2,
  },
} as const;

function firstIoValue(io: ParsedAvlIo, ids: readonly number[]): number | undefined {
  for (const id of ids) {
    const value = io.values.get(id);
    if (value === undefined) {
      continue;
    }

    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        return asNumber;
      }
      continue;
    }

    return value;
  }

  return undefined;
}

export function normalizeIoToTelemetry(io: ParsedAvlIo, speedKph: number): {
  ignition?: boolean;
  rpm?: number;
  fuelLevelPct?: number;
  coolantTemp?: number;
  voltage?: number;
  odometerKm?: number;
  events: NormalizedTelemetryEvents;
  dtc: NormalizedTelemetryDtc;
} {
  const ignitionRaw = firstIoValue(io, TELEMATICS_IO_MAP.fields.ignition);
  const rpmRaw = firstIoValue(io, TELEMATICS_IO_MAP.fields.rpm);
  const fuelRaw = firstIoValue(io, TELEMATICS_IO_MAP.fields.fuelLevelPct);
  const coolantRaw = firstIoValue(io, TELEMATICS_IO_MAP.fields.coolantTemp);
  const voltageMvRaw = firstIoValue(io, TELEMATICS_IO_MAP.fields.voltageMv);
  const odometerMetersRaw = firstIoValue(io, TELEMATICS_IO_MAP.fields.odometerMeters);

  const overspeedFlag = firstIoValue(io, TELEMATICS_IO_MAP.events.overspeed);
  const harshAccelFlag = firstIoValue(io, TELEMATICS_IO_MAP.events.harshAccel);
  const harshBrakeFlag = firstIoValue(io, TELEMATICS_IO_MAP.events.harshBrake);
  const harshCornerFlag = firstIoValue(io, TELEMATICS_IO_MAP.events.harshCorner);

  const dtcRaw = firstIoValue(io, TELEMATICS_IO_MAP.dtc.ids);

  const events: NormalizedTelemetryEvents = [];

  if ((overspeedFlag ?? 0) > 0 || speedKph > TELEMATICS_IO_MAP.thresholds.overspeedKph) {
    events.push({
      type: 'speeding',
      value: Number(speedKph.toFixed(2)),
      threshold: TELEMATICS_IO_MAP.thresholds.overspeedKph,
    });
  }

  if (harshAccelFlag !== undefined && harshAccelFlag > 0) {
    events.push({
      type: 'harsh_accel',
      value: harshAccelFlag,
      threshold: TELEMATICS_IO_MAP.thresholds.harshAccel,
    });
  }

  if (harshBrakeFlag !== undefined && harshBrakeFlag > 0) {
    events.push({
      type: 'harsh_brake',
      value: harshBrakeFlag,
      threshold: TELEMATICS_IO_MAP.thresholds.harshBrake,
    });
  }

  if (harshCornerFlag !== undefined && harshCornerFlag > 0) {
    events.push({
      type: 'harsh_corner',
      value: harshCornerFlag,
      threshold: TELEMATICS_IO_MAP.thresholds.harshCorner,
    });
  }

  const dtc: NormalizedTelemetryDtc = [];
  if (dtcRaw !== undefined && dtcRaw > 0) {
    dtc.push({
      code: `TELTONIKA-${dtcRaw.toString(16).toUpperCase()}`,
      description: 'DTC code from Teltonika IO element',
      severity: dtcRaw >= 0x8000 ? 'critical' : 'medium',
    });
  }

  const ignition = ignitionRaw === undefined ? undefined : ignitionRaw > 0;
  const rpm = rpmRaw === undefined ? undefined : Math.round(Math.max(0, rpmRaw));
  const fuelLevelPct =
    fuelRaw === undefined
      ? undefined
      : Number(Math.min(100, Math.max(0, fuelRaw)).toFixed(2));
  const coolantTemp =
    coolantRaw === undefined
      ? undefined
      : Number(coolantRaw.toFixed(1));

  const voltage =
    voltageMvRaw === undefined
      ? undefined
      : Number((voltageMvRaw >= 100 ? voltageMvRaw / 1000 : voltageMvRaw).toFixed(1));

  const odometerKm =
    odometerMetersRaw === undefined
      ? undefined
      : Number((odometerMetersRaw > 100_000 ? odometerMetersRaw / 1000 : odometerMetersRaw).toFixed(3));

  return {
    ignition,
    rpm,
    fuelLevelPct,
    coolantTemp,
    voltage,
    odometerKm,
    events,
    dtc,
  };
}
