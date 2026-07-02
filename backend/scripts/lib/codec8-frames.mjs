export function crc16Arc(buffer) {
  let crc = 0x0000;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const lsb = crc & 1;
      crc >>= 1;
      if (lsb) crc ^= 0xa001;
    }
  }
  return crc & 0xffff;
}

/** Sim DTC IO id (1-byte Codec8); production devices may use 272/385 via Codec8 Extended. */
const SIM_DTC_IO_ID = 48;

/**
 * @param {object} state
 * @param {number} state.timestampMs
 * @param {number} state.lat
 * @param {number} state.lon
 * @param {number} state.heading
 * @param {number} state.speedKph
 * @param {number} state.rpm
 * @param {number} state.voltage
 * @param {number} state.odometerKm
 * @param {boolean} [state.ignition]
 * @param {number} [state.fuelLevelPct]
 * @param {number} [state.dtcRaw]
 */
export function encodeRecord(state) {
  const ignition = state.ignition === false ? 0 : 1;
  const hasFuel = state.fuelLevelPct !== undefined;
  const hasDtc = (state.dtcRaw ?? 0) > 0;

  const n1Count = 1 + (hasFuel ? 1 : 0);
  const n2Count = 1 + (hasDtc ? 1 : 0);
  const totalIo = n1Count + n2Count + 1 + 1;

  const ioParts = [Buffer.from([0, totalIo])];

  ioParts.push(Buffer.from([n1Count, 239, ignition]));
  if (hasFuel) {
    ioParts.push(Buffer.from([86, Math.round(state.fuelLevelPct)]));
  }

  const n2Len = 4 + (hasDtc ? 3 : 0);
  const n2 = Buffer.alloc(n2Len);
  n2.writeUInt8(n2Count, 0);
  n2.writeUInt8(32, 1);
  n2.writeUInt16BE(Math.round(state.rpm), 2);
  if (hasDtc) {
    n2.writeUInt8(SIM_DTC_IO_ID, 4);
    n2.writeUInt16BE(state.dtcRaw & 0xffff, 5);
  }
  ioParts.push(n2);

  const volt = Buffer.alloc(6);
  volt.writeUInt8(1, 0);
  volt.writeUInt8(66, 1);
  volt.writeUInt32BE(Math.round(state.voltage * 1000), 2);
  ioParts.push(volt);

  const odo = Buffer.alloc(10);
  odo.writeUInt8(1, 0);
  odo.writeUInt8(16, 1);
  odo.writeBigUInt64BE(BigInt(Math.round(state.odometerKm * 1000)), 2);
  ioParts.push(odo);

  const ioBlob = Buffer.concat(ioParts);

  const record = Buffer.alloc(8 + 1 + 4 + 4 + 2 + 2 + 1 + 2 + ioBlob.length);
  let o = 0;
  record.writeBigInt64BE(BigInt(state.timestampMs), o); o += 8;
  record.writeUInt8(1, o); o += 1;

  const lon = Math.round(state.lon * 10_000_000);
  const lat = Math.round(state.lat * 10_000_000);
  record.writeInt32BE(lon, o); o += 4;
  record.writeInt32BE(lat, o); o += 4;
  record.writeUInt16BE(120, o); o += 2;
  record.writeUInt16BE(Math.round(state.heading) % 360, o); o += 2;
  record.writeUInt8(8, o); o += 1;
  record.writeUInt16BE(Math.round(state.speedKph), o); o += 2;

  ioBlob.copy(record, o);
  return record;
}

export function encodeCodec8Packet(records, options = {}) {
  const recordBuffers = records.map((record) => encodeRecord(record));
  const body = Buffer.concat([
    Buffer.from([0x08]),
    Buffer.from([recordBuffers.length]),
    ...recordBuffers,
    Buffer.from([recordBuffers.length]),
  ]);

  const header = Buffer.alloc(8);
  header.writeUInt32BE(0, 0);
  header.writeUInt32BE(body.length, 4);

  let crcValue = crc16Arc(body);
  if (options.corruptCrc) {
    crcValue = (crcValue + 1) & 0xffff;
  }

  const crc = Buffer.alloc(2);
  crc.writeUInt16BE(crcValue, 0);

  return Buffer.concat([header, body, crc]);
}

export function loginPacket(imei) {
  const imeiBuf = Buffer.from(imei, 'ascii');
  const packet = Buffer.alloc(2 + imeiBuf.length);
  packet.writeUInt16BE(imeiBuf.length, 0);
  imeiBuf.copy(packet, 2);
  return packet;
}

/** Interpolate along a deterministic closed route from seed. */
export function buildRoute(seed, pointCount = 64) {
  const rng = createSeededRngFromSeed(seed);
  const centerLat = 52.52 + (rng() - 0.5) * 0.02;
  const centerLon = 13.405 + (rng() - 0.5) * 0.02;
  const radiusLat = 0.04 + rng() * 0.02;
  const radiusLon = 0.06 + rng() * 0.02;

  const points = [];
  for (let i = 0; i < pointCount; i += 1) {
    const angle = (i / pointCount) * Math.PI * 2;
    points.push({
      lat: centerLat + Math.sin(angle) * radiusLat,
      lon: centerLon + Math.cos(angle) * radiusLon,
    });
  }
  return points;
}

function createSeededRngFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function interpolateRoute(route, progress01) {
  const wrapped = ((progress01 % 1) + 1) % 1;
  const index = wrapped * (route.length - 1);
  const left = Math.floor(index);
  const right = Math.min(route.length - 1, left + 1);
  const t = index - left;
  return {
    lat: route[left].lat + (route[right].lat - route[left].lat) * t,
    lon: route[left].lon + (route[right].lon - route[left].lon) * t,
  };
}

export function createInitialMotionState(seed, stepIndex = 0) {
  const route = buildRoute(seed);
  const pos = interpolateRoute(route, stepIndex / 64);
  return {
    route,
    lat: pos.lat,
    lon: pos.lon,
    heading: (stepIndex * 17 + seed) % 360,
    speedKph: 45 + (seed % 15),
    rpm: 1400 + (seed % 300),
    voltage: 12.6,
    odometerKm: 120_000 + stepIndex * 0.2,
    ignition: true,
    fuelLevelPct: 60,
    dtcRaw: 0,
  };
}

export function stepMotionState(state, rng, intervalMs = 2000) {
  const headingDelta = (rng() - 0.5) * 8;
  state.heading = (state.heading + headingDelta + 360) % 360;

  const speedDelta = (rng() - 0.5) * 4;
  state.speedKph = Math.max(25, Math.min(90, state.speedKph + speedDelta));

  const distanceM = (state.speedKph * 1000 / 3600) * (intervalMs / 1000);
  const headingRad = (state.heading * Math.PI) / 180;
  state.lat += (distanceM / 111_320) * Math.cos(headingRad);
  state.lon += (distanceM / (111_320 * Math.cos((state.lat * Math.PI) / 180))) * Math.sin(headingRad);

  state.rpm = Math.max(900, Math.min(2200, state.rpm + (rng() - 0.5) * 80));
  state.voltage = Math.max(12.0, Math.min(14.4, state.voltage + (rng() - 0.5) * 0.05));
  state.odometerKm += distanceM / 1000;
}
