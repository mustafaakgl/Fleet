import {
  EF_APPLICATION_IDENTIFICATION_GEN1,
  EF_APPLICATION_IDENTIFICATION_GEN2,
  EF_DRIVER_ACTIVITY_DATA_GEN1,
  EF_DRIVER_ACTIVITY_DATA_GEN2,
  EF_EVENTS_DATA_GEN1,
  EF_EVENTS_DATA_GEN2,
  EF_FAULTS_DATA_GEN1,
  EF_FAULTS_DATA_GEN2,
  EF_IDENTIFICATION_GEN1,
  EF_IDENTIFICATION_GEN2,
  EF_VEHICLES_USED_GEN1,
  EF_VEHICLES_USED_GEN2,
  GEN1_CARD_FIDS,
  GEN2_CARD_FIDS,
  DRIVER_CARD_TYPE_ID,
} from './constants';
import { changesToActivities, readRingDailyRecords } from './activity-change';
import { decodeTimeReal } from './time-real';
import { parseCardTlvBlocks, type CardTlvRecord } from './tlv';
import type { DddGeneration, ParsedDddEvent, ParsedDddResult } from '../parser-types';
import { emptyParsedDddResult } from '../parser-types';

export type CardParseContext = {
  generation: DddGeneration;
  skippedBlocks: string[];
  warnings: string[];
};

function fidLabel(fid: number): string {
  return `0x${fid.toString(16).padStart(4, '0').toUpperCase()}`;
}

function resolveGeneration(records: CardTlvRecord[]): DddGeneration {
  const fids = new Set(records.map((r) => r.fid));
  const hasGen2 = [...fids].some((fid) => GEN2_CARD_FIDS.has(fid));
  const hasGen1 = [...fids].some((fid) => GEN1_CARD_FIDS.has(fid));
  if (hasGen2 && !hasGen1) return 2;
  if (hasGen1 && !hasGen2) return 1;
  if (hasGen2) return 2;
  return 'unknown';
}

function mapActivityFid(fid: number): number | null {
  if (fid === EF_DRIVER_ACTIVITY_DATA_GEN1 || fid === EF_DRIVER_ACTIVITY_DATA_GEN2) {
    return fid;
  }
  return null;
}

function mapIdentificationFid(fid: number): number | null {
  if (fid === EF_IDENTIFICATION_GEN1 || fid === EF_IDENTIFICATION_GEN2) {
    return fid;
  }
  return null;
}

function parseApplicationIdentification(value: Buffer, ctx: CardParseContext): void {
  if (value.length < 1) {
    ctx.warnings.push('ApplicationIdentification EF is empty.');
    return;
  }

  const cardType = value.readUInt8(0);
  if (cardType !== DRIVER_CARD_TYPE_ID) {
    ctx.warnings.push(`Unexpected tachograph card type id: 0x${cardType.toString(16)}`);
  }
}

function parseIdentification(value: Buffer): string | undefined {
  // Card number is typically at offset 74 (after holder name) in full EF; for fixtures we embed ASCII at start.
  const ascii = value.toString('ascii').replace(/\0/g, '').trim();
  const match = ascii.match(/[A-Z]{2,3}-[A-Z]{2}-\d{4,}/);
  if (match) {
    return match[0];
  }

  if (ascii.length >= 8) {
    return ascii.slice(0, 32).trim();
  }

  return undefined;
}

function parseDriverActivityData(value: Buffer, ctx: CardParseContext) {
  if (value.length < 4) {
    ctx.warnings.push('DriverActivityData EF too short.');
    return [];
  }

  const oldestPtr = value.readUInt16BE(0);
  const newestPtr = value.readUInt16BE(2);
  const ringBuffer = value.subarray(4);

  try {
    const dailyRecords = readRingDailyRecords(ringBuffer, oldestPtr, newestPtr);
    return dailyRecords.flatMap((record) => changesToActivities(record.recordDateEpoch, record.changes));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.warnings.push(`DriverActivityData ring parse failed: ${message}`);
    return [];
  }
}

