#!/usr/bin/env node
/**
 * Telematics fleet seed — gives EVERY active vehicle of a tenant a telematics
 * device, live telemetry and trip history, so the Telematik screens
 * (Fahrzeug-Gesundheit, Fahrer-Scores, Live-Tracking) show the whole fleet
 * instead of a handful of vehicles.
 *
 * Covers: Device (online/silent/offline mix), VehicleTelemetryLatest, VehicleDtc
 * (active + cleared), FleetMaintenanceRule, FleetTrip + location points +
 * driving events, and DriverLocationLatest for live tracking.
 *
 * Idempotent: id-bearing rows use a fixed `demo-tel-*` id and the previous run
 * is purged up front; latest-state rows (telemetry/location, keyed by
 * vehicleId/driverId) are upserted.
 *
 * Usage: node scripts/seed-telematics-fleet.mjs
 *   SEED_TENANT_ID=<id>          target tenant   (default: default-tenant)
 *   SEED_TELEMATICS_DAYS=<n>     trip history    (default: 28 — driver score period)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = process.env.SEED_TENANT_ID ?? 'default-tenant';
const DAYS = Number(process.env.SEED_TELEMATICS_DAYS ?? 28);
const P = 'demo-tel-';

// Telematics corridors around the Berlin depots used by the assignment seed.
const CORRIDORS = [
  { name: 'Berlin → Hamburg', lat: 52.52, lng: 13.405, dLat: 0.62, dLng: -1.4 },
  { name: 'Berlin → Leipzig', lat: 52.48, lng: 13.36, dLat: -0.85, dLng: -1.0 },
  { name: 'Berlin → Dresden', lat: 52.5, lng: 13.42, dLat: -1.4, dLng: 0.32 },
  { name: 'Berlin → Hannover', lat: 52.51, lng: 13.38, dLat: -0.13, dLng: -3.6 },
  { name: 'Berlin Stadtverteiler', lat: 52.51, lng: 13.4, dLat: 0.12, dLng: 0.18 },
  { name: 'Berlin → Potsdam', lat: 52.47, lng: 13.35, dLat: -0.08, dLng: -0.29 },
];

// Active fault codes: index into the vehicle list → code.
const ACTIVE_DTC = [
  { at: 3, code: 'P0217', description: 'Motorkühlmitteltemperatur zu hoch', severity: 'critical', daysAgo: 2 },
  { at: 9, code: 'P0562', description: 'Bordspannung zu niedrig', severity: 'critical', daysAgo: 1 },
  { at: 14, code: 'P0401', description: 'AGR-Durchfluss unzureichend', severity: 'medium', daysAgo: 5 },
  { at: 21, code: 'P0299', description: 'Turbolader Unterdruck', severity: 'medium', daysAgo: 8 },
  { at: 27, code: 'P20EE', description: 'SCR-System NOx-Effizienz zu gering', severity: 'medium', daysAgo: 4 },
  { at: 33, code: 'P2463', description: 'Rußpartikelfilter Beladung zu hoch', severity: 'medium', daysAgo: 11 },
  { at: 38, code: 'P0087', description: 'Kraftstoffdruck zu niedrig', severity: 'critical', daysAgo: 3 },
];
// Repaired faults — shown in the history, not in the open list.
const CLEARED_DTC = [
  { at: 1, code: 'P0135', description: 'Lambdasonde Heizkreis', daysAgo: 22, clearedDaysAgo: 19 },
  { at: 6, code: 'P0420', description: 'Katalysator Wirkungsgrad', daysAgo: 26, clearedDaysAgo: 21 },
  { at: 12, code: 'P0263', description: 'Zylinder 1 Beitrag/Balance', daysAgo: 18, clearedDaysAgo: 15 },
  { at: 18, code: 'P2002', description: 'DPF Wirkungsgrad unter Grenzwert', daysAgo: 15, clearedDaysAgo: 9 },
  { at: 24, code: 'P0102', description: 'Luftmassenmesser Signal zu niedrig', daysAgo: 12, clearedDaysAgo: 7 },
  { at: 30, code: 'P0504', description: 'Bremslichtschalter Plausibilität', daysAgo: 9, clearedDaysAgo: 5 },
];

const MAINTENANCE_RULES = [
  { name: 'Ölwechsel', intervalKm: 40000, intervalDays: 365 },
  { name: 'Bremsenprüfung', intervalKm: 60000, intervalDays: 180 },
  { name: 'Reifenwechsel', intervalKm: null, intervalDays: 180 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dayAt(offset, hours = 0, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** UTC midnight — required for @db.Date fields. */
