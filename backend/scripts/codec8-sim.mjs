#!/usr/bin/env node
import 'dotenv/config';
import { Socket } from 'node:net';
import { createSeededRng } from './lib/seeded-rng.mjs';
import {
  createInitialMotionState,
  encodeCodec8Packet,
  interpolateRoute,
  loginPacket,
  stepMotionState,
} from './lib/codec8-frames.mjs';

function parseArgs(argv) {
  const args = {
    scenario: 'normal',
    seed: 42,
    imei: process.env.CODEC8_SIM_IMEI || '359339080000101',
    host: process.env.DEVICE_HOST || '127.0.0.1',
    port: Number(process.env.DEVICE_PORT || 5027),
    count: Number(process.env.CODEC8_SIM_COUNT || 5),
    intervalMs: Number(process.env.CODEC8_SIM_INTERVAL_MS || 2000),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--scenario') {
      args.scenario = argv[++i];
      continue;
    }
    if (token === '--seed') {
      args.seed = Number(argv[++i]);
      continue;
    }
    if (token === '--imei') {
      args.imei = argv[++i];
      continue;
    }
    if (token === '--host') {
      args.host = argv[++i];
      continue;
    }
    if (token === '--port') {
      args.port = Number(argv[++i]);
      continue;
    }
    if (token === '--count') {
      args.count = Number(argv[++i]);
      continue;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSessionSocket(host, port) {
  const socket = new Socket();
  socket.setNoDelay(true);
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.connect(port, host, () => {
      socket.off('error', reject);
      resolve(socket);
    });
  });
}

async function loginAndWait(socket, imei) {
  const ackBuffer = { chunks: [] };
  let loggedIn = false;
  let ackRecords = 0;

  socket.on('data', (chunk) => {
    ackBuffer.chunks.push(chunk);
    const buf = Buffer.concat(ackBuffer.chunks);

    if (!loggedIn) {
      if (buf.length < 1) return;
      const accepted = buf.readUInt8(0) === 0x01;
      ackBuffer.chunks = [buf.subarray(1)];
      if (!accepted) {
        throw new Error(`login rejected imei=${imei}`);
      }
      loggedIn = true;
      return;
    }

    if (buf.length >= 4) {
      ackRecords += buf.readUInt32BE(0);
      ackBuffer.chunks = [buf.subarray(4)];
    }
  });

  socket.write(loginPacket(imei));
  await sleep(150);

  return {
    getAckRecords: () => ackRecords,
    isLoggedIn: () => loggedIn,
  };
}

function scenarioWindow(recordCount, intervalMs) {
  const startedAtMs = Date.now();
  const spanMs = Math.max(intervalMs, recordCount * intervalMs);
  const baseTs = startedAtMs - spanMs - 5_000;
  return {
    startedAtMs,
    startedAt: new Date(startedAtMs).toISOString(),
    verifySince: new Date(baseTs).toISOString(),
    baseTs,
    expectedLastRecordedAtMs: baseTs + Math.max(0, recordCount - 1) * intervalMs,
    expectedLastRecordedAt: new Date(baseTs + Math.max(0, recordCount - 1) * intervalMs).toISOString(),
  };
}

function summaryEnvelope(args, body) {
  const quarantineExpected =
    body.scenario === 'corrupt-frames' ? body.corruptFramesSent ?? 0 : 0;
  return {
    ...body,
    seed: args.seed,
    imei: args.imei,
    telemetryQuarantineExpected: quarantineExpected,
  };
}

function recordFromMotion(motion, timestampMs) {
  return {
    timestampMs,
    lat: motion.lat,
    lon: motion.lon,
    heading: motion.heading,
    speedKph: motion.speedKph,
    rpm: motion.rpm,
    voltage: motion.voltage,
    odometerKm: motion.odometerKm,
    ignition: motion.ignition,
    fuelLevelPct: motion.fuelLevelPct,
    dtcRaw: motion.dtcRaw,
  };
}

async function sendRecords(socket, records, options = {}) {
  const { batch = false, corruptIndices = null } = options;

  if (batch) {
    const corrupt = corruptIndices?.has(0) ?? false;
    socket.write(encodeCodec8Packet(records, { corruptCrc: corrupt }));
    await sleep(150);
    return records.length;
  }

  let sent = 0;
  for (let i = 0; i < records.length; i += 1) {
    const corrupt = corruptIndices?.has(i) ?? false;
    socket.write(encodeCodec8Packet([records[i]], { corruptCrc: corrupt }));
    sent += 1;
    await sleep(50);
  }
  return sent;
}

