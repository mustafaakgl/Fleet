#!/usr/bin/env node
/**
 * Realistic 50-vehicle mock fleet for visual QA (separate tenant from tacho-demo golden seed).
 * DDD files use placeholder storedPath + signatureValid=true (no fixture binaries).
 *
 * Usage: node scripts/seed-mock-fleet.mjs [--seed 42]
 */
import 'dotenv/config';
import {
  AssignmentStatus,
  DeviceModel,
  DddFileSource,
  DddFileType,
  FleetTelemetrySource,
  FleetTripStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  TachoDownloadSubject,
  TachoWorkState,
} from '@prisma/client';
import { createSeededRng, seededInt } from './lib/seeded-rng.mjs';

const prisma = new PrismaClient();

const TENANT_SLUG = 'mock-fleet';
const TENANT_ID = 'mock-fleet-tenant';
const WEEKS_HISTORY = 12;
const TRIP_DAYS = 14;
const FUEL_DAYS = 14;
const SCORE_CONFIG = {
  scoreBase: 100,
  scoreSpeedingPer100Km: 3,
  scoreHarshBrakePer100Km: 2,
  scoreHarshAccelPer100Km: 2,
  scoreIdleRatioThreshold: 0.15,
  scoreIdlePenalty: 5,
};

function parseArgs(argv) {
  let seed = 42;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--seed') seed = Number(argv[++i]);
  }
  return { seed };
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalRandom(rng, mean, stdDev) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function pickOne(rng, items) {
  return items[seededInt(rng, 0, items.length - 1)];
}

