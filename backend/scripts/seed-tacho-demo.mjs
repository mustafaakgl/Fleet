#!/usr/bin/env node
/**
 * Tacho demo seed — Faz 2 golden reference (expected infringement counts after rule engine):
 *
 * | Scenario                         | Driver        | Expected infringements (Faz 2)      |
 * |----------------------------------|---------------|-------------------------------------|
 * | Exactly 9h driving (clean)       | Demo Driver A | 0                                   |
 * | 9h 1min driving (3rd weekly extension)| Demo Driver A | 1 × daily_driving_exceeded          |
 * | Valid 15min + 30min break        | Demo Driver B | 0                                   |
 * | Invalid 30min + 15min break order| Demo Driver B | 1 × insufficient_break              |
 * | ISO week boundary 56h+ driving   | Demo Driver A | 1 × exceeded_weekly_driving         |
 * | Overdue card download (>28 days) | Demo Driver A | schedule overdue (not infringement) |
 *
 * Totals when Faz 2 rule engine runs: daily_driving_exceeded=1, insufficient_break=1,
 * exceeded_weekly_driving=1 (3 infringements across 14-day chain).
 */
import 'dotenv/config';
import {
  AssignmentStatus,
  DeviceModel,
  PrismaClient,
  TachoDownloadSubject,
  TachoWorkState,
} from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = 'demo';
const DEMO_TENANT_ID = 'default-tenant';
const IMEI_FMC130 = '359339080000101';
const IMEI_FMC650 = '359339080000102';

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function activity(driverId, vehicleId, workState, startedAt, durationS, driverCardNo) {
  const endedAt = addSeconds(startedAt, durationS);
  return {
    tenantId: DEMO_TENANT_ID,
    driverId,
    vehicleId,
    workState,
    startedAt,
    endedAt,
    durationS,
    driverCardNo,
  };
}