function pickCorruptIndices(total, ratio, seed) {
  const corruptCount = Math.max(0, Math.floor(total * ratio));
  const rng = createSeededRng(seed);
  const indices = new Set();
  while (indices.size < corruptCount) {
    indices.add(Math.floor(rng() * total));
  }
  return indices;
}

async function runNormal(args) {
  const rng = createSeededRng(args.seed);
  const motion = createInitialMotionState(args.seed);
  const window = scenarioWindow(args.count, args.intervalMs);

  const socket = await createSessionSocket(args.host, args.port);
  const session = await loginAndWait(socket, args.imei);

  const records = [];
  for (let i = 0; i < args.count; i += 1) {
    const timestampMs = window.baseTs + i * args.intervalMs;
    records.push(recordFromMotion(motion, timestampMs));
    stepMotionState(motion, rng, args.intervalMs);
  }

  if (records.length > 0) {
    records[records.length - 1].ignition = false;
    records[records.length - 1].speedKph = 0;
    records[records.length - 1].rpm = 0;
  }

  const sent = await sendRecords(socket, records, { batch: false });
  const debounceMs = Number(process.env.TELEMATICS_IGNITION_OFF_DEBOUNCE_MS ?? 5000);
  await sleep(debounceMs + 500);
  socket.destroy();

  return summaryEnvelope(args, {
    scenario: 'normal',
    ...window,
    recordsSent: sent,
    recordsAcceptedExpected: sent,
    corruptFramesSent: 0,
    expectedLocationPoints: sent,
    expectedActiveDtcCount: 0,
    expectedClosedTrips: 1,
    ackRecords: session.getAckRecords(),
  });
}

async function runBurstReconnect(args) {
  const rng = createSeededRng(args.seed);
  const motion = createInitialMotionState(args.seed + 1);
  const firstBatch = 30;
  const secondBatch = 30;
  const totalRecords = firstBatch + secondBatch;
  const window = scenarioWindow(totalRecords, args.intervalMs);

  const firstRecords = [];
  for (let i = 0; i < firstBatch; i += 1) {
    firstRecords.push(recordFromMotion(motion, window.baseTs + i * args.intervalMs));
    stepMotionState(motion, rng, args.intervalMs);
  }

  const socket1 = await createSessionSocket(args.host, args.port);
  await loginAndWait(socket1, args.imei);
  await sendRecords(socket1, firstRecords, { batch: false });
  socket1.destroy();

  await sleep(500);

  const secondRecords = [];
  for (let i = 0; i < secondBatch; i += 1) {
    secondRecords.push(
      recordFromMotion(motion, window.baseTs + (firstBatch + i) * args.intervalMs),
    );
    stepMotionState(motion, rng, args.intervalMs);
  }

  const socket2 = await createSessionSocket(args.host, args.port);
  await loginAndWait(socket2, args.imei);
  await sendRecords(socket2, secondRecords, { batch: true });
  await sleep(300);
  socket2.destroy();

  return summaryEnvelope(args, {
    scenario: 'burst-reconnect',
    ...window,
    recordsSent: totalRecords,
    recordsAcceptedExpected: totalRecords,
    firstBatchRecords: firstBatch,
    secondBatchRecords: secondBatch,
    secondBatchBatched: true,
    expectedLocationPoints: totalRecords,
    expectedActiveDtcCount: 0,
  });
}

async function runCorruptFrames(args) {
  const rng = createSeededRng(args.seed);
  const motion = createInitialMotionState(args.seed + 2);
  const total = args.count;
  const window = scenarioWindow(total, args.intervalMs);
  const corruptIndices = pickCorruptIndices(total, 0.05, args.seed + 17);

  const socket = await createSessionSocket(args.host, args.port);
  await loginAndWait(socket, args.imei);

  const records = [];
  for (let i = 0; i < total; i += 1) {
    records.push(recordFromMotion(motion, window.baseTs + i * args.intervalMs));
    stepMotionState(motion, rng, args.intervalMs);
  }

  const sent = await sendRecords(socket, records, { corruptIndices });
  await sleep(200);
  socket.destroy();

  const corruptCount = corruptIndices.size;
  const expectedAccepted = total - corruptCount;

  return summaryEnvelope(args, {
    scenario: 'corrupt-frames',
    ...window,
    recordsSent: sent,
    corruptFramesSent: corruptCount,
    recordsAcceptedExpected: expectedAccepted,
    expectedLocationPoints: expectedAccepted,
    expectedActiveDtcCount: 0,
  });
}

function motionRoute(seed) {
  const motion = createInitialMotionState(seed);
  return motion.route;
}

