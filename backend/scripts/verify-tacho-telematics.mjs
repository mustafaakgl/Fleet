#!/usr/bin/env node
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient, LocationSource } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    scenario: null,
    summaryPath: null,
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
  }

  return args;
}

async function readSummary(args) {
  if (args.summaryPath) {
    return JSON.parse(readFileSync(args.summaryPath, 'utf8'));
  }

  const stdin = readFileSync(0, 'utf8').trim();
  if (!stdin) {
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
  const since = new Date(summary.startedAt);
  const checks = [];

  const locationCount = await prisma.driverLocationHistory.count({
    where: {
      vehicleId,
      source: LocationSource.telematics,
      receivedAt: { gte: since },
    },
  });

  checks.push({
    name: 'DriverLocationHistory',
    expected: summary.expectedLocationPoints,
    actual: locationCount,
    ok: locationCount === summary.expectedLocationPoints,
  });

  const telemetryLatest = await prisma.vehicleTelemetryLatest.findUnique({
    where: { vehicleId },
    select: { recordedAt: true },
  });

  const expectedRecordedAt = summary.expectedLastRecordedAt;
  const actualRecordedAt = telemetryLatest?.recordedAt?.toISOString() ?? null;
  const freshnessOk = telemetryLatest
    && expectedRecordedAt
    && msDiff(telemetryLatest.recordedAt, expectedRecordedAt) <= 1_500;

  checks.push({
    name: 'VehicleTelemetryLatest.recordedAt',
    expected: expectedRecordedAt,
    actual: actualRecordedAt,
    ok: freshnessOk,
  });

  const activeDtcCount = await prisma.vehicleDtc.count({
    where: {
      vehicleId,
      clearedAt: null,
      createdAt: { gte: since },
    },
  });

  const expectedDtc = summary.expectedActiveDtcCount ?? summary.expectedActiveDtcDelta ?? 0;
  checks.push({
    name: 'activeDtcSinceScenario',
    expected: expectedDtc,
    actual: activeDtcCount,
    ok: activeDtcCount === expectedDtc,
  });

  checks.push({
    name: 'TelemetryQuarantine',
    expected: 'skipped',
    actual: 'skipped',
    ok: true,
    note: 'Table arrives in Faz 2C',
  });

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
