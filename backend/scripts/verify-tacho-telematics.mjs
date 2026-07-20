#!/usr/bin/env node
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { FleetTelemetrySource, FleetTripStatus, PrismaClient, LocationSource } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_TIMEOUT_MS = Number(process.env.TELEMATICS_TIMEOUT_MS || 60_000);
const GATEWAY_START_COMMAND = 'PATH=/opt/homebrew/opt/node@22/bin:$PATH npm --prefix backend run start:gateway';

function parseArgs(argv) {
  const args = {
    scenario: null,
    summaryPath: null,
    host: process.env.DEVICE_HOST || '127.0.0.1',
    port: Number(process.env.DEVICE_PORT || 5027),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--scenario') {
      args.scenario = argv[++i];
      continue;
    }
    if (token === '--summary') {
      args.summaryPath = argv[++i];
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
    if (token === '--timeout-ms') {
      args.timeoutMs = Number(argv[++i]);
      continue;
    }
  }

  return args;
}

function gatewayUnavailableMessage(host, port, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return `gateway kapali — su komutla baslat: ${GATEWAY_START_COMMAND} (host=${host} port=${port}; detay=${detail})`;
}

function readStdinWithTimeout(timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for summary JSON on stdin after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
    };

    const onData = (chunk) => {
      buffer += chunk.toString();
    };

    const onEnd = () => {
      cleanup();
      resolve(buffer);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });
}

function probeGateway(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(error);
    };

    socket.setTimeout(Math.min(timeoutMs, 1000));
    socket.once('connect', () => finish(null));
    socket.once('timeout', () => finish(new Error(`baglanti timeout ${Math.min(timeoutMs, 1000)}ms`)));
    socket.once('error', (error) => finish(error));
    socket.connect(port, host);
  });
}

async function readSummary(args) {
  if (args.summaryPath) {
    return JSON.parse(readFileSync(args.summaryPath, 'utf8'));
  }

  if (process.stdin.isTTY) {
    const gatewayError = await probeGateway(args.host, args.port, args.timeoutMs);
    if (gatewayError) {
      throw new Error(gatewayUnavailableMessage(args.host, args.port, gatewayError));
    }
  }

  const stdin = (await readStdinWithTimeout(args.timeoutMs)).trim();
  if (!stdin) {
    const gatewayError = await probeGateway(args.host, args.port, args.timeoutMs);
    if (gatewayError) {
      throw new Error(gatewayUnavailableMessage(args.host, args.port, gatewayError));
    }
    throw new Error('No summary JSON on stdin; pass --summary <file> or pipe sim output');
  }

  return JSON.parse(stdin);
}

function msDiff(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime());
}

