import {
  VU_BLOCK_ACTIVITIES_GEN1,
  VU_BLOCK_ACTIVITIES_GEN2,
  VU_BLOCK_DETAILED_SPEED_GEN1,
  VU_BLOCK_DETAILED_SPEED_GEN2,
  VU_BLOCK_EVENTS_FAULTS_GEN1,
  VU_BLOCK_EVENTS_FAULTS_GEN2,
  VU_BLOCK_OVERVIEW_GEN1,
  VU_BLOCK_OVERVIEW_GEN2,
  VU_BLOCK_TECHNICAL_DATA_GEN1,
  VU_BLOCK_TECHNICAL_DATA_GEN2,
  VU_EVENT_DRIVING_WITHOUT_CARD,
} from './constants';
import { changesToActivities, decodeActivityChangeInfo, type ActivityChangeInfo } from './activity-change';
import { decodeTimeReal } from './time-real';
import type { VuTrepBlock } from './tlv';
import type { DddGeneration, ParsedDddEvent, ParsedDddResult } from '../parser-types';

export type VuParseContext = {
  generation: DddGeneration;
  skippedBlocks: string[];
  warnings: string[];
};

function blockLabel(blockType: number): string {
  return `VU-0x${blockType.toString(16).padStart(2, '0')}`;
}

function resolveVuGeneration(blockTypes: number[]): DddGeneration {
  const hasGen2 = blockTypes.some((t) => t >= 0x21 && t <= 0x25);
  const hasGen1 = blockTypes.some((t) => t >= 0x01 && t <= 0x05);
  if (hasGen2 && !hasGen1) return 2;
  if (hasGen1 && !hasGen2) return 1;
  if (hasGen2) return 2;
  return 'unknown';
}

function parseOverview(value: Buffer): { vehicleVin?: string; vehicleVrn?: string } {
  const vinAscii = value.subarray(0, 17).toString('ascii').replace(/\0/g, '').trim();
  const vrnAscii = value.subarray(17, 32).toString('ascii').replace(/\0/g, '').trim();

  return {
    vehicleVin: vinAscii.length >= 11 ? vinAscii : undefined,
    vehicleVrn: vrnAscii.length > 0 ? vrnAscii : undefined,
  };
}

function parseActivitiesBlock(value: Buffer, ctx: VuParseContext) {
  const activities = [];
  let offset = 0;

  while (offset + 6 <= value.length) {
    const dayEpoch = decodeTimeReal(value, offset);
    const changeCount = value.readUInt16BE(offset + 4);
    offset += 6;

    const changes: ActivityChangeInfo[] = [];
    for (let i = 0; i < changeCount && offset + 2 <= value.length; i += 1) {
      const raw = value.readUInt16BE(offset);
      offset += 2;
      changes.push(decodeActivityChangeInfo(raw));
    }

    activities.push(...changesToActivities(dayEpoch, changes));
  }

  if (offset < value.length) {
    ctx.warnings.push('VU Activities block trailing bytes ignored.');
  }

  return activities;
}

function parseEventsFaultsBlock(value: Buffer): ParsedDddEvent[] {
  const events: ParsedDddEvent[] = [];
  const recordSize = 10;

  for (let offset = 0; offset + recordSize <= value.length; offset += recordSize) {
    const epoch = decodeTimeReal(value, offset);
    const eventType = value.readUInt8(offset + 4);
    const speedKph = value.readUInt16BE(offset + 5);
    const durationS = value.readUInt16BE(offset + 7);

    if (eventType === VU_EVENT_DRIVING_WITHOUT_CARD) {
      events.push({
        type: 'event',
        occurredAt: new Date(epoch * 1000).toISOString(),
        code: 'driving_without_card',
        durationS,
        severity: 'critical',
      });
      continue;
    }

    if (eventType === 0x08) {
      events.push({
        type: 'overspeed',
        occurredAt: new Date(epoch * 1000).toISOString(),
        speedKph,
        durationS,
        severity: speedKph >= 100 ? 'critical' : 'medium',
      });
      continue;
    }

    events.push({
      type: 'event',
      occurredAt: new Date(epoch * 1000).toISOString(),
      code: `0x${eventType.toString(16).padStart(2, '0')}`,
      severity: 'medium',
    });
  }

  return events;
}

export function parseAnnex1cVuFile(blocks: VuTrepBlock[]): ParsedDddResult {
  const ctx: VuParseContext = {
    generation: resolveVuGeneration(blocks.map((b) => b.blockType)),
    skippedBlocks: [],
    warnings: [],
  };

  let vehicleVin: string | undefined;
  const activities = [];
  const events: ParsedDddEvent[] = [];

  for (const block of blocks) {
    const type = block.blockType;

    if (type === VU_BLOCK_OVERVIEW_GEN1 || type === VU_BLOCK_OVERVIEW_GEN2) {
      const overview = parseOverview(block.value);
      vehicleVin = overview.vehicleVin ?? vehicleVin;
      continue;
    }

    if (type === VU_BLOCK_ACTIVITIES_GEN1 || type === VU_BLOCK_ACTIVITIES_GEN2) {
      activities.push(...parseActivitiesBlock(block.value, ctx));
      continue;
    }

    if (type === VU_BLOCK_EVENTS_FAULTS_GEN1 || type === VU_BLOCK_EVENTS_FAULTS_GEN2) {
      events.push(...parseEventsFaultsBlock(block.value));
      continue;
    }

    if (
      type === VU_BLOCK_DETAILED_SPEED_GEN1 ||
      type === VU_BLOCK_DETAILED_SPEED_GEN2 ||
      type === VU_BLOCK_TECHNICAL_DATA_GEN1 ||
      type === VU_BLOCK_TECHNICAL_DATA_GEN2
    ) {
      ctx.skippedBlocks.push(blockLabel(type));
      ctx.warnings.push(`${blockLabel(type)} not decoded in this phase.`);
      continue;
    }

    ctx.skippedBlocks.push(blockLabel(type));
  }

  return {
    ok: activities.length > 0 || events.length > 0 || Boolean(vehicleVin),
    fileType: 'vu',
    generation: ctx.generation,
    vehicleVin,
    activities,
    events,
    dailyTotals: [],
    warnings: ctx.warnings,
    signature: { checked: false, valid: null, details: [] },
    skippedBlocks: ctx.skippedBlocks,
  };
}
