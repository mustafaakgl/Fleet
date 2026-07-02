export type DddFileType = 'card' | 'vu' | 'unknown';
export type NormalizedTachoWorkState = 'driving' | 'rest' | 'work' | 'available';
export type DddGeneration = 1 | 2 | 'unknown';

export type ParsedDddActivity = {
  state: NormalizedTachoWorkState;
  startedAt: string;
  durationS: number;
};

export type ParsedDddEvent = {
  type: 'overspeed' | 'fault' | 'event';
  occurredAt: string;
  code?: string;
  speedKph?: number;
  durationS?: number;
  severity?: 'medium' | 'critical';
};

export type ParsedDddDailyTotal = {
  date: string;
  drivingS: number;
  restS: number;
  workS: number;
  availableS: number;
};

export type ParsedDddSignature = {
  checked: boolean;
  valid: boolean | null;
  details: string[];
};

export type ParsedDddResult = {
  ok: boolean;
  fileType: DddFileType;
  generation: DddGeneration;
  driverCardNo?: string;
  vehicleVin?: string;
  activities: ParsedDddActivity[];
  events: ParsedDddEvent[];
  dailyTotals: ParsedDddDailyTotal[];
  warnings: string[];
  signature: ParsedDddSignature;
  skippedBlocks: string[];
};

export function emptyParsedDddResult(warnings: string[]): ParsedDddResult {
  return {
    ok: false,
    fileType: 'unknown',
    generation: 'unknown',
    activities: [],
    events: [],
    dailyTotals: [],
    warnings,
    signature: { checked: false, valid: null, details: [] },
    skippedBlocks: [],
  };
}
