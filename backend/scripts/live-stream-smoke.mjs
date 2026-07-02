#!/usr/bin/env node
/**
 * Smoke: consumer-fed live tracking read model has data after telematics ingest.
 * Full HTTP SSE (/tracking/live/stream) requires API + JWT — validated indirectly here.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_IMEI = '359339080000101';

async function main() {
  const device = await prisma.device.findFirst({
    where: { imei: DEMO_IMEI, vehicleId: { not: null } },
    select: { vehicleId: true },
  });

  if (!device?.vehicleId) {
    throw new Error(`device not bound for imei=${DEMO_IMEI}`);
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      vehicleId: device.vehicleId,
      status: { in: ['planned', 'confirmed', 'in_progress'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { driverId: true },
  });

  if (!assignment?.driverId) {
    throw new Error('no active assignment for demo vehicle');
  }

  const latest = await prisma.driverLocationLatest.findUnique({
    where: { driverId: assignment.driverId },
    select: { recordedAt: true, latitude: true, longitude: true },
  });

  if (!latest) {
    throw new Error('driverLocationLatest missing after telematics ingest');
  }

  const telemetry = await prisma.vehicleTelemetryLatest.findUnique({
    where: { vehicleId: device.vehicleId },
    select: { recordedAt: true },
  });

  if (!telemetry) {
    throw new Error('vehicleTelemetryLatest missing after telematics ingest');
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      driverId: assignment.driverId,
      vehicleId: device.vehicleId,
      locationRecordedAt: latest.recordedAt.toISOString(),
      telemetryRecordedAt: telemetry.recordedAt.toISOString(),
    })}\n`,
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[live-stream-smoke] ${message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