async function main() {
  const args = parseArgs(process.argv);
  const summary = await readSummary(args);

  if (args.scenario && summary.scenario !== args.scenario) {
    throw new Error(`Scenario mismatch: expected=${args.scenario} got=${summary.scenario}`);
  }

  const device = await prisma.device.findFirst({
    where: { imei: summary.imei, vehicleId: { not: null } },
    select: { vehicleId: true, tenantId: true },
  });

  if (!device?.vehicleId) {
    throw new Error(`No bound device for imei=${summary.imei}`);
  }

  const vehicleId = device.vehicleId;
  const ingestSince = new Date(summary.startedAt);
  const scenarioSince = new Date(summary.verifySince ?? summary.baseTs ?? summary.startedAt);

  // Previous aborted runs can leave an active device trip behind for this IMEI.
  // Close residual active rows before assertions so closedDeviceTrips does not false-red.
  await prisma.fleetTrip.updateMany({
    where: {
      vehicleId,
      source: FleetTelemetrySource.device,
      status: FleetTripStatus.active,
      endedAt: null,
    },
    data: {
      status: FleetTripStatus.closed,
      endedAt: scenarioSince,
    },
  });

  const checks = [];

  const locationDeadline =
    summary.scenario === 'load' ? Date.now() + 10_000 : Date.now();
  let locationCount = 0;
  while (Date.now() <= locationDeadline) {
    locationCount = await prisma.driverLocationHistory.count({
      where: {
        vehicleId,
        source: LocationSource.telematics,
        receivedAt: { gte: ingestSince },
      },
    });
    if (locationCount >= summary.expectedLocationPoints) {
      break;
    }
    if (summary.scenario !== 'load') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  checks.push({
    name: 'DriverLocationHistory',
    expected: summary.expectedLocationPoints,
    actual: locationCount,
    ok: locationCount === summary.expectedLocationPoints,
  });

  if (summary.expectedDuplicateLocationPoints !== undefined) {
    const duplicateGroups = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS cnt FROM (
        SELECT 1
        FROM "DriverLocationHistory"
        WHERE "vehicleId" = ${vehicleId}
          AND source = 'telematics'
          AND "receivedAt" >= ${ingestSince}
        GROUP BY "recordedAt", "latitude", "longitude"
        HAVING COUNT(*) > 1
      ) d
    `;
    const duplicateCount = Number(duplicateGroups[0]?.cnt ?? 0);
    checks.push({
      name: 'duplicateLocationPoints',
      expected: summary.expectedDuplicateLocationPoints,
      actual: duplicateCount,
      ok: duplicateCount === summary.expectedDuplicateLocationPoints,
    });
  }

  const telemetryLatest = await prisma.vehicleTelemetryLatest.findUnique({
    where: { vehicleId },
    select: { recordedAt: true },
  });

  const expectedRecordedAt = summary.expectedLastRecordedAt;
  const actualRecordedAt = telemetryLatest?.recordedAt?.toISOString() ?? null;
  const skipTelemetryLatest = summary.skipTelemetryLatestCheck === true;
  const freshnessOk =
    skipTelemetryLatest
    || (telemetryLatest
      && expectedRecordedAt
      && msDiff(telemetryLatest.recordedAt, expectedRecordedAt) <= 1_500);

  if (!skipTelemetryLatest) {
    checks.push({
      name: 'VehicleTelemetryLatest.recordedAt',
      expected: expectedRecordedAt,
      actual: actualRecordedAt,
      ok: freshnessOk,
    });
  }

  const activeDtcWhere = {
    vehicleId,
    clearedAt: null,
    ...(summary.countTotalActiveDtc ? {} : { createdAt: { gte: ingestSince } }),
  };
  const activeDtcCount = await prisma.vehicleDtc.count({
    where: activeDtcWhere,
  });

  const expectedDtc = summary.expectedActiveDtcCount ?? summary.expectedActiveDtcDelta ?? 0;
  checks.push({
    name: 'activeDtcSinceScenario',
    expected: expectedDtc,
    actual: activeDtcCount,
    ok: activeDtcCount === expectedDtc,
  });

  const quarantineExpected = summary.telemetryQuarantineExpected;
  if (quarantineExpected !== undefined && quarantineExpected !== 'skipped') {
    const quarantineCount = await prisma.telemetryQuarantine.count({
      where: {
        imei: summary.imei,
        createdAt: { gte: ingestSince },
      },
    });
    checks.push({
      name: 'TelemetryQuarantine',
      expected: quarantineExpected,
      actual: quarantineCount,
      ok: quarantineCount === quarantineExpected,
    });
  } else if (summary.scenario !== 'corrupt-frames') {
    const count = await prisma.telemetryQuarantine.count({
      where: { imei: summary.imei, createdAt: { gte: ingestSince } },
    });
    checks.push({
      name: 'TelemetryQuarantine',
      expected: 0,
      actual: count,
      ok: count === 0,
    });
  }

  if (summary.expectedClosedTrips !== undefined) {
    const debounceMs = Number(process.env.TELEMATICS_IGNITION_OFF_DEBOUNCE_MS ?? 5000);
    const deadline = Date.now() + debounceMs + 6000;
    let closedTrips = 0;

    while (Date.now() <= deadline) {
      closedTrips = await prisma.fleetTrip.count({
        where: {
          vehicleId,
          source: FleetTelemetrySource.device,
          status: FleetTripStatus.closed,
          endedAt: { gte: scenarioSince },
        },
      });

      if (closedTrips >= summary.expectedClosedTrips) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    checks.push({
      name: 'closedDeviceTrips',
      expected: summary.expectedClosedTrips,
      actual: closedTrips,
      ok: closedTrips >= summary.expectedClosedTrips,
    });
  }

  if (summary.expectedFuelTheftNotifications !== undefined) {
    const notifications = await prisma.notification.count({
      where: {
        tenantId: device.tenantId,
        type: 'fuel_theft_suspected',
        relatedEntityId: vehicleId,
        createdAt: { gte: ingestSince },
      },
    });
    checks.push({
      name: 'fuelTheftNotifications',
      expected: summary.expectedFuelTheftNotifications,
      actual: notifications,
      ok: notifications >= summary.expectedFuelTheftNotifications,
    });
  }

  const report = {
    scenario: summary.scenario,
    imei: summary.imei,
    vehicleId,
    checks,
    ok: checks.every((check) => check.ok),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    process.stderr.write('[verify-tacho-telematics] mismatch detected\n');
    for (const check of checks) {
      if (!check.ok) {
        process.stderr.write(`  ${check.name}: expected=${check.expected} actual=${check.actual}\n`);
      }
    }
    process.exit(1);
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[verify-tacho-telematics] ${message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
