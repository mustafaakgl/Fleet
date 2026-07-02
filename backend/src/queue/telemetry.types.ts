export type TelemetryRecordPayload = {
  timestampMs: number;
  priority: number;
  latitude: number;
  longitude: number;
  speedKph: number;
  angleDeg: number;
  ignition?: boolean;
  rpm?: number;
  fuelLevelPct?: number;
  coolantTemp?: number;
  voltage?: number;
  odometerKm?: number;
  dtcPresent: boolean;
  dtc: Array<{ code: string; description?: string; severity: 'medium' | 'critical' }>;
  events: Array<{
    type: 'speeding' | 'harsh_accel' | 'harsh_brake' | 'harsh_corner' | 'crash';
    value: number;
    threshold?: number;
  }>;
};

export type TelemetryIngestJobPayload = {
  tenantId: string;
  vehicleId: string;
  imei: string;
  records: TelemetryRecordPayload[];
};

export type TelemetryQuarantineJobPayload = {
  tenantId?: string;
  imei?: string;
  rawHex: string;
  error: string;
};
