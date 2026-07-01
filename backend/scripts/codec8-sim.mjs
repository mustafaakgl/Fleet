#!/usr/bin/env node
import 'dotenv/config';
import { Socket } from 'node:net';

const HOST = process.env.DEVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.DEVICE_PORT || 5027);
const INTERVAL_MS = Number(process.env.CODEC8_SIM_INTERVAL_MS || 3000);

const IMEIS = (process.env.CODEC8_SIM_IMEIS || '359339080000001,359339080000002,359339080000003')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

if (IMEIS.length === 0) {
  console.error('[codec8-sim] set CODEC8_SIM_IMEIS with at least one IMEI');
  process.exit(1);
}

function crc16Arc(buffer) {
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

function encodeRecord(state) {
  const record = Buffer.alloc(8 + 1 + 4 + 4 + 2 + 2 + 1 + 2 + 2 + 1 + 2 + 1 + 2 + 1 + 4 + 1 + 4);
  let o = 0;

  record.writeBigInt64BE(BigInt(Date.now()), o); o += 8;
  record.writeUInt8(1, o); o += 1; // priority

  const lon = Math.round(state.lon * 10_000_000);
  const lat = Math.round(state.lat * 10_000_000);
  record.writeInt32BE(lon, o); o += 4;
  record.writeInt32BE(lat, o); o += 4;
  record.writeUInt16BE(120, o); o += 2; // altitude
  record.writeUInt16BE(Math.round(state.heading) % 360, o); o += 2;
  record.writeUInt8(8, o); o += 1; // satellites
  record.writeUInt16BE(Math.round(state.speedKph), o); o += 2;

  // Codec8 IO
  record.writeUInt8(0, o); o += 1; // event id
  record.writeUInt8(4, o); o += 1; // total io count

  // N1
  record.writeUInt8(1, o); o += 1;
  record.writeUInt8(239, o); o += 1; // ignition
  record.writeUInt8(state.speedKph > 1 ? 1 : 0, o); o += 1;

  // N2
  record.writeUInt8(1, o); o += 1;
  record.writeUInt8(32, o); o += 1; // rpm
  record.writeUInt16BE(Math.round(state.rpm), o); o += 2;

  // N4
  record.writeUInt8(1, o); o += 1;
  record.writeUInt8(66, o); o += 1; // external voltage mV
  record.writeUInt32BE(Math.round(state.voltage * 1000), o); o += 4;

  // N8
  record.writeUInt8(1, o); o += 1;
  record.writeUInt8(16, o); o += 1; // odometer meters
  record.writeBigUInt64BE(BigInt(Math.round(state.odometerKm * 1000)), o); o += 8;

  return record;
}

function encodeCodec8Packet(state) {
  const record = encodeRecord(state);
  const body = Buffer.concat([
    Buffer.from([0x08]), // codec id
    Buffer.from([0x01]), // record count 1
    record,
    Buffer.from([0x01]), // record count 1 repeat
  ]);

  const header = Buffer.alloc(8);
  header.writeUInt32BE(0, 0);
  header.writeUInt32BE(body.length, 4);

  const crc = Buffer.alloc(2);
  crc.writeUInt16BE(crc16Arc(body), 0);

  return Buffer.concat([header, body, crc]);
}

function stepState(state) {
  const headingDelta = (Math.random() - 0.5) * 20;
  state.heading = (state.heading + headingDelta + 360) % 360;

  const speedDelta = (Math.random() - 0.5) * 8;
  state.speedKph = Math.max(0, Math.min(120, state.speedKph + speedDelta));

  const distanceM = (state.speedKph * 1000 / 3600) * (INTERVAL_MS / 1000);
  const headingRad = state.heading * Math.PI / 180;
  state.lat += (distanceM / 111_320) * Math.cos(headingRad);
  state.lon += (distanceM / (111_320 * Math.cos(state.lat * Math.PI / 180))) * Math.sin(headingRad);

  state.rpm = Math.max(650, Math.min(2600, state.rpm + (Math.random() - 0.5) * 160));
  state.voltage = Math.max(11.5, Math.min(14.6, state.voltage + (Math.random() - 0.5) * 0.1));
  state.odometerKm += distanceM / 1000;
}

function loginPacket(imei) {
  const imeiBuf = Buffer.from(imei, 'ascii');
  const packet = Buffer.alloc(2 + imeiBuf.length);
  packet.writeUInt16BE(imeiBuf.length, 0);
  imeiBuf.copy(packet, 2);
  return packet;
}

async function connectDevice(imei, idx) {
  const center = [
    { lat: 52.520008, lon: 13.404954 },
    { lat: 48.137154, lon: 11.576124 },
    { lat: 50.110924, lon: 8.682127 },
  ][idx % 3];

  const state = {
    lat: center.lat + (Math.random() - 0.5) * 0.01,
    lon: center.lon + (Math.random() - 0.5) * 0.01,
    heading: Math.random() * 360,
    speedKph: 30 + Math.random() * 40,
    rpm: 1300 + Math.random() * 400,
    voltage: 12.8 + Math.random() * 0.5,
    odometerKm: 100_000 + Math.random() * 8_000,
  };

  const socket = new Socket();
  socket.setNoDelay(true);

  let ackBuffer = Buffer.alloc(0);
  let loggedIn = false;

  socket.on('error', (error) => {
    console.error(`[codec8-sim] socket error imei=${imei} error=${error.message}`);
  });

  socket.on('close', () => {
    console.log(`[codec8-sim] disconnected imei=${imei}`);
  });

  socket.on('data', (chunk) => {
    ackBuffer = Buffer.concat([ackBuffer, chunk]);

    if (!loggedIn) {
      if (ackBuffer.length < 1) return;
      const accepted = ackBuffer.readUInt8(0) === 0x01;
      ackBuffer = ackBuffer.subarray(1);

      if (!accepted) {
        console.error(`[codec8-sim] login rejected imei=${imei}`);
        socket.destroy();
        return;
      }

      loggedIn = true;
      console.log(`[codec8-sim] login accepted imei=${imei}`);
      return;
    }

    while (ackBuffer.length >= 4) {
      const acceptedRecords = ackBuffer.readUInt32BE(0);
      ackBuffer = ackBuffer.subarray(4);
      console.log(`[codec8-sim] ack imei=${imei} acceptedRecords=${acceptedRecords}`);
    }
  });

  await new Promise((resolve, reject) => {
    socket.connect(PORT, HOST, resolve);
    socket.once('error', reject);
  });

  console.log(`[codec8-sim] connected imei=${imei} host=${HOST} port=${PORT}`);
  socket.write(loginPacket(imei));

  const timer = setInterval(() => {
    if (!loggedIn) {
      return;
    }

    stepState(state);
    socket.write(encodeCodec8Packet(state));
  }, INTERVAL_MS);

  return { socket, timer };
}

const sessions = [];
for (let i = 0; i < IMEIS.length; i += 1) {
  try {
    const session = await connectDevice(IMEIS[i], i);
    sessions.push(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codec8-sim] connect failed imei=${IMEIS[i]} error=${message}`);
  }
}

if (sessions.length === 0) {
  process.exit(1);
}

console.log(`[codec8-sim] running devices=${sessions.length} intervalMs=${INTERVAL_MS}`);

function shutdown() {
  for (const { socket, timer } of sessions) {
    clearInterval(timer);
    socket.destroy();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
