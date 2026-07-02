import { CARD_RECORD_DATA, CARD_RECORD_SIGNATURE, KNOWN_CARD_FIDS } from './constants';

export type CardTlvRecord = {
  fid: number;
  recordType: number;
  value: Buffer;
  offset: number;
};

export class TlvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TlvParseError';
  }
}

export function encodeCardTlv(fid: number, recordType: number, value: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt16BE(fid, 0);
  header.writeUInt8(recordType, 2);
  header.writeUInt16BE(value.length, 3);
  return Buffer.concat([header, value]);
}

export function parseCardTlvBlocks(buffer: Buffer): CardTlvRecord[] {
  const records: CardTlvRecord[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 5 > buffer.length) {
      throw new TlvParseError(
        `Truncated TLV header at offset ${offset}: need 5 bytes, have ${buffer.length - offset}`,
      );
    }

    const fid = buffer.readUInt16BE(offset);
    const recordType = buffer.readUInt8(offset + 2);
    const length = buffer.readUInt16BE(offset + 3);
    const valueStart = offset + 5;
    const valueEnd = valueStart + length;

    if (valueEnd > buffer.length) {
      throw new TlvParseError(
        `Truncated TLV value for FID 0x${fid.toString(16)} at offset ${offset}: declared ${length} bytes, buffer ends at ${buffer.length}`,
      );
    }

    if (recordType !== CARD_RECORD_DATA && recordType !== CARD_RECORD_SIGNATURE) {
      throw new TlvParseError(
        `Unknown card record type 0x${recordType.toString(16)} for FID 0x${fid.toString(16)}`,
      );
    }

    records.push({
      fid,
      recordType,
      value: buffer.subarray(valueStart, valueEnd),
      offset,
    });

    offset = valueEnd;
  }

  return records;
}

export function isAnnex1cCardBuffer(buffer: Buffer): boolean {
  if (buffer.length < 5) {
    return false;
  }

  const fid = buffer.readUInt16BE(0);
  const recordType = buffer.readUInt8(2);
  if (recordType !== CARD_RECORD_DATA && recordType !== CARD_RECORD_SIGNATURE) {
    return false;
  }

  const length = buffer.readUInt16BE(3);
  if (5 + length > buffer.length) {
    return false;
  }

  return KNOWN_CARD_FIDS.has(fid);
}

export type VuTrepBlock = {
  blockType: number;
  value: Buffer;
  offset: number;
};

export function encodeVuTrepBlock(blockType: number, value: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(0x76, 0);
  header.writeUInt8(blockType, 1);
  header.writeUInt16BE(value.length, 2);
  return Buffer.concat([header, value]);
}

export function parseVuTrepBlocks(buffer: Buffer): VuTrepBlock[] {
  const blocks: VuTrepBlock[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) {
      throw new TlvParseError(
        `Truncated VU TREP header at offset ${offset}: need 4 bytes, have ${buffer.length - offset}`,
      );
    }

    const tag = buffer.readUInt8(offset);
    if (tag !== 0x76) {
      throw new TlvParseError(`Expected VU TREP tag 0x76 at offset ${offset}, got 0x${tag.toString(16)}`);
    }

    const blockType = buffer.readUInt8(offset + 1);
    const length = buffer.readUInt16BE(offset + 2);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > buffer.length) {
      throw new TlvParseError(
        `Truncated VU block type 0x${blockType.toString(16)} at offset ${offset}: declared ${length} bytes`,
      );
    }

    blocks.push({
      blockType,
      value: buffer.subarray(valueStart, valueEnd),
      offset,
    });

    offset = valueEnd;
  }

  return blocks;
}

export function isAnnex1cVuBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }

  if (buffer.readUInt8(0) !== 0x76) {
    return false;
  }

  const blockType = buffer.readUInt8(1);
  const length = buffer.readUInt16BE(2);
  if (4 + length > buffer.length) {
    return false;
  }

  const gen1 = blockType >= 0x01 && blockType <= 0x05;
  const gen2 = blockType >= 0x21 && blockType <= 0x25;
  return gen1 || gen2;
}
