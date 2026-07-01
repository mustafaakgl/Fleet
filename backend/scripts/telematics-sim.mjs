#!/usr/bin/env node
import 'dotenv/config';

const BASE_URL = (process.env.TELEMATICS_SIM_BASE_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');
const ENDPOINT = `${BASE_URL}/tracking/telematics/telemetry`;
const DEVICE_INGEST_TOKEN = process.env.DEVICE_INGEST_TOKEN?.trim();
const VEHICLE_IDS = (process.env.TELEMATICS_SIM_VEHICLE_IDS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const INTERVAL_MS = Number(process.env.TELEMATICS_SIM_INTERVAL_MS || 2000);

if (!DEVICE_INGEST_TOKEN) {
  console.error('[telematics-sim] DEVICE_INGEST_TOKEN is required.');
  process.exit(1);
}

if (VEHICLE_IDS.length === 0) {
  console.error('[telematics-sim] TELEMATICS_SIM_VEHICLE_IDS is required (comma-separated vehicle ids).');
  process.exit(1);
}

const centers = [
  { lat: 52.520008, lon: 13.404954 },
  { lat: 48.137154, lon: 11.576124 },
  { lat: 50.110924, lon: 8.682127 },
  { lat: 53.551086, lon: 9.993682 },
  { lat: 51.227741, lon: 6.773456 },
];

const stateByVehicle = new Map(
  VEHICLE_IDS.map((vehicleId, index) => {
    const center = centers[index % centers.length];
    return [
      vehicleId,
      {
        lat: center.lat + (Math.random() - 0.5) * 0.01,
        lon: center.lon + (Math.random() - 0.5) * 0.01,
        headingDeg: Math.random() * 360,
        speedMps: 8 + Math.random() * 12,
        rpm: 900 + Math.floor(Math.random() * 500),
        fuelLevelPct: 35 + Math.random() * 40,
        coolantTemp: 78 + Math.random() * 8,
        voltage: 13.2 + Math.random() * 1.2,
        odometerKm: 120000 + Math.random() * 60000,
      },
    ];
  }),
);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function maybeBuildEvents(currentSpeedMps) {
  const events = [];
  const speedKmh = currentSpeedMps * 3.6;

  if (speedKmh > 92 && Math.random() < 0.2) {
    events.push({ type: 'speeding', value: Number(speedKmh.toFixed(2)), threshold: 90 });
  }
  if (Math.random() < 0.08) {
    events.push({ type: 'harsh_brake', value: Number((4 + Math.random() * 6).toFixed(2)), threshold: 4.5 });
  }
  if (Math.random() < 0.08) {
    events.push({ type: 'harsh_accel', value: Number((3 + Math.random() * 5).toFixed(2)), threshold: 3.8 });
  }
  if (Math.random() < 0.05) {
    events.push({ type: 'harsh_corner', value: Number((2.5 + Math.random() * 4).toFixed(2)), threshold: 2.8 });
  }
  if (Math.random() < 0.005) {
    events.push({ type: 'crash', value: Number((7 + Math.random() * 6).toFixed(2)), threshold: 8 });
  }

  return events;
}

function maybeBuildDtc() {
  if (Math.random() > 0.04) {
    return undefined;
  }

  const samples = [
    { code: 'P0420', description: 'Catalyst System Efficiency Below Threshold', severity: 'medium' },
    { code: 'P0117', description: 'Engine Coolant Temperature Circuit Low', severity: 'critical' },
    { code: 'P0562', description: 'System Voltage Low', severity: 'medium' },
  ];

  return [samples[Math.floor(Math.random() * samples.length)]];
}

async function sendTelemetry(vehicleId, s) {
  const headingDelta = (Math.random() - 0.5) * 18;
  s.headingDeg = (s.headingDeg + headingDelta + 360) % 360;

  const speedDelta = (Math.random() - 0.5) * 2.2;
  s.speedMps = clamp(s.speedMps + speedDelta, 0, 31);

  const distanceM = s.speedMps * (INTERVAL_MS / 1000);
  const headingRad = (s.headingDeg * Math.PI) / 180;
  const dLat = (distanceM / 111320) * Math.cos(headingRad);
  const dLon = (distanceM / (111320 * Math.cos((s.lat * Math.PI) / 180))) * Math.sin(headingRad);

  s.lat += dLat;
  s.lon += dLon;

  s.rpm = Math.round(clamp(s.rpm + (Math.random() - 0.5) * 120, 650, 2600));
  s.fuelLevelPct = clamp(s.fuelLevelPct - Math.random() * 0.03, 3, 100);
  s.coolantTemp = clamp(s.coolantTemp + (Math.random() - 0.5) * 0.8, 70, 105);
  s.voltage = clamp(s.voltage + (Math.random() - 0.5) * 0.08, 11.8, 14.8);
  s.odometerKm += distanceM / 1000;

  const payload = {
    vehicleId,
    latitude: Number(s.lat.toFixed(7)),
    longitude: Number(s.lon.toFixed(7)),
    recordedAt: new Date().toISOString(),
    speedMps: Number(s.speedMps.toFixed(3)),
    headingDeg: Number(s.headingDeg.toFixed(2)),
    ignition: s.speedMps > 0.2,
    rpm: s.rpm,
    fuelLevelPct: Number(s.fuelLevelPct.toFixed(2)),
    coolantTemp: Number(s.coolantTemp.toFixed(1)),
    voltage: Number(s.voltage.toFixed(1)),
    odometerKm: Number(s.odometerKm.toFixed(3)),
    events: maybeBuildEvents(s.speedMps),
    dtc: maybeBuildDtc(),
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-device-ingest-token': DEVICE_INGEST_TOKEN,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${body}`);
  }

  const response = await res.json();
  return {
    status: res.status,
    driverId: response.driverId,
    tripId: response.tripId,
  };
}

console.log(`[telematics-sim] Endpoint: ${ENDPOINT}`);
console.log(`[telematics-sim] Vehicles: ${VEHICLE_IDS.join(', ')}`);
console.log(`[telematics-sim] Interval: ${INTERVAL_MS}ms`);

let timer = null;

async function tick() {
  for (const vehicleId of VEHICLE_IDS) {
    const s = stateByVehicle.get(vehicleId);
    if (!s) continue;

    try {
      const result = await sendTelemetry(vehicleId, s);
      console.log(
        `[telematics-sim] ok vehicle=${vehicleId} driver=${result.driverId ?? '-'} trip=${result.tripId ?? '-'} status=${result.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[telematics-sim] fail vehicle=${vehicleId} error=${message}`);
    }
  }
}

void tick();
timer = setInterval(() => {
  void tick();
}, INTERVAL_MS);

function shutdown() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log('[telematics-sim] stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