async function main() {
  const orphanTenant = await prisma.tenant.findUnique({
    where: { slug: 'tacho-demo' },
    select: { id: true },
  });
  if (orphanTenant && orphanTenant.id !== DEMO_TENANT_ID) {
    await prisma.tachoDownloadSchedule.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.tachoActivity.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.device.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.assignment.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.vehicle.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.driver.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.company.deleteMany({ where: { tenantId: orphanTenant.id } });
    await prisma.tenant.delete({ where: { id: orphanTenant.id } });
  }

  const creator = await prisma.user.findFirst({ select: { id: true } });
  if (!creator) {
    throw new Error('No users in database — run prisma db seed first');
  }

  await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: { name: 'Demo Tenant' },
    create: {
      id: DEMO_TENANT_ID,
      slug: DEMO_TENANT_SLUG,
      name: 'Demo Tenant',
    },
  });

  const company = await prisma.company.upsert({
    where: {
      tenantId_name: {
        tenantId: DEMO_TENANT_ID,
        name: 'Tacho Demo Logistics',
      },
    },
    update: {},
    create: {
      tenantId: DEMO_TENANT_ID,
      name: 'Tacho Demo Logistics',
      email: 'demo@tacho.local',
    },
  });

  const driverA = await prisma.driver.upsert({
    where: {
      tenantId_employeeNumber: {
        tenantId: DEMO_TENANT_ID,
        employeeNumber: 'TACHO-DEMO-A',
      },
    },
    update: {
      firstName: 'Demo',
      lastName: 'Driver A',
      status: 'active',
    },
    create: {
      id: 'tacho-demo-driver-a',
      tenantId: DEMO_TENANT_ID,
      employeeNumber: 'TACHO-DEMO-A',
      firstName: 'Demo',
      lastName: 'Driver A',
      status: 'active',
    },
  });

  const driverB = await prisma.driver.upsert({
    where: {
      tenantId_employeeNumber: {
        tenantId: DEMO_TENANT_ID,
        employeeNumber: 'TACHO-DEMO-B',
      },
    },
    update: {
      firstName: 'Demo',
      lastName: 'Driver B',
      status: 'active',
    },
    create: {
      id: 'tacho-demo-driver-b',
      tenantId: DEMO_TENANT_ID,
      employeeNumber: 'TACHO-DEMO-B',
      firstName: 'Demo',
      lastName: 'Driver B',
      status: 'active',
    },
  });

  const vehicleA = await prisma.vehicle.upsert({
    where: {
      tenantId_plateNumber: {
        tenantId: DEMO_TENANT_ID,
        plateNumber: 'T-DEMO-01',
      },
    },
    update: {
      brand: 'Mercedes',
      model: 'Actros',
      currentDriverId: driverA.id,
    },
    create: {
      id: 'tacho-demo-vehicle-a',
      tenantId: DEMO_TENANT_ID,
      plateNumber: 'T-DEMO-01',
      internalCode: 'TACHO-A',
      brand: 'Mercedes',
      model: 'Actros',
      currentDriverId: driverA.id,
    },
  });

  const vehicleB = await prisma.vehicle.upsert({
    where: {
      tenantId_plateNumber: {
        tenantId: DEMO_TENANT_ID,
        plateNumber: 'T-DEMO-02',
      },
    },
    update: {
      brand: 'MAN',
      model: 'TGX',
      currentDriverId: driverB.id,
    },
    create: {
      id: 'tacho-demo-vehicle-b',
      tenantId: DEMO_TENANT_ID,
      plateNumber: 'T-DEMO-02',
      internalCode: 'TACHO-B',
      brand: 'MAN',
      model: 'TGX',
      currentDriverId: driverB.id,
    },
  });

  await prisma.device.upsert({
    where: {
      tenantId_imei: {
        tenantId: DEMO_TENANT_ID,
        imei: IMEI_FMC130,
      },
    },
    update: { model: DeviceModel.FMC130, vehicleId: vehicleA.id },
    create: {
      tenantId: DEMO_TENANT_ID,
      imei: IMEI_FMC130,
      model: DeviceModel.FMC130,
      vehicleId: vehicleA.id,
    },
  });

  await prisma.device.upsert({
    where: {
      tenantId_imei: {
        tenantId: DEMO_TENANT_ID,
        imei: IMEI_FMC650,
      },
    },
    update: { model: DeviceModel.FMC650, vehicleId: vehicleB.id },
    create: {
      tenantId: DEMO_TENANT_ID,
      imei: IMEI_FMC650,
      model: DeviceModel.FMC650,
      vehicleId: vehicleB.id,
    },
  });

  const today = startOfDay();
  const assignmentKey = {
    driverId: driverA.id,
    vehicleId: vehicleA.id,
    companyId: company.id,
    workDate: today,
    startTime: '06:00',
    endTime: '18:00',
    cargoName: 'Tacho demo telematics',
  };

  const existingAssignment = await prisma.assignment.findFirst({
    where: assignmentKey,
    select: { id: true },
  });

  if (existingAssignment) {
    await prisma.assignment.update({
      where: { id: existingAssignment.id },
      data: { status: AssignmentStatus.in_progress },
    });
  } else {
    await prisma.assignment.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        ...assignmentKey,
        cargoOwner: 'Tacho Demo',
        pickupAddress: 'Berlin Depot',
        deliveryAddress: 'Hamburg Depot',
        routeName: 'Demo Loop',
        status: AssignmentStatus.in_progress,
        createdById: creator.id,
      },
    });
  }

  await prisma.tachoActivity.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });

  const chainStart = addDays(today, -13);
  chainStart.setHours(6, 0, 0, 0);

  const rows = [];
  let cursor = new Date(chainStart);

  // Day 1: exactly 9h driving (clean)
  rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.driving, cursor, 9 * 3600, 'CARD-DEMO-A'));
  cursor = addSeconds(cursor, 9 * 3600 + 11 * 3600);

  // Day 2-4: two 9h30 extensions then 9h1m (3rd extension → infringement)
  rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.driving, cursor, 9 * 3600 + 30 * 60, 'CARD-DEMO-A'));
  cursor = addSeconds(cursor, 9 * 3600 + 30 * 60 + 11 * 3600);
  rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.driving, cursor, 9 * 3600 + 30 * 60, 'CARD-DEMO-A'));
  cursor = addSeconds(cursor, 9 * 3600 + 30 * 60 + 11 * 3600);
  rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.driving, cursor, 9 * 3600 + 60, 'CARD-DEMO-A'));
  cursor = addDays(cursor, 1);
  cursor.setHours(6, 0, 0, 0);

  // Day filler rest/driving
  rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.rest, cursor, 10 * 3600, 'CARD-DEMO-A'));
  cursor = addSeconds(cursor, 10 * 3600);
  rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.driving, cursor, 6 * 3600, 'CARD-DEMO-A'));
  cursor = addDays(cursor, 1);
  cursor.setHours(6, 0, 0, 0);

  // Driver B day 5: valid 15 + 30 break pattern (consecutive before next driving)
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.driving, cursor, 4 * 3600, 'CARD-DEMO-B'));
  cursor = addSeconds(cursor, 4 * 3600);
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.rest, cursor, 15 * 60, 'CARD-DEMO-B'));
  cursor = addSeconds(cursor, 15 * 60);
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.rest, cursor, 30 * 60, 'CARD-DEMO-B'));
  cursor = addSeconds(cursor, 30 * 60);
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.driving, cursor, 4 * 3600, 'CARD-DEMO-B'));
  cursor = addDays(cursor, 1);
  cursor.setHours(6, 0, 0, 0);

  // Driver B day 6: invalid 30 + 15 order, then driving past 4.5h
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.driving, cursor, 4 * 3600, 'CARD-DEMO-B'));
  cursor = addSeconds(cursor, 4 * 3600);
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.rest, cursor, 30 * 60, 'CARD-DEMO-B'));
  cursor = addSeconds(cursor, 30 * 60);
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.rest, cursor, 15 * 60, 'CARD-DEMO-B'));
  cursor = addSeconds(cursor, 15 * 60);
  rows.push(activity(driverB.id, vehicleB.id, TachoWorkState.driving, cursor, 1 * 3600 + 60, 'CARD-DEMO-B'));
  cursor = addDays(cursor, 1);
  cursor.setHours(6, 0, 0, 0);

  // ISO week transition: accumulate driving blocks totalling 56h+ in rolling window
  for (let day = 0; day < 5; day += 1) {
    rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.driving, cursor, 11 * 3600 + 30 * 60, 'CARD-DEMO-A'));
    cursor = addSeconds(cursor, 11 * 3600 + 30 * 60 + 12 * 3600);
    cursor = addDays(cursor, 1);
    cursor.setHours(6, 0, 0, 0);
  }

  // Remaining days: light available/rest filler to reach 14-day span
  while (cursor < today) {
    rows.push(activity(driverA.id, vehicleA.id, TachoWorkState.available, cursor, 8 * 3600, 'CARD-DEMO-A'));
    cursor = addDays(cursor, 1);
    cursor.setHours(6, 0, 0, 0);
  }

  await prisma.tachoActivity.createMany({ data: rows });

  const overdueLastDownload = addDays(today, -35);
  const overdueNextDue = addDays(today, -7);

  await prisma.tachoDownloadSchedule.deleteMany({
    where: { tenantId: DEMO_TENANT_ID, driverId: driverA.id },
  });

  await prisma.tachoDownloadSchedule.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      subject: TachoDownloadSubject.driver_card,
      driverId: driverA.id,
      intervalDays: 28,
      lastDownloadAt: overdueLastDownload,
      nextDueAt: overdueNextDue,
      enabled: true,
    },
  });

  process.stdout.write(
    `${JSON.stringify({
      tenantId: DEMO_TENANT_ID,
      drivers: [driverA.id, driverB.id],
      vehicles: [vehicleA.id, vehicleB.id],
      devices: [IMEI_FMC130, IMEI_FMC650],
      tachoActivities: rows.length,
      assignmentToday: true,
    })}\n`,
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[seed-tacho-demo] ${message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
