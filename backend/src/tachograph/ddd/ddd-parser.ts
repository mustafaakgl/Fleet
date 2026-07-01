import { Logger } from '@nestjs/common';

export type DddFileType = 'card' | 'vu' | 'unknown';
export type NormalizedTachoWorkState = 'driving' | 'rest' | 'work' | 'available';

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

export type ParsedDddResult = {
  ok: boolean;
  fileType: DddFileType;
  driverCardNo?: string;
  vehicleVin?: string;
  activities: ParsedDddActivity[];
  events: ParsedDddEvent[];
  dailyTotals: ParsedDddDailyTotal[];
  warnings: string[];
};

type ParsedTlv = {
  tag: number;
  length: number;
  value: Buffer;
  offset: number;
};

const logger = new Logger('DddParser');

const TAG_FILE_TYPE = 0x0001;
const TAG_DRIVER_CARD_NO = 0x1001;
const TAG_VEHICLE_VIN = 0x1002;
const TAG_ACTIVITY_CHANGES = 0x2001;
const TAG_DAILY_TOTALS = 0x3001;
const TAG_OVERSPEED_EVENTS = 0x4001;
const TAG_FAULT_EVENTS = 0x4002;

const ACTIVITY_RECORD_SIZE = 11;
const DAILY_TOTAL_RECORD_SIZE = 20;
const OVERSPEED_RECORD_SIZE = 12;
const FAULT_RECORD_SIZE = 12;

function normalizeState(raw: number): NormalizedTachoWorkState {
  switch (raw) {
    case 0:
      return 'rest';
    case 1:
      return 'available';
    case 2:
      return 'work';
    case 3:
      return 'driving';
    default:
      return 'work';
  }
}

function trimAscii(value: Buffer): string {
  return value.toString('ascii').replace(/\0/g, '').trim();
}

function findTrepStart(buffer: Buffer): number {
  if (buffer.subarray(0, 4).toString('ascii') === 'TREP') {
    return 4;
  }

  const idx = buffer.indexOf(Buffer.from('TREP', 'ascii'));
  return idx >= 0 ? idx + 4 : 0;
}

function parseTlvBlocks(buffer: Buffer): ParsedTlv[] {
  const tlvs: ParsedTlv[] = [];
  let offset = findTrepStart(buffer);

  while (offset + 4 <= buffer.length) {
    const tag = buffer.readUInt16BE(offset);
    const length = buffer.readUInt16BE(offset + 2);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;

    if (length < 0 || valueEnd > buffer.length) {
      break;
    }

    tlvs.push({
      tag,
      length,
      value: buffer.subarray(valueStart, valueEnd),
      offset,
    });

    offset = valueEnd;
  }

  return tlvs;
}

function parseActivityChanges(value: Buffer, warnings: string[]): ParsedDddActivity[] {
  if (value.length % ACTIVITY_RECORD_SIZE !== 0) {
    warnings.push('Activity block size mismatch; trailing bytes skipped.');
  }

  const activities: ParsedDddActivity[] = [];
  const chunks = Math.floor(value.length / ACTIVITY_RECORD_SIZE);

  for (let i = 0; i < chunks; i += 1) {
    const base = i * ACTIVITY_RECORD_SIZE;
    const ts = Number(value.readBigUInt64BE(base));
    const stateRaw = value.readUInt8(base + 8);
    const durationM = value.readUInt16BE(base + 9);

    if (!Number.isFinite(ts) || durationM <= 0) {
      continue;
    }

    activities.push({
      state: normalizeState(stateRaw),
      startedAt: new Date(ts).toISOString(),
      durationS: durationM * 60,
    });
  }

  return activities;
}

function parseDailyTotals(value: Buffer, warnings: string[]): ParsedDddDailyTotal[] {
  if (value.length % DAILY_TOTAL_RECORD_SIZE !== 0) {
    warnings.push('Daily totals block size mismatch; trailing bytes skipped.');
  }

  const rows: ParsedDddDailyTotal[] = [];
  const chunks = Math.floor(value.length / DAILY_TOTAL_RECORD_SIZE);

  for (let i = 0; i < chunks; i += 1) {
    const base = i * DAILY_TOTAL_RECORD_SIZE;
    const yyyymmdd = value.readUInt32BE(base);
    const dateStr = String(yyyymmdd);
    const year = Number(dateStr.slice(0, 4));
    const month = Number(dateStr.slice(4, 6));
    const day = Number(dateStr.slice(6, 8));

    if (!year || !month || !day) {
      continue;
    }

    rows.push({
      date: new Date(Date.UTC(year, month - 1, day)).toISOString(),
      drivingS: value.readUInt32BE(base + 4),
      restS: value.readUInt32BE(base + 8),
      workS: value.readUInt32BE(base + 12),
      availableS: value.readUInt32BE(base + 16),
    });
  }

  return rows;
}