function pickWeighted(rng, items, weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function dec(value) {
  return new Prisma.Decimal(Number(value).toFixed(3));
}

function computeTripScore(distanceKm, durationS, idleS, events) {
  const distance = Math.max(distanceKm, 0.001);
  const per100 = (count) => (count / distance) * 100;
  let score = SCORE_CONFIG.scoreBase;
  score -= SCORE_CONFIG.scoreSpeedingPer100Km * per100(events.speeding);
  score -= SCORE_CONFIG.scoreHarshBrakePer100Km * per100(events.harsh_brake);
  score -= SCORE_CONFIG.scoreHarshAccelPer100Km * per100(events.harsh_accel);
  const idleRatio = durationS > 0 ? idleS / durationS : 0;
  if (idleRatio > SCORE_CONFIG.scoreIdleRatioThreshold) {
    score -= SCORE_CONFIG.scoreIdlePenalty;
  }
  return Number(clamp(score, 0, 100).toFixed(2));
}

async function createManyBatched(model, rows, batchSize = 800) {
  for (let i = 0; i < rows.length; i += batchSize) {
    await model.createMany({ data: rows.slice(i, i + batchSize), skipDuplicates: true });
  }
}

async function purgeTenantData(tenantId) {
  await prisma.tachoInfringement.deleteMany({ where: { tenantId } });
  await prisma.tachoActivity.deleteMany({ where: { tenantId } });
  await prisma.fleetDrivingEvent.deleteMany({ where: { tenantId } });
  await prisma.fleetTrip.deleteMany({ where: { tenantId } });
  await prisma.fleetFuelEntry.deleteMany({ where: { tenantId } });
  await prisma.fleetMaintenanceRule.deleteMany({ where: { tenantId } });
  await prisma.vehicleDtc.deleteMany({ where: { tenantId } });
  await prisma.vehicleTelemetryLatest.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.dddFile.deleteMany({ where: { tenantId } });
  await prisma.tachoDownloadSchedule.deleteMany({ where: { tenantId } });
  await prisma.device.deleteMany({ where: { tenantId } });
  await prisma.assignment.deleteMany({ where: { tenantId } });
  await prisma.vehicle.updateMany({ where: { tenantId }, data: { currentDriverId: null } });
  await prisma.vehicle.deleteMany({ where: { tenantId } });
  await prisma.driver.deleteMany({ where: { tenantId } });
  await prisma.company.deleteMany({ where: { tenantId } });
}

const GERMAN_FIRST = ['Hans', 'Klaus', 'Stefan', 'Anna', 'Petra', 'Thomas', 'Markus', 'Julia', 'Felix', 'Laura', 'Michael', 'Sabine'];
const GERMAN_LAST = ['Müller', 'Schmidt', 'Weber', 'Fischer', 'Wagner', 'Becker', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Bauer', 'Wolf'];
const TURKISH_FIRST = ['Mehmet', 'Ahmet', 'Mustafa', 'Emre', 'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Burak', 'Cem', 'Deniz', 'Selin'];
const TURKISH_LAST = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Koç', 'Polat'];

const TRUCK_MODELS = [
  { brand: 'Mercedes', model: 'Actros' },
  { brand: 'MAN', model: 'TGX' },
  { brand: 'Volvo', model: 'FH' },
  { brand: 'Scania', model: 'R450' },
];
const VAN_MODELS = [
  { brand: 'Mercedes', model: 'Sprinter' },
  { brand: 'VW', model: 'Crafter' },
  { brand: 'Ford', model: 'Transit' },
];

const INFRINGEMENT_TYPES = [
  { type: 'insufficient_break', weight: 35, critical: false },
  { type: 'daily_driving_exceeded', weight: 25, critical: true },
  { type: 'insufficient_daily_rest', weight: 20, critical: true },
  { type: 'exceeded_weekly_driving', weight: 10, critical: true },
  { type: 'exceeded_two_week_driving', weight: 5, critical: true },
  { type: 'insufficient_weekly_rest', weight: 3, critical: false },
  { type: 'driving_without_card', weight: 2, critical: false },
];

function buildDriverNames(rng) {
  const names = [];
  for (let i = 0; i < 31; i += 1) {
    names.push({
      firstName: pickOne(rng, GERMAN_FIRST),
      lastName: pickOne(rng, GERMAN_LAST),
    });
  }
  for (let i = 0; i < 31; i += 1) {
    names.push({
      firstName: pickOne(rng, TURKISH_FIRST),
      lastName: pickOne(rng, TURKISH_LAST),
    });
  }
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = seededInt(rng, 0, i);
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, 62);
}

function germanPlate(rng, index) {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const a = letters[seededInt(rng, 0, letters.length - 1)];
  const b = letters[seededInt(rng, 0, letters.length - 1)];
  const num = String(1000 + ((index * 73 + seededInt(rng, 0, 8999)) % 9000));
  return `M-${a}${b} ${num}`;
}

function paretoWeights(count, alpha = 1.16) {
  const raw = Array.from({ length: count }, (_, i) => 1 / (i + 1) ** alpha);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
}

function weekInfringementTargets(rng) {
  const targets = [];
  for (let w = 0; w < WEEKS_HISTORY; w += 1) {
    const t = w / Math.max(WEEKS_HISTORY - 1, 1);
    const base = 12 * (1 - t) + 4 * t;
    const noise = (rng() - 0.5) * 3;
    targets.push(Math.max(2, Math.round(base + noise)));
  }
  const sum = targets.reduce((a, b) => a + b, 0);
  targets[targets.length - 1] += 90 - sum;
  return targets.map((n) => Math.max(1, n));
}

function buildDriverProfiles(rng, drivers, vehicleByDriverId) {
  const lowKmIds = new Set(drivers.slice(0, 3).map((d) => d.id));
  const profiles = new Map();

  for (const driver of drivers) {
    const vehicle = vehicleByDriverId.get(driver.id);
    const isTruck = vehicle?.category === 'truck';
    const isLowKm = lowKmIds.has(driver.id);

    if (isLowKm) {
      profiles.set(driver.id, {
        targetScore: null,
        distanceKm: seededInt(rng, 42, 88),
        speedingPer100: 0,
        brakePer100: 0,
        accelPer100: 0,
        idleMinPerDay: isTruck ? 18 : 10,
        isLowKm: true,
      });
      continue;
    }

    const targetScore = clamp(normalRandom(rng, 78, 10), 35, 98);
    const severity = (100 - targetScore) / 32;
    profiles.set(driver.id, {
      targetScore,
      distanceKm: seededInt(rng, 900, 2800),
      speedingPer100: severity * (1.5 + rng() * 5.5),
      brakePer100: severity * (0.6 + rng() * 3.8),
      accelPer100: severity * (0.3 + rng() * 2.4),
      idleMinPerDay: clamp(normalRandom(rng, isTruck ? 22 : 12, isTruck ? 6 : 4), 4, 55),
      isLowKm: false,
    });
  }

  return { profiles, lowKmIds };
}

async function main() {
  const started = Date.now();
  const { seed } = parseArgs(process.argv);
  const rng = createSeededRng(seed);
  const today = startOfDay();
  const now = new Date();

  const creator = await prisma.user.findFirst({ select: { id: true } });
  if (!creator) throw new Error('No users in database — run prisma db seed first');

  await purgeTenantData(TENANT_ID);

  await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: 'Mock Fleet (Visual QA)' },
    create: {
      id: TENANT_ID,
      slug: TENANT_SLUG,
      name: 'Mock Fleet (Visual QA)',
      status: 'active',
    },
  });

  const company = await prisma.company.create({
    data: {
      tenantId: TENANT_ID,
      name: 'Mock Fleet Logistics GmbH',
      email: 'mock-fleet@example.local',
    },
  });

  const driverNames = buildDriverNames(rng);
  const drivers = [];
  for (let i = 0; i < 62; i += 1) {
    const name = driverNames[i];
    const driver = await prisma.driver.create({
      data: {
        tenantId: TENANT_ID,
        employeeNumber: `MF-D-${String(i + 1).padStart(3, '0')}`,
        firstName: name.firstName,
        lastName: name.lastName,
        status: 'active',
      },
    });
    drivers.push(driver);
  }

  const vehicles = [];
  const deviceStatuses = [];
  for (let i = 0; i < 50; i += 1) {
    const isTruck = i < 35;
    const spec = isTruck ? pickOne(rng, TRUCK_MODELS) : pickOne(rng, VAN_MODELS);
    const driver = drivers[i];
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: TENANT_ID,
        plateNumber: germanPlate(rng, i + 1),
        internalCode: `MF-V-${String(i + 1).padStart(3, '0')}`,
        brand: spec.brand,
        model: spec.model,
        category: isTruck ? 'truck' : 'transporter',
        currentDriverId: driver.id,
        avgConsumptionLPer100Km: dec(isTruck ? 30 : 10),
        initialOdometerKm: dec(80000 + seededInt(rng, 0, 270000)),
      },
    });
    vehicles.push({ ...vehicle, isTruck, driverId: driver.id });

    let status = 'online';
    if (i >= 48) status = 'offline';
    else if (i >= 45) status = 'silent';
    deviceStatuses.push(status);
  }

  const vehicleByDriverId = new Map(vehicles.map((v) => [v.driverId, v]));
  const { profiles: driverProfiles, lowKmIds } = buildDriverProfiles(rng, drivers, vehicleByDriverId);

  const devices = [];
  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];
    const status = deviceStatuses[i];
    let lastSeenAt = addMinutes(now, -seededInt(rng, 1, 4));
    if (status === 'silent') lastSeenAt = addMinutes(now, -(120 + seededInt(rng, 0, 240)));
    if (status === 'offline') lastSeenAt = addDays(now, -seededInt(rng, 1, 3));

    const device = await prisma.device.create({
      data: {
        tenantId: TENANT_ID,
        imei: `359339081${String(i + 1).padStart(6, '0')}`,
        model: vehicle.isTruck ? DeviceModel.FMC650 : DeviceModel.FMC130,
        vehicleId: vehicle.id,
        lastSeenAt,
      },
    });
    devices.push({ ...device, status });
  }

  const fuelTheftVehicleIds = new Set([vehicles[12].id, vehicles[27].id]);
  const criticalDtcVehicleIds = new Set([vehicles[5].id, vehicles[18].id]);
  const clearedDtcVehicleIds = vehicles.slice(40, 48).map((v) => v.id);

  const telemetryRows = [];
  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];
    const device = devices[i];
    const odometer = Number(vehicle.initialOdometerKm) + seededInt(rng, 5000, 45000);
    const isCritical = criticalDtcVehicleIds.has(vehicle.id);
    const isLowVoltage = i === 7 || i === 33;
    telemetryRows.push({
      vehicleId: vehicle.id,
      tenantId: TENANT_ID,
      ignition: device.status === 'silent' ? true : device.status === 'online',
      rpm: device.status === 'online' ? seededInt(rng, 650, 1800) : 0,
      fuelLevelPct: dec(
        fuelTheftVehicleIds.has(vehicle.id) ? seededInt(rng, 18, 28) : seededInt(rng, 35, 92),
      ),
      coolantTemp: dec(isCritical ? seededInt(rng, 104, 108) : seededInt(rng, 82, 96)),
      voltage: dec(isLowVoltage ? 11.5 + rng() * 0.2 : 12.1 + rng() * 0.6),
      odometerKm: dec(odometer),
      recordedAt: device.lastSeenAt ?? now,
    });
    vehicle._odometerKm = odometer;
  }
  await prisma.vehicleTelemetryLatest.createMany({ data: telemetryRows });

  const dtcRows = [];
  const activeDtcSpecs = [
    { vehicleIndex: 5, code: 'P0217', description: 'Engine coolant temperature high', critical: true },
    { vehicleIndex: 18, code: 'P0562', description: 'System voltage low', critical: true },
    { vehicleIndex: 2, code: 'P0401', description: 'EGR flow insufficient', critical: false },
    { vehicleIndex: 11, code: 'P0299', description: 'Turbo underboost', critical: false },
    { vehicleIndex: 22, code: 'P20EE', description: 'SCR NOx efficiency', critical: false },
    { vehicleIndex: 31, code: 'P2463', description: 'DPF soot accumulation', critical: false },
  ];
  for (const spec of activeDtcSpecs) {
    dtcRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicles[spec.vehicleIndex].id,
      code: spec.code,
      description: spec.description,
      severity: spec.critical ? 'critical' : 'medium',
      occurredAt: addDays(now, -seededInt(rng, 1, 10)),
    });
  }
  for (const vehicleId of clearedDtcVehicleIds) {
    dtcRows.push({
      tenantId: TENANT_ID,
      vehicleId,
      code: `P${seededInt(rng, 1000, 2999)}`,
      description: 'Historical fault (cleared)',
      severity: 'medium',
      occurredAt: addDays(now, -seededInt(rng, 10, 40)),
      clearedAt: addDays(now, -seededInt(rng, 1, 8)),
    });
  }
  await prisma.vehicleDtc.createMany({ data: dtcRows });

  const dddRows = [];
  const scheduleRows = [];

  const cardAgeBuckets = [
    { drivers: drivers.slice(0, 54), min: 3, max: 18 },
    { drivers: drivers.slice(54, 59), min: 22, max: 27 },
    { drivers: drivers.slice(59, 62), min: 29, max: 35 },
  ];

  for (const bucket of cardAgeBuckets) {
    for (const driver of bucket.drivers) {
      const days = seededInt(rng, bucket.min, bucket.max);
      const lastDownloadAt = addDays(today, -days);
      const sha = `mock-fleet-card-${driver.id}-sha256`;
      dddRows.push({
        tenantId: TENANT_ID,
        driverId: driver.id,
        fileType: DddFileType.card,
        source: DddFileSource.remote,
        capturedAt: lastDownloadAt,
        storedPath: `uploads/tachograph-ddd/mock-fleet/card-${driver.employeeNumber}.ddd`,
        sizeBytes: 2048,
        sha256: sha,
        signatureValid: true,
      });
      scheduleRows.push({
        tenantId: TENANT_ID,
        subject: TachoDownloadSubject.driver_card,
        driverId: driver.id,
        intervalDays: 28,
        lastDownloadAt,
        nextDueAt: addDays(lastDownloadAt, 28),
        enabled: true,
      });
    }
  }

  const vuCritical = vehicles.slice(0, 2);
  const vuNormal = vehicles.slice(2);
  for (const vehicle of vuCritical) {
    const days = seededInt(rng, 80, 95);
    const lastDownloadAt = addDays(today, -days);
    const sha = `mock-fleet-vu-${vehicle.id}-sha256`;
    dddRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      fileType: DddFileType.vu,
      source: DddFileSource.remote,
      capturedAt: lastDownloadAt,
      storedPath: `uploads/tachograph-ddd/mock-fleet/vu-${vehicle.internalCode}.ddd`,
      sizeBytes: 4096,
      sha256: sha,
      signatureValid: true,
    });
    scheduleRows.push({
      tenantId: TENANT_ID,
      subject: TachoDownloadSubject.vehicle_unit,
      vehicleId: vehicle.id,
      intervalDays: 90,
      lastDownloadAt,
      nextDueAt: addDays(lastDownloadAt, 90),
      enabled: true,
    });
  }
  for (const vehicle of vuNormal) {
    const days = seededInt(rng, 20, 60);
    const lastDownloadAt = addDays(today, -days);
    const sha = `mock-fleet-vu-${vehicle.id}-sha256`;
    dddRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      fileType: DddFileType.vu,
      source: DddFileSource.remote,
      capturedAt: lastDownloadAt,
      storedPath: `uploads/tachograph-ddd/mock-fleet/vu-${vehicle.internalCode}.ddd`,
      sizeBytes: 4096,
      sha256: sha,
      signatureValid: true,
    });
    scheduleRows.push({
      tenantId: TENANT_ID,
      subject: TachoDownloadSubject.vehicle_unit,
      vehicleId: vehicle.id,
      intervalDays: 90,
      lastDownloadAt,
      nextDueAt: addDays(lastDownloadAt, 90),
      enabled: true,
    });
  }

  await prisma.dddFile.createMany({ data: dddRows, skipDuplicates: true });
  await prisma.tachoDownloadSchedule.createMany({ data: scheduleRows });

  const tachoRows = [];
  for (const vehicle of vehicles) {
    const driverId = vehicle.driverId;
    for (let w = 0; w < WEEKS_HISTORY; w += 1) {
      const weekStart = addDays(today, -(WEEKS_HISTORY - w) * 7);
      weekStart.setHours(6, 0, 0, 0);
      const weeklyHours = vehicle.isTruck
        ? clamp(normalRandom(rng, 46, 5), 34, 56)
        : clamp(normalRandom(rng, 38, 4), 28, 46);
      const drivingS = Math.round(weeklyHours * 3600);
      tachoRows.push({
        tenantId: TENANT_ID,
        vehicleId: vehicle.id,
        driverId,
        workState: TachoWorkState.driving,
        startedAt: weekStart,
        endedAt: addSeconds(weekStart, drivingS),
        durationS: drivingS,
        driverCardNo: `CARD-${driverId.slice(-6)}`,
      });
    }
  }

  for (const driver of drivers) {
    const vehicle = vehicleByDriverId.get(driver.id) ?? vehicles[seededInt(rng, 0, vehicles.length - 1)];
    const dayStart = new Date(today);
    dayStart.setHours(5, 30, 0, 0);
    let cursor = new Date(dayStart);
    const isTruck = vehicle.isTruck;

    const nightRestH = isTruck ? 9 : 8;
    tachoRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      driverId: driver.id,
      workState: TachoWorkState.rest,
      startedAt: addDays(cursor, -1),
      endedAt: cursor,
      durationS: nightRestH * 3600,
      driverCardNo: `CARD-${driver.id.slice(-6)}`,
    });

    const morningDriveH = clamp(normalRandom(rng, isTruck ? 4.2 : 3.5, 0.6), 2.5, 5.5);
    tachoRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      driverId: driver.id,
      workState: TachoWorkState.driving,
      startedAt: cursor,
      endedAt: addSeconds(cursor, Math.round(morningDriveH * 3600)),
      durationS: Math.round(morningDriveH * 3600),
      driverCardNo: `CARD-${driver.id.slice(-6)}`,
    });
    cursor = addSeconds(cursor, Math.round(morningDriveH * 3600));

    tachoRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      driverId: driver.id,
      workState: TachoWorkState.rest,
      startedAt: cursor,
      endedAt: addMinutes(cursor, 45),
      durationS: 45 * 60,
      driverCardNo: `CARD-${driver.id.slice(-6)}`,
    });
    cursor = addMinutes(cursor, 45);

    const afternoonDriveH = clamp(normalRandom(rng, isTruck ? 3.8 : 3.2, 0.7), 2, 5);
    tachoRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      driverId: driver.id,
      workState: TachoWorkState.driving,
      startedAt: cursor,
      endedAt: addSeconds(cursor, Math.round(afternoonDriveH * 3600)),
      durationS: Math.round(afternoonDriveH * 3600),
      driverCardNo: `CARD-${driver.id.slice(-6)}`,
    });
    cursor = addSeconds(cursor, Math.round(afternoonDriveH * 3600));

    tachoRows.push({
      tenantId: TENANT_ID,
      vehicleId: vehicle.id,
      driverId: driver.id,
      workState: TachoWorkState.work,
      startedAt: cursor,
      endedAt: addMinutes(cursor, seededInt(rng, 30, 75)),
      durationS: seededInt(rng, 30, 75) * 60,
      driverCardNo: `CARD-${driver.id.slice(-6)}`,
    });
  }
  await createManyBatched(prisma.tachoActivity, tachoRows);

  const paretoDrivers = drivers.slice(0, 12);
  const paretoWeightsList = paretoWeights(12);
  const repeatDrivers = paretoDrivers.slice(0, 4);
  const repeatTypeByDriver = new Map(
    repeatDrivers.map((d, idx) => [d.id, INFRINGEMENT_TYPES[idx % INFRINGEMENT_TYPES.length].type]),
  );

  const weekTargets = weekInfringementTargets(rng);
  const infringementRows = [];
  const typePool = INFRINGEMENT_TYPES.flatMap((row) => Array(row.weight).fill(row.type));

  for (let w = 0; w < WEEKS_HISTORY; w += 1) {
    const weekStart = addDays(today, -(WEEKS_HISTORY - w) * 7);
    for (let n = 0; n < weekTargets[w]; n += 1) {
      const usePareto = rng() < 0.7;
      const driver = usePareto
        ? pickWeighted(
            rng,
            paretoDrivers,
            paretoWeightsList,
          )
        : pickOne(rng, drivers);
      const vehicle = vehicleByDriverId.get(driver.id) ?? pickOne(rng, vehicles);
      const type = pickOne(rng, typePool);
      const typeMeta = INFRINGEMENT_TYPES.find((row) => row.type === type) ?? INFRINGEMENT_TYPES[0];
      const dayOffset = seededInt(rng, 0, 6);
      const occurredAt = addDays(weekStart, dayOffset);
      occurredAt.setHours(seededInt(rng, 5, 20), seededInt(rng, 0, 59), 0, 0);
      const isCritical = rng() < 0.25;
      infringementRows.push({
        tenantId: TENANT_ID,
        driverId: driver.id,
        vehicleId: vehicle.id,
        type,
        severity: isCritical ? 'critical' : 'medium',
        occurredAt,
        notes: JSON.stringify({ seed, week: w + 1, rule: type }),
      });
    }
  }

  for (const driver of repeatDrivers) {
    const type = repeatTypeByDriver.get(driver.id);
    const count = seededInt(rng, 3, 5);
    for (let i = 0; i < count; i += 1) {
      const occurredAt = addDays(today, -seededInt(rng, 5, 88));
      occurredAt.setHours(9, 0, 0, 0);
      infringementRows.push({
        tenantId: TENANT_ID,
        driverId: driver.id,
        vehicleId: vehicleByDriverId.get(driver.id)?.id ?? vehicles[0].id,
        type,
        severity: 'medium',
        occurredAt,
        notes: JSON.stringify({ repeatOffender: true, occurrence: i + 1 }),
      });
    }
  }

  const uniqueInfringements = new Map();
  for (const row of infringementRows) {
    const key = `${row.driverId}|${row.type}|${row.occurredAt.toISOString()}`;
    uniqueInfringements.set(key, row);
  }
  const finalInfringements = Array.from(uniqueInfringements.values()).slice(0, 90);

  const openCount = Math.max(24, Math.round(finalInfringements.length * 0.35));
  const openIndices = finalInfringements
    .map((row, idx) => ({ idx, at: row.occurredAt.getTime() }))
    .sort((a, b) => b.at - a.at)
    .slice(0, openCount)
    .map((entry) => entry.idx);
  const openIndexSet = new Set(openIndices);
  for (let i = 0; i < openIndices.length; i += 1) {
    const idx = openIndices[i];
    if (i < Math.round(openIndices.length * 0.8)) {
      finalInfringements[idx].occurredAt = addDays(today, -seededInt(rng, 0, 6));
      finalInfringements[idx].occurredAt.setHours(seededInt(rng, 6, 20), 0, 0, 0);
    }
  }

  for (const [idx, row] of finalInfringements.entries()) {
    if (!openIndexSet.has(idx)) {
      row.acknowledgedAt = addDays(row.occurredAt, seededInt(rng, 1, 5));
      row.acknowledgedById = creator.id;
      row.acknowledgementNote = 'Mock fleet seed — reviewed by dispatcher.';
    }
  }

  await createManyBatched(prisma.tachoInfringement, finalInfringements);

  const tripRows = [];
  const pointRows = [];
  const eventRows = [];
  const tripMeta = [];

  for (const vehicle of vehicles) {
    const profile = driverProfiles.get(vehicle.driverId);
    if (!profile) continue;

    const dailyDistance = profile.isLowKm
      ? profile.distanceKm / TRIP_DAYS
      : profile.distanceKm / TRIP_DAYS;
    const baseLat = 48.13 + (seededInt(rng, 0, 100) - 50) * 0.002;
    const baseLng = 11.58 + (seededInt(rng, 0, 100) - 50) * 0.002;

    for (let d = 0; d < TRIP_DAYS; d += 1) {
      const tripsToday = seededInt(rng, 1, 3);
      for (let t = 0; t < tripsToday; t += 1) {
        const tripId = `mf-trip-${vehicle.id}-${d}-${t}`;
        const startedAt = addDays(today, -(TRIP_DAYS - d));
        startedAt.setHours(6 + t * 4 + seededInt(rng, 0, 2), seededInt(rng, 0, 59), 0, 0);
        const distanceKm = Math.max(8, dailyDistance / tripsToday + normalRandom(rng, 0, 12));
        const durationS = Math.max(900, Math.round((distanceKm / (55 + rng() * 25)) * 3600));
        const idleS = Math.round((profile.idleMinPerDay * 60) / tripsToday);

        const events = {
          speeding: Math.max(0, Math.round((profile.speedingPer100 * distanceKm) / 100)),
          harsh_brake: Math.max(0, Math.round((profile.brakePer100 * distanceKm) / 100)),
          harsh_accel: Math.max(0, Math.round((profile.accelPer100 * distanceKm) / 100)),
          harsh_corner: 0,
          crash: 0,
        };
        if (profile.isLowKm) {
          events.speeding = seededInt(rng, 0, 1);
          events.harsh_brake = 0;
          events.harsh_accel = 0;
        }

        const score = profile.isLowKm
          ? null
          : computeTripScore(distanceKm, durationS, idleS, events);

        tripRows.push({
          id: tripId,
          tenantId: TENANT_ID,
          vehicleId: vehicle.id,
          driverId: vehicle.driverId,
          source: FleetTelemetrySource.device,
          startedAt,
          endedAt: addSeconds(startedAt, durationS),
          distanceKm: dec(distanceKm),
          durationS,
          idleS,
          avgSpeedKmh: dec(distanceKm / (durationS / 3600)),
          maxSpeedKmh: dec(75 + rng() * 45),
          score: score === null ? null : dec(score),
          status: FleetTripStatus.closed,
        });
        tripMeta.push({ tripId, vehicle, startedAt, distanceKm, events });

        const pointCount = seededInt(rng, 8, 12);
        for (let p = 0; p < pointCount; p += 1) {
          const frac = p / Math.max(pointCount - 1, 1);
          pointRows.push({
            tripId,
            recordedAt: addSeconds(startedAt, Math.round(frac * durationS)),
            latitude: dec(baseLat + frac * 0.35 + (rng() - 0.5) * 0.01),
            longitude: dec(baseLng + frac * 0.45 + (rng() - 0.5) * 0.01),
            speedKmh: 45 + rng() * 55,
            headingDeg: seededInt(rng, 0, 359),
            accuracyM: seededInt(rng, 4, 18),
            source: FleetTelemetrySource.device,
          });
        }
      }
    }
  }

  await createManyBatched(prisma.fleetTrip, tripRows);

  for (const meta of tripMeta) {
    const { tripId, vehicle, startedAt, distanceKm, events } = meta;
    const emit = (type, count, value, threshold) => {
      for (let i = 0; i < count; i += 1) {
        eventRows.push({
          tenantId: TENANT_ID,
          tripId,
          driverId: vehicle.driverId,
          type,
          occurredAt: addSeconds(startedAt, seededInt(rng, 120, Math.max(180, Math.round(distanceKm * 40)))),
          latitude: dec(48.1 + rng() * 0.4),
          longitude: dec(11.4 + rng() * 0.5),
          value: dec(value),
          threshold: dec(threshold),
        });
      }
    };
    emit('speeding', events.speeding, 128, 120);
    emit('harsh_brake', events.harsh_brake, 16, 14);
    emit('harsh_accel', events.harsh_accel, 14, 12);
  }
  await createManyBatched(prisma.fleetTripLocationPoint, pointRows);
  await createManyBatched(prisma.fleetDrivingEvent, eventRows);

  const fuelRows = [];
  for (const vehicle of vehicles) {
    const fills = seededInt(rng, 3, 5);
    const consumption = vehicle.isTruck ? clamp(normalRandom(rng, 30, 3), 24, 36) : clamp(normalRandom(rng, 10, 1.5), 7, 14);
    let odometer = vehicle._odometerKm - seededInt(rng, 800, 2200);
    for (let f = 0; f < fills; f += 1) {
      const enteredAt = addDays(today, -seededInt(rng, 1, FUEL_DAYS));
      enteredAt.setHours(seededInt(rng, 6, 20), 0, 0, 0);
      const legKm = seededInt(rng, 280, 620);
      odometer += legKm;
      const liters = (legKm * consumption) / 100;
      fuelRows.push({
        tenantId: TENANT_ID,
        vehicleId: vehicle.id,
        driverId: vehicle.driverId,
        enteredAt,
        liters: dec(liters),
        totalCost: dec(liters * (1.45 + rng() * 0.25)),
        odometerKm: dec(odometer),
        isFullTank: rng() > 0.35,
      });
    }
    vehicle._odometerKm = odometer;
  }
  await createManyBatched(prisma.fleetFuelEntry, fuelRows);

  const notificationRows = [];
  for (const vehicleId of fuelTheftVehicleIds) {
    notificationRows.push({
      tenantId: TENANT_ID,
      userId: creator.id,
      title: 'Suspected fuel theft',
      message: 'Fuel dropped sharply while ignition was off (mock fleet seed).',
      type: NotificationType.fuel_theft_suspected,
      priority: 'critical',
      relatedEntityType: 'Vehicle',
      relatedEntityId: vehicleId,
    });
  }
  if (notificationRows.length > 0) {
    await prisma.notification.createMany({ data: notificationRows });
  }

  const infringementStats = finalInfringements.reduce((acc, row) => {
    acc[row.type] = (acc[row.type] ?? 0) + 1;
    if (row.severity === 'critical') acc._critical = (acc._critical ?? 0) + 1;
    if (!row.acknowledgedAt) acc._open = (acc._open ?? 0) + 1;
    return acc;
  }, {});

  const scores = [];
  for (const vehicle of vehicles) {
    const profile = driverProfiles.get(vehicle.driverId);
    if (!profile || profile.isLowKm) continue;
    const vehicleTrips = tripRows.filter((t) => t.driverId === vehicle.driverId);
    const totals = vehicleTrips.reduce(
      (acc, trip) => ({
        distanceKm: acc.distanceKm + Number(trip.distanceKm),
        durationS: acc.durationS + (trip.durationS ?? 0),
        idleS: acc.idleS + (trip.idleS ?? 0),
        speeding: acc.speeding,
        harsh_brake: acc.harsh_brake,
        harsh_accel: acc.harsh_accel,
      }),
      { distanceKm: 0, durationS: 0, idleS: 0, speeding: 0, harsh_brake: 0, harsh_accel: 0 },
    );
    const metaForDriver = tripMeta.filter((m) => m.vehicle.driverId === vehicle.driverId);
    for (const m of metaForDriver) {
      totals.speeding += m.events.speeding;
      totals.harsh_brake += m.events.harsh_brake;
      totals.harsh_accel += m.events.harsh_accel;
    }
    scores.push(computeTripScore(totals.distanceKm, totals.durationS, totals.idleS, totals));
  }
  const avgScore = scores.length
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
    : 0;

  const overdueCards = scheduleRows.filter(
    (row) =>
      row.subject === TachoDownloadSubject.driver_card
      && row.lastDownloadAt
      && addDays(row.lastDownloadAt, 28) < today,
  ).length;

  const elapsedMs = Date.now() - started;
  const summary = {
    tenantId: TENANT_ID,
    slug: TENANT_SLUG,
    seed,
    elapsedMs,
    drivers: drivers.length,
    vehicles: vehicles.length,
    devices: devices.length,
    tachoActivities: tachoRows.length,
    infringements: finalInfringements.length,
    infringementsOpen: infringementStats._open ?? 0,
    infringementsCritical: infringementStats._critical ?? 0,
    infringementByType: Object.fromEntries(
      Object.entries(infringementStats).filter(([k]) => !k.startsWith('_')),
    ),
    trips: tripRows.length,
    tripLocationPoints: pointRows.length,
    drivingEvents: eventRows.length,
    fuelEntries: fuelRows.length,
    activeDtcs: activeDtcSpecs.length,
    clearedDtcs: clearedDtcVehicleIds.length,
    dddFiles: dddRows.length,
    avgDriverScore: avgScore,
    lowKmDrivers: lowKmIds.size,
    overdueCardDownloads: overdueCards,
    criticalVuDownloads: vuCritical.length,
    fuelTheftFlags: fuelTheftVehicleIds.size,
    deviceOnline: deviceStatuses.filter((s) => s === 'online').length,
    deviceSilent: deviceStatuses.filter((s) => s === 'silent').length,
    deviceOffline: deviceStatuses.filter((s) => s === 'offline').length,
    weeklyInfringementTargets: weekTargets,
  };

  console.log('\n=== Mock Fleet Seed Summary ===');
  console.table([
    { metric: 'drivers', value: summary.drivers },
    { metric: 'vehicles', value: summary.vehicles },
    { metric: 'devices', value: summary.devices },
    { metric: 'tachoActivities', value: summary.tachoActivities },
    { metric: 'infringements', value: summary.infringements },
    { metric: 'infringements (open)', value: summary.infringementsOpen },
    { metric: 'infringements (critical)', value: summary.infringementsCritical },
    { metric: 'trips', value: summary.trips },
    { metric: 'trip points', value: summary.tripLocationPoints },
    { metric: 'driving events', value: summary.drivingEvents },
    { metric: 'fuel entries', value: summary.fuelEntries },
    { metric: 'active DTCs', value: summary.activeDtcs },
    { metric: 'DDD files (placeholder)', value: summary.dddFiles },
    { metric: 'avg driver score', value: summary.avgDriverScore },
    { metric: 'low-km drivers', value: summary.lowKmDrivers },
    { metric: 'overdue card downloads', value: summary.overdueCardDownloads },
    { metric: 'critical VU downloads', value: summary.criticalVuDownloads },
    { metric: 'elapsed ms', value: summary.elapsedMs },
  ]);
  console.log('Infringement types:', summary.infringementByType);
  console.log('Weekly infringement targets:', summary.weeklyInfringementTargets.join(', '));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