async function runFuelTheft(args) {
  const route = motionRoute(args.seed + 3);
  const durationMs = 10 * 60 * 1000;
  const steps = 20;
  const intervalMs = durationMs / steps;
  const window = scenarioWindow(steps, intervalMs);

  const socket = await createSessionSocket(args.host, args.port);
  await loginAndWait(socket, args.imei);

  const records = [];
  for (let i = 0; i < steps; i += 1) {
    const progress = i / (steps - 1);
    const pos = interpolateRoute(route, progress * 0.1);
    const fuel = 60 - progress * 20;
    records.push({
      timestampMs: window.baseTs + i * intervalMs,
      lat: pos.lat,
      lon: pos.lon,
      heading: 180,
      speedKph: 0,
      rpm: 0,
      voltage: 12.4,
      odometerKm: 150_000,
      ignition: false,
      fuelLevelPct: fuel,
      dtcRaw: 0,
    });
  }

  await sendRecords(socket, records, { batch: false });
  await sleep(200);
  socket.destroy();

  return summaryEnvelope(args, {
    scenario: 'fuel-theft',
    ...window,
    recordsSent: records.length,
    recordsAcceptedExpected: records.length,
    fuelStartPct: 60,
    fuelEndPct: 40,
    ignition: false,
    expectedLocationPoints: records.length,
    expectedActiveDtcCount: 0,
    expectedFuelTheftNotifications: 1,
    skipTelemetryLatestCheck: true,
  });
}

async function runDtcStorm(args) {
  const route = motionRoute(args.seed + 4);
  const dtcCodes = [0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x0000, 0x0000];
  const labels = ['set-1', 'set-2', 'set-3', 'set-4', 'set-5', 'clear-1', 'clear-2'];
  const window = scenarioWindow(dtcCodes.length, 3000);

  const socket = await createSessionSocket(args.host, args.port);
  await loginAndWait(socket, args.imei);

  const records = dtcCodes.map((dtcRaw, index) => {
    const pos = interpolateRoute(route, index / dtcCodes.length);
    return {
      timestampMs: window.baseTs + index * 3000,
      lat: pos.lat,
      lon: pos.lon,
      heading: 90,
      speedKph: 55,
      rpm: 1500,
      voltage: 12.5,
      odometerKm: 160_000 + index,
      ignition: true,
      fuelLevelPct: 50,
      dtcRaw,
    };
  });

  await sendRecords(socket, records, { batch: false });
  await sleep(200);
  socket.destroy();

  return summaryEnvelope(args, {
    scenario: 'dtc-storm',
    ...window,
    recordsSent: records.length,
    dtcEvents: labels,
    recordsAcceptedExpected: 5,
    expectedActiveDtcCount: 5,
    countTotalActiveDtc: true,
    expectedLocationPoints: records.length,
  });
}

async function runLoad(args) {
  const rng = createSeededRng(args.seed);
  const motion = createInitialMotionState(args.seed + 5);
  const count = args.count;
  const intervalMs = 20;
  const window = scenarioWindow(count, intervalMs);

  const socket = await createSessionSocket(args.host, args.port);
  await loginAndWait(socket, args.imei);

  const batchSize = 50;
  let sent = 0;
  for (let batch = 0; batch < Math.ceil(count / batchSize); batch += 1) {
    const records = [];
    for (let i = 0; i < batchSize && sent + i < count; i += 1) {
      const index = sent + i;
      records.push(recordFromMotion(motion, window.baseTs + index * intervalMs));
      stepMotionState(motion, rng, intervalMs);
    }
    await sendRecords(socket, records, { batch: true });
    sent += records.length;
  }

  await sleep(1500);
  socket.destroy();

  return summaryEnvelope(args, {
    scenario: 'load',
    ...window,
    recordsSent: sent,
    recordsAcceptedExpected: sent,
    expectedLocationPoints: sent,
    expectedActiveDtcCount: 0,
    expectedDuplicateLocationPoints: 0,
  });
}

const args = parseArgs(process.argv);

const runners = {
  normal: runNormal,
  'burst-reconnect': runBurstReconnect,
  'corrupt-frames': runCorruptFrames,
  'fuel-theft': runFuelTheft,
  'dtc-storm': runDtcStorm,
  load: runLoad,
};

const runner = runners[args.scenario];
if (!runner) {
  console.error(`[codec8-sim] unknown scenario=${args.scenario}`);
  process.exit(1);
}

try {
  const summary = await runner(args);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[codec8-sim] failed scenario=${args.scenario} error=${message}`);
  process.exit(1);
}