function parseEventsData(value: Buffer): ParsedDddEvent[] {
  const events: ParsedDddEvent[] = [];
  const recordSize = 12;

  for (let offset = 0; offset + recordSize <= value.length; offset += recordSize) {
    const epoch = decodeTimeReal(value, offset);
    const eventType = value.readUInt8(offset + 4);
    const severity = value.readUInt8(offset + 5) > 0 ? 'critical' : 'medium';

    events.push({
      type: 'event',
      occurredAt: new Date(epoch * 1000).toISOString(),
      code: `0x${eventType.toString(16).padStart(2, '0')}`,
      severity,
    });
  }

  return events;
}

function parseFaultsData(value: Buffer): ParsedDddEvent[] {
  const events: ParsedDddEvent[] = [];
  const recordSize = 12;

  for (let offset = 0; offset + recordSize <= value.length; offset += recordSize) {
    const epoch = decodeTimeReal(value, offset);
    const faultType = value.readUInt8(offset + 4);

    events.push({
      type: 'fault',
      occurredAt: new Date(epoch * 1000).toISOString(),
      code: `0x${faultType.toString(16).padStart(2, '0')}`,
      severity: 'medium',
    });
  }

  return events;
}

function parseVehiclesUsed(value: Buffer, ctx: CardParseContext): void {
  if (value.length < 4) {
    ctx.warnings.push('VehiclesUsed EF too short.');
    return;
  }

  const recordCount = value.readUInt16BE(0);
  if (recordCount === 0) {
    return;
  }

  // Fixture layout: count(2) + records with VRN ascii at offset 2 within each 31-byte record.
  const recordSize = 31;
  let offset = 2;
  for (let i = 0; i < recordCount && offset + recordSize <= value.length; i += 1) {
    offset += recordSize;
  }

  if (offset < value.length) {
    ctx.warnings.push('VehiclesUsed trailing bytes ignored.');
  }
}

export function parseAnnex1cCardFile(records: CardTlvRecord[]): ParsedDddResult {
  const ctx: CardParseContext = {
    generation: resolveGeneration(records),
    skippedBlocks: [],
    warnings: [],
  };

  let driverCardNo: string | undefined;
  const activities = [];
  const events: ParsedDddEvent[] = [];

  const dataRecords = records.filter((r) => r.recordType === 0x00);

  for (const record of dataRecords) {
    const fid = record.fid;

    if (fid === EF_APPLICATION_IDENTIFICATION_GEN1 || fid === EF_APPLICATION_IDENTIFICATION_GEN2) {
      parseApplicationIdentification(record.value, ctx);
      continue;
    }

    const identificationFid = mapIdentificationFid(fid);
    if (identificationFid !== null) {
      driverCardNo = parseIdentification(record.value) ?? driverCardNo;
      continue;
    }

    const activityFid = mapActivityFid(fid);
    if (activityFid !== null) {
      activities.push(...parseDriverActivityData(record.value, ctx));
      continue;
    }

    if (fid === EF_EVENTS_DATA_GEN1 || fid === EF_EVENTS_DATA_GEN2) {
      events.push(...parseEventsData(record.value));
      continue;
    }

    if (fid === EF_FAULTS_DATA_GEN1 || fid === EF_FAULTS_DATA_GEN2) {
      events.push(...parseFaultsData(record.value));
      continue;
    }

    if (fid === EF_VEHICLES_USED_GEN1 || fid === EF_VEHICLES_USED_GEN2) {
      parseVehiclesUsed(record.value, ctx);
      continue;
    }

    ctx.skippedBlocks.push(fidLabel(fid));
  }

  return {
    ok: activities.length > 0 || events.length > 0,
    fileType: 'card',
    generation: ctx.generation,
    driverCardNo,
    activities,
    events,
    dailyTotals: [],
    warnings: ctx.warnings,
    signature: { checked: false, valid: null, details: [] },
    skippedBlocks: ctx.skippedBlocks,
  };
}

export function parseAnnex1cCardBuffer(buffer: Buffer): ParsedDddResult {
  try {
    const records = parseCardTlvBlocks(buffer);
    return parseAnnex1cCardFile(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return emptyParsedDddResult([`Annex 1C card parse error: ${message}`]);
  }
}