function dateAt(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000);
}

const dec = (value) => Number(Number(value).toFixed(3));

async function insertAll(delegate, rows, label, counters) {
  for (let i = 0; i < rows.length; i += 500) {
    const { count } = await delegate.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
    counters[label] = (counters[label] ?? 0) + count;
  }
}

async function purgePreviousRun() {
  const where = (suffix) => ({ id: { startsWith: `${P}${suffix}` } });
  // Location points, driving events and purpose logs cascade with the trip.
  await prisma.fleetTrip.deleteMany({ where: where('trip-') });
  await prisma.vehicleDtc.deleteMany({ where: where('dtc-') });
  await prisma.fleetMaintenanceRule.deleteMany({ where: where('rule-') });
  await prisma.device.deleteMany({ where: where('dev-') });
}

async function main() {
  const [drivers, vehicles] = await Promise.all([
    prisma.driver.findMany({
      where: { tenantId: TENANT_ID, status: 'active' },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { employeeNumber: 'asc' },
    }),
    prisma.vehicle.findMany({
      where: { tenantId: TENANT_ID, deletedAt: null, status: { not: 'inactive' } },
      select: { id: true, plateNumber: true, brand: true, model: true },
      orderBy: { plateNumber: 'asc' },
    }),
  ]);

  if (drivers.length < 5 || vehicles.length < 5) {
    throw new Error(
      `[seed-telematics-fleet] tenant ${TENANT_ID} needs at least 5 active drivers and vehicles ` +
        `(found ${drivers.length} drivers, ${vehicles.length} vehicles). Run "npm run seed" first.`,
    );
  }

  await purgePreviousRun();

  const random = rng(9311);
  const counters = {};

  // ── 1. Devices — one per vehicle, mixed connectivity state ───────────────
  const existingDevices = await prisma.device.findMany({
    where: { tenantId: TENANT_ID, vehicleId: { not: null } },
    select: { vehicleId: true },
  });
  const vehiclesWithDevice = new Set(existingDevices.map((d) => d.vehicleId));

  /** Matches the service thresholds: online < 5 min, silent < 30 min, else offline. */
  const deviceState = (index) => {
    if (index % 17 === 5) return 'offline';
    if (index % 11 === 3) return 'silent';
    return 'online';
  };
  const lastSeenFor = (index) => {
    const state = deviceState(index);
    if (state === 'offline') return dayAt(-(1 + (index % 3)), 18, 40);
    if (state === 'silent') return minutesAgo(7 + (index % 5) * 4);
    return minutesAgo(1 + (index % 4));
  };

  const deviceRows = [];
  vehicles.forEach((vehicle, i) => {
    if (vehiclesWithDevice.has(vehicle.id)) return;
    deviceRows.push({
      id: `${P}dev-${i}`,
      tenantId: TENANT_ID,
      imei: `359339090${String(i + 1).padStart(6, '0')}`,
      model: i % 3 === 0 ? 'FMC650' : 'FMC130',
      vehicleId: vehicle.id,
      lastSeenAt: lastSeenFor(i),
    });
  });
  await insertAll(prisma.device, deviceRows, 'devices', counters);

  // ── 2. Live telemetry snapshot for every vehicle ─────────────────────────
  const dtcVehicleIndices = new Set(ACTIVE_DTC.map((row) => row.at));
  let telemetry = 0;
  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];
    const state = deviceState(i);
    const recordedAt = lastSeenFor(i);
    const overheating = dtcVehicleIndices.has(i) && ACTIVE_DTC.find((d) => d.at === i)?.code === 'P0217';
    const lowVoltage = dtcVehicleIndices.has(i) && ACTIVE_DTC.find((d) => d.at === i)?.code === 'P0562';
    const data = {
      tenantId: TENANT_ID,
      ignition: state === 'online' && i % 4 !== 0,
      rpm: state === 'online' ? 650 + Math.floor(random() * 1200) : 0,
      fuelLevelPct: dec(i % 9 === 0 ? 8 + random() * 12 : 32 + random() * 58),
      coolantTemp: dec(overheating ? 104 + random() * 4 : 79 + random() * 17),
      voltage: dec(lowVoltage ? 11.4 + random() * 0.3 : 12.2 + random() * 0.7),
      odometerKm: dec(64000 + i * 8450 + random() * 4000),
      recordedAt,
    };
    await prisma.vehicleTelemetryLatest.upsert({
      where: { vehicleId: vehicle.id },
      update: data,
      create: { vehicleId: vehicle.id, ...data },
    });
    telemetry += 1;
  }
  counters.telemetryLatest = telemetry;

  // ── 3. Fault codes — open and already repaired ───────────────────────────
  const dtcRows = [];
  ACTIVE_DTC.forEach((spec, i) => {
    const vehicle = vehicles[spec.at % vehicles.length];
    dtcRows.push({
      id: `${P}dtc-active-${i}`,
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      code: spec.code,
      description: spec.description,
      severity: spec.severity,
      occurredAt: dayAt(-spec.daysAgo, 9 + (i % 8), 15),
    });
  });
  CLEARED_DTC.forEach((spec, i) => {
    const vehicle = vehicles[spec.at % vehicles.length];
    dtcRows.push({
      id: `${P}dtc-cleared-${i}`,
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      code: spec.code,
      description: spec.description,
      severity: 'medium',
      occurredAt: dayAt(-spec.daysAgo, 8 + (i % 6), 30),
      clearedAt: dayAt(-spec.clearedDaysAgo, 16, 0),
    });
  });
  await insertAll(prisma.vehicleDtc, dtcRows, 'dtc', counters);

  // ── 4. Maintenance rules for vehicles that have none ─────────────────────
  const existingRules = await prisma.fleetMaintenanceRule.findMany({
    where: { tenantId: TENANT_ID },
    select: { vehicleId: true },
  });
  const vehiclesWithRule = new Set(existingRules.map((r) => r.vehicleId));
  const ruleRows = [];
  vehicles.forEach((vehicle, i) => {
    if (vehiclesWithRule.has(vehicle.id)) return;
    const odometer = 64000 + i * 8450;
    MAINTENANCE_RULES.forEach((rule, r) => {
      // Every 6th vehicle is deliberately close to its service interval.
      const kmMargin = i % 6 === 0 ? rule.intervalKm - 300 : rule.intervalKm - 12000 - (i % 5) * 1500;
      ruleRows.push({
        id: `${P}rule-${i}-${r}`,
        tenantId: TENANT_ID,
        vehicleId: vehicle.id,
        name: rule.name,
        intervalKm: rule.intervalKm === null ? null : dec(rule.intervalKm),
        intervalDays: rule.intervalDays,
        lastDoneAtKm: rule.intervalKm === null ? null : dec(Math.max(0, odometer - kmMargin)),
        lastDoneAtDate: dateAt(-(rule.intervalDays - (i % 6 === 0 ? 4 : 90))),
      });
    });
  });
  await insertAll(prisma.fleetMaintenanceRule, ruleRows, 'maintenanceRules', counters);

  // ── 5. Trip history for the whole fleet ──────────────────────────────────
  const tripRows = [];
  const pointRows = [];
  const eventRows = [];

  for (let v = 0; v < vehicles.length; v += 1) {
    const vehicle = vehicles[v];
    const driver = drivers[v % drivers.length];
    // Three vehicles stay in the workshop — no telematics history at all.
    if (v % 16 === 7) continue;
    const odoBase = 64000 + v * 8450;
    // Risk profile drives how many harsh events this driver produces.
    const riskFactor = v % 9 === 0 ? 2.4 : v % 5 === 0 ? 1.5 : 0.6;

    for (let offset = DAYS; offset >= 1; offset -= 1) {
      const date = dayAt(-offset);
      if (date.getDay() === 0) continue; // Sundays off
      if (date.getDay() === 6 && v % 4 !== 0) continue; // skeleton crew on Saturdays
      const tripsToday = 1 + Math.floor(random() * 3);

      for (let t = 0; t < tripsToday; t += 1) {
        const tripId = `${P}trip-${v}-${offset}-${t}`;
        const corridor = CORRIDORS[(v + t) % CORRIDORS.length];
        const startedAt = dayAt(-offset, 5 + t * 4 + Math.floor(random() * 2), Math.floor(random() * 55));
        const durationS = 40 * 60 + Math.floor(random() * 150 * 60);
        const endedAt = new Date(startedAt.getTime() + durationS * 1000);
        const distanceKm = 22 + random() * 210;
        const idleS = Math.floor(durationS * (0.03 + random() * 0.14));
        const avgSpeedKmh = distanceKm / (durationS / 3600);
        const odoStart = odoBase - (DAYS - offset) * 140;
        const eventBudget = Math.round(random() * 3 * riskFactor);
        const score = Math.max(38, Math.min(99, 96 - eventBudget * 7 - random() * 6));

        tripRows.push({
          id: tripId,
          tenantId: TENANT_ID,
          vehicleId: vehicle.id,
          driverId: driver.id,
          source: v % 7 === 0 ? 'phone' : 'device',
          purpose: t === 0 && v % 11 === 0 ? 'commute' : 'business',
          purposeNote: corridor.name,
          odoStartKm: dec(odoStart),
          odoEndKm: dec(odoStart + distanceKm),
          startedAt,
          endedAt,
          distanceKm: dec(distanceKm),
          durationS,
          avgSpeedKmh: dec(avgSpeedKmh),
          maxSpeedKmh: dec(Math.min(132, avgSpeedKmh + 22 + random() * 28)),
          idleS,
          score: dec(score),
          hasDataGap: (v + offset) % 37 === 0,
          status: 'closed',
        });

        const pointCount = 8 + Math.floor(random() * 5);
        for (let p = 0; p < pointCount; p += 1) {
          const frac = p / (pointCount - 1);
          pointRows.push({
            tripId,
            recordedAt: new Date(startedAt.getTime() + Math.round(frac * durationS) * 1000),
            latitude: dec(corridor.lat + frac * corridor.dLat + (random() - 0.5) * 0.02),
            longitude: dec(corridor.lng + frac * corridor.dLng + (random() - 0.5) * 0.02),
            speedKmh: p === 0 || p === pointCount - 1 ? 0 : 38 + random() * 62,
            headingDeg: Math.floor(random() * 360),
            accuracyM: 4 + Math.floor(random() * 14),
            source: v % 7 === 0 ? 'phone' : 'device',
          });
        }

        for (let e = 0; e < eventBudget; e += 1) {
          const type = ['speeding', 'harsh_brake', 'harsh_accel', 'harsh_corner'][(v + t + e) % 4];
          const frac = random();
          eventRows.push({
            id: `${P}ev-${v}-${offset}-${t}-${e}`,
            tenantId: TENANT_ID,
            tripId,
            driverId: driver.id,
            type,
            occurredAt: new Date(startedAt.getTime() + Math.round(frac * durationS) * 1000),
            latitude: dec(corridor.lat + frac * corridor.dLat),
            longitude: dec(corridor.lng + frac * corridor.dLng),
            value: dec(type === 'speeding' ? 96 + random() * 42 : 3.2 + random() * 4.5),
            threshold: dec(type === 'speeding' ? 80 : 3),
          });
        }
      }
    }
  }

  await insertAll(prisma.fleetTrip, tripRows, 'trips', counters);
  await insertAll(prisma.fleetTripLocationPoint, pointRows, 'locationPoints', counters);
  await insertAll(prisma.fleetDrivingEvent, eventRows, 'drivingEvents', counters);

  // ── 6. Live positions for the tracking map ───────────────────────────────
  let positions = 0;
  for (let i = 0; i < drivers.length; i += 1) {
    const driver = drivers[i];
    const vehicle = vehicles[i % vehicles.length];
    const corridor = CORRIDORS[i % CORRIDORS.length];
    const frac = 0.15 + random() * 0.7;
    // Most drivers report live, a few are stale so the "offline" filter has data.
    const recordedAt = i % 9 === 4 ? minutesAgo(90 + i * 3) : minutesAgo(1 + (i % 5));
    const data = {
      tenantId: TENANT_ID,
      latitude: dec(corridor.lat + frac * corridor.dLat + (random() - 0.5) * 0.03),
      longitude: dec(corridor.lng + frac * corridor.dLng + (random() - 0.5) * 0.03),
      accuracyM: 5 + Math.floor(random() * 12),
      speedMps: i % 6 === 0 ? 0 : dec(8 + random() * 18),
      headingDeg: Math.floor(random() * 360),
      altitudeM: dec(34 + random() * 180),
      recordedAt,
      source: i % 7 === 0 ? 'mobile' : 'telematics',
      vehicleId: vehicle.id,
    };
    await prisma.driverLocationLatest.upsert({
      where: { driverId: driver.id },
      update: data,
      create: { driverId: driver.id, ...data },
    });
    positions += 1;
  }
  counters.livePositions = positions;

  console.log(
    `[seed-telematics-fleet] tenant=${TENANT_ID} vehicles=${vehicles.length} drivers=${drivers.length} days=${DAYS}`,
  );
  console.log('[seed-telematics-fleet] done:', counters);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
