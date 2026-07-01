import type { ParsedAvlIo, ParsedIoValue } from './avl-io-map';

export type ParsedAvlRecord = {
  timestampMs: number;
  priority: number;
  longitude: number;
  latitude: number;
  altitudeM: number;
  angleDeg: number;
  satellites: number;
  speedKph: number;
  io: ParsedAvlIo;
};

export type ParsedAvlPacket = {
  codecId: number;
  recordCount: number;
  records: ParsedAvlRecord[];
};

export type ParsedFrame = {
  packet: ParsedAvlPacket;
  bytesConsumed: number;
  crcValid: boolean;
};

const CODEC_8 = 0x08;
const CODEC_8_EXT = 0x8e;

class Cursor {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  get position(): number {
    return this.offset;
  }

  readUInt8(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt32BE(): number {
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readUInt16BE(): number {
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readUInt32BE(): number {
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt64BEAsNumber(): number {
    const value = this.buffer.readBigInt64BE(this.offset);
    this.offset += 8;
    return Number(value);
  }

  readValue(size: number): ParsedIoValue {
    if (size === 1) {
      return this.readUInt8();
    }
    if (size === 2) {
      return this.readUInt16BE();
    }
    if (size === 4) {
      return this.readUInt32BE();
    }
    if (size === 8) {
      const value = this.buffer.readBigUInt64BE(this.offset);
      this.offset += 8;
      return value;
    }

    let value = 0n;
    for (let i = 0; i < size; i += 1) {
      value = (value << 8n) | BigInt(this.buffer[this.offset + i]);
    }
    this.offset += size;
    return value;
  }
}

function parseIoElements(cursor: Cursor, codecId: number): ParsedAvlIo {
  const isExtended = codecId === CODEC_8_EXT;
  const readId = () => (isExtended ? cursor.readUInt16BE() : cursor.readUInt8());
  const readCount = () => (isExtended ? cursor.readUInt16BE() : cursor.readUInt8());

  const eventId = readId();
  const totalCount = readCount();

  const values = new Map<number, ParsedIoValue>();

  const n1 = readCount();
  for (let i = 0; i < n1; i += 1) {
    values.set(readId(), cursor.readValue(1));
  }

  const n2 = readCount();
  for (let i = 0; i < n2; i += 1) {
    values.set(readId(), cursor.readValue(2));
  }

  const n4 = readCount();
  for (let i = 0; i < n4; i += 1) {
    values.set(readId(), cursor.readValue(4));
  }

  const n8 = readCount();
  for (let i = 0; i < n8; i += 1) {
    values.set(readId(), cursor.readValue(8));
  }

  if (isExtended) {
    const nx = readCount();
    for (let i = 0; i < nx; i += 1) {
      const id = readId();
      const len = cursor.readUInt16BE();
      values.set(id, cursor.readValue(len));
    }
  }

  return {
    eventId,
    totalCount,
    values,
  };
}

function parseRecords(data: Buffer, codecId: number, count: number): ParsedAvlRecord[] {
  const cursor = new Cursor(data);
  const records: ParsedAvlRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const timestampMs = cursor.readInt64BEAsNumber();
    const priority = cursor.readUInt8();

    const longitudeRaw = cursor.readInt32BE();
    const latitudeRaw = cursor.readInt32BE();
    const altitudeM = cursor.readUInt16BE();
    const angleDeg = cursor.readUInt16BE();
    const satellites = cursor.readUInt8();
    const speedKph = cursor.readUInt16BE();

    const io = parseIoElements(cursor, codecId);

    records.push({
      timestampMs,
      priority,
      longitude: longitudeRaw / 10_000_000,
      latitude: latitudeRaw / 10_000_000,
      altitudeM,
      angleDeg,
      satellites,
      speedKph,
      io,
    });
  }

  if (cursor.position !== data.length) {
    throw new Error(`AVL data parse mismatch, consumed=${cursor.position} length=${data.length}`);
  }

  return records;
}

export function crc16Arc(buffer: Buffer): number {
  let crc = 0x0000;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const lsb = crc & 0x0001;
      crc >>= 1;
      if (lsb) {
        crc ^= 0xa001;
      }
    }
  }
  return crc & 0xffff;
}

export function parseCodec8Frame(buffer: Buffer): ParsedFrame | null {
  if (buffer.length < 10) {
    return null;
  }

  const preamble = buffer.readUInt32BE(0);
  if (preamble !== 0) {
    throw new Error('Invalid preamble');
  }

  const dataLength = buffer.readUInt32BE(4);
  if (dataLength < 3 || dataLength > 20_000) {
    throw new Error(`Invalid data length: ${dataLength}`);
  }

  const baseOffset = 8;
  const dataEnd = baseOffset + dataLength;

  if (buffer.length < dataEnd + 2) {
    return null;
  }

  const data = buffer.subarray(baseOffset, dataEnd);
  const codecId = data.readUInt8(0);
  if (codecId !== CODEC_8 && codecId !== CODEC_8_EXT) {
    throw new Error(`Unsupported codec id: 0x${codecId.toString(16)}`);
  }

  const recordCount = data.readUInt8(1);
  const recordCount2 = data.readUInt8(data.length - 1);
  if (recordCount !== recordCount2) {
    throw new Error(`Record count mismatch: ${recordCount} != ${recordCount2}`);
  }

  const payload = data.subarray(2, data.length - 1);
  const records = parseRecords(payload, codecId, recordCount);

  const calculatedCrc = crc16Arc(data);

  let crcFromFrame: number;
  let bytesConsumed: number;

  if (buffer.length >= dataEnd + 4 && buffer.readUInt16BE(dataEnd) === 0) {
    crcFromFrame = buffer.readUInt16BE(dataEnd + 2);
    bytesConsumed = dataEnd + 4;
  } else {
    crcFromFrame = buffer.readUInt16BE(dataEnd);
    bytesConsumed = dataEnd + 2;
  }

  return {
    packet: {
      codecId,
      recordCount,
      records,
    },
    bytesConsumed,
    crcValid: calculatedCrc === crcFromFrame,
  };
}
