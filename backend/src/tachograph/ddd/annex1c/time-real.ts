/** TimeReal: seconds since 1970-01-01 UTC (4-byte big-endian unsigned). */
export function decodeTimeReal(buffer: Buffer, offset = 0): number {
  if (offset + 4 > buffer.length) {
    throw new RangeError(`TimeReal decode out of range at offset ${offset}`);
  }
  return buffer.readUInt32BE(offset);
}

export function encodeTimeReal(epochSeconds: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(epochSeconds >>> 0, 0);
  return buf;
}

export function timeRealToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}