function parseOverspeedEvents(value: Buffer, warnings: string[]): ParsedDddEvent[] {
  if (value.length % OVERSPEED_RECORD_SIZE !== 0) {
    warnings.push('Overspeed block size mismatch; trailing bytes skipped.');
  }

  const rows: ParsedDddEvent[] = [];
  const chunks = Math.floor(value.length / OVERSPEED_RECORD_SIZE);

  for (let i = 0; i < chunks; i += 1) {
    const base = i * OVERSPEED_RECORD_SIZE;
    const ts = Number(value.readBigUInt64BE(base));
    const speedKph = value.readUInt16BE(base + 8);
    const durationS = value.readUInt16BE(base + 10);

    rows.push({
      type: 'overspeed',
      occurredAt: new Date(ts).toISOString(),
      speedKph,
      durationS,
      severity: speedKph >= 100 ? 'critical' : 'medium',
    });
  }

  return rows;
}

function parseFaultEvents(value: Buffer, warnings: string[]): ParsedDddEvent[] {
  if (value.length % FAULT_RECORD_SIZE !== 0) {
    warnings.push('Event/fault block size mismatch; trailing bytes skipped.');
  }

  const rows: ParsedDddEvent[] = [];
  const chunks = Math.floor(value.length / FAULT_RECORD_SIZE);

  for (let i = 0; i < chunks; i += 1) {
    const base = i * FAULT_RECORD_SIZE;
    const ts = Number(value.readBigUInt64BE(base));
    const typeRaw = value.readUInt8(base + 8);
    const severityRaw = value.readUInt8(base + 9);
    const code = value.readUInt16BE(base + 10);

    rows.push({
      type: typeRaw === 1 ? 'fault' : 'event',
      occurredAt: new Date(ts).toISOString(),
      code: `0x${code.toString(16).toUpperCase().padStart(4, '0')}`,
      severity: severityRaw > 0 ? 'critical' : 'medium',
    });
  }

  return rows;
}

function detectFileType(tlvs: ParsedTlv[], buffer: Buffer): DddFileType {
  const typeTlv = tlvs.find((tlv) => tlv.tag === TAG_FILE_TYPE);
  if (typeTlv?.value.length) {
    const marker = typeTlv.value.readUInt8(0);
    if (marker === 1) return 'card';
    if (marker === 2) return 'vu';
  }

  const asAscii = buffer.toString('ascii');
  if (asAscii.includes('CARD')) return 'card';
  if (asAscii.includes('VU__')) return 'vu';

  return 'unknown';
}

export function parseDddBuffer(buffer: Buffer): ParsedDddResult {
  const warnings: string[] = [];

  if (!buffer || buffer.length < 12) {
    return {
      ok: false,
      fileType: 'unknown',
      activities: [],
      events: [],
      dailyTotals: [],
      warnings: ['File is too small to be a valid DDD payload.'],
    };
  }

  try {
    const tlvs = parseTlvBlocks(buffer);

    if (tlvs.length === 0) {
      return {
        ok: false,
        fileType: 'unknown',
        activities: [],
        events: [],
        dailyTotals: [],
        warnings: ['No TLV/TREP blocks found.'],
      };
    }

    const fileType = detectFileType(tlvs, buffer);

    const cardNo = trimAscii(tlvs.find((tlv) => tlv.tag === TAG_DRIVER_CARD_NO)?.value ?? Buffer.alloc(0));
    const vin = trimAscii(tlvs.find((tlv) => tlv.tag === TAG_VEHICLE_VIN)?.value ?? Buffer.alloc(0));

    const activities = tlvs
      .filter((tlv) => tlv.tag === TAG_ACTIVITY_CHANGES)
      .flatMap((tlv) => parseActivityChanges(tlv.value, warnings));

    const dailyTotals = tlvs
      .filter((tlv) => tlv.tag === TAG_DAILY_TOTALS)
      .flatMap((tlv) => parseDailyTotals(tlv.value, warnings));

    const overspeedEvents = tlvs
      .filter((tlv) => tlv.tag === TAG_OVERSPEED_EVENTS)
      .flatMap((tlv) => parseOverspeedEvents(tlv.value, warnings));

    const faultEvents = tlvs
      .filter((tlv) => tlv.tag === TAG_FAULT_EVENTS)
      .flatMap((tlv) => parseFaultEvents(tlv.value, warnings));

    if (!cardNo && fileType === 'card') {
      warnings.push('Driver card number could not be extracted.');
    }

    if (!vin && fileType === 'vu') {
      warnings.push('Vehicle VIN could not be extracted.');
    }

    return {
      ok: activities.length > 0 || dailyTotals.length > 0 || overspeedEvents.length > 0,
      fileType,
      driverCardNo: cardNo || undefined,
      vehicleVin: vin || undefined,
      activities,
      dailyTotals,
      events: [...overspeedEvents, ...faultEvents],
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`DDD parse failed: ${message}`);
    return {
      ok: false,
      fileType: 'unknown',
      activities: [],
      events: [],
      dailyTotals: [],
      warnings: [`Parser error: ${message}`],
    };
  }
}
