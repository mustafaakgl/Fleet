import {
  ACTIVITY_AVAILABLE,
  ACTIVITY_DRIVING,
  ACTIVITY_MASK,
  ACTIVITY_REST,
  ACTIVITY_SHIFT,
  ACTIVITY_WORK,
  CARD_INSERTED_MASK,
  CREW_MASK,
  MINUTES_MASK,
  MINUTES_PER_DAY,
  SLOT_MASK,
} from './constants';
import type { NormalizedTachoWorkState, ParsedDddActivity } from '../parser-types';
import { timeRealToIso } from './time-real';

export type ActivityChangeInfo = {
  slot: boolean;
  crew: boolean;
  cardInserted: boolean;
  activity: number;
  minutes: number;
};

export function decodeActivityChangeInfo(raw: number): ActivityChangeInfo {
  return {
    slot: (raw & SLOT_MASK) !== 0,
    crew: (raw & CREW_MASK) !== 0,
    cardInserted: (raw & CARD_INSERTED_MASK) !== 0,
    activity: (raw & ACTIVITY_MASK) >> ACTIVITY_SHIFT,
    minutes: raw & MINUTES_MASK,
  };
}

export function encodeActivityChangeInfo(info: ActivityChangeInfo): number {
  let raw = info.minutes & MINUTES_MASK;
  if (info.activity & ~0x03) {
    throw new RangeError(`activity must be 0..3, got ${info.activity}`);
  }
  raw |= (info.activity & 0x03) << ACTIVITY_SHIFT;
  if (info.cardInserted) raw |= CARD_INSERTED_MASK;
  if (info.crew) raw |= CREW_MASK;
  if (info.slot) raw |= SLOT_MASK;
  return raw;
}

export function activityCodeToState(activity: number): NormalizedTachoWorkState {
  switch (activity) {
    case ACTIVITY_REST:
      return 'rest';
    case ACTIVITY_AVAILABLE:
      return 'available';
    case ACTIVITY_WORK:
      return 'work';
    case ACTIVITY_DRIVING:
      return 'driving';
    default:
      return 'work';
  }
}

export type DailyActivityRecord = {
  previousRecordLength: number;
  recordLength: number;
  recordDateEpoch: number;
  dayDistance: number;
  changes: ActivityChangeInfo[];
};

function readRingSlice(ringBuffer: Buffer, offset: number, length: number): Buffer {
  if (offset + length <= ringBuffer.length) {
    return ringBuffer.subarray(offset, offset + length);
  }

  const out = Buffer.alloc(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = ringBuffer[(offset + i) % ringBuffer.length];
  }
  return out;
}

export function parseDailyActivityRecord(ringBuffer: Buffer, offset: number): DailyActivityRecord {
  const header = readRingSlice(ringBuffer, offset, 10);
  if (header.length < 10) {
    throw new RangeError(`Daily activity record header out of range at offset ${offset}`);
  }

  const previousRecordLength = header.readUInt16BE(0);
  const recordLength = header.readUInt16BE(2);
  const recordDateEpoch = header.readUInt32BE(4);
  const dayDistance = header.readUInt16BE(8);

  if (recordLength < 10) {
    throw new RangeError(`Daily activity record length ${recordLength} is too small at offset ${offset}`);
  }

  const body = readRingSlice(ringBuffer, offset, recordLength);
  const changes: ActivityChangeInfo[] = [];
  for (let i = 10; i + 1 < body.length; i += 2) {
    const raw = body.readUInt16BE(i);
    changes.push(decodeActivityChangeInfo(raw));
  }

  return {
    previousRecordLength,
    recordLength,
    recordDateEpoch,
    dayDistance,
    changes,
  };
}

export function encodeDailyActivityRecord(record: DailyActivityRecord): Buffer {
  const body = Buffer.alloc(10 + record.changes.length * 2);
  body.writeUInt16BE(record.previousRecordLength, 0);
  body.writeUInt16BE(record.recordLength, 2);
  body.writeUInt32BE(record.recordDateEpoch, 4);
  body.writeUInt16BE(record.dayDistance, 8);

  record.changes.forEach((change, index) => {
    body.writeUInt16BE(encodeActivityChangeInfo(change), 10 + index * 2);
  });

  return body;
}

/**
 * Walk the activityDailyRecords ring buffer from oldest to newest pointer.
 * Pointers are byte offsets into the ring; records are variable-length.
 */
export function readRingDailyRecords(
  ringBuffer: Buffer,
  oldestPtr: number,
  newestPtr: number,
): DailyActivityRecord[] {
  if (ringBuffer.length === 0) {
    return [];
  }

  const records: DailyActivityRecord[] = [];
  let offset = oldestPtr % ringBuffer.length;
  const guard = new Set<number>();

  while (true) {
    if (guard.has(offset)) {
      break;
    }
    guard.add(offset);

    const record = parseDailyActivityRecord(ringBuffer, offset);
    records.push(record);

    if (offset === newestPtr) {
      break;
    }

    offset = (offset + record.recordLength) % ringBuffer.length;
    if (record.recordLength === 0) {
      break;
    }
  }

  return records;
}

export function changesToActivities(
  recordDateEpoch: number,
  changes: ActivityChangeInfo[],
): ParsedDddActivity[] {
  if (changes.length === 0) {
    return [];
  }

  const sorted = [...changes].sort((a, b) => a.minutes - b.minutes);
  const activities: ParsedDddActivity[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const nextMinutes = i + 1 < sorted.length ? sorted[i + 1].minutes : MINUTES_PER_DAY;
    const durationM = nextMinutes - current.minutes;

    if (durationM <= 0) {
      continue;
    }

    activities.push({
      state: activityCodeToState(current.activity),
      startedAt: timeRealToIso(recordDateEpoch + current.minutes * 60),
      durationS: durationM * 60,
    });
  }

  return activities;
}
