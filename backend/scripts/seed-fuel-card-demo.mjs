#!/usr/bin/env node
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'default-tenant';

function dec(value) {
  return new Prisma.Decimal(Number(value).toFixed(3));
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function main() {
  const [drivers, vehicles, fuelEntries] = await Promise.all([
    prisma.driver.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.vehicle.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: { id: true, plateNumber: true, brand: true, model: true },
    }),
    prisma.fleetFuelEntry.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { enteredAt: 'desc' },
      take: 12,
      select: { id: true, vehicleId: true, driverId: true, enteredAt: true, liters: true, totalCost: true, currency: true, odometerKm: true },
    }),
  ]);

  if (drivers.length === 0 || vehicles.length === 0) {
    throw new Error('Need drivers and vehicles in the default tenant before seeding fuel-card demo data.');
  }

  let workingFuelEntries = fuelEntries;
  if (workingFuelEntries.length === 0) {
    const baseDate = new Date();
    const generatedFuelEntries = [
      {
        tenantId: TENANT_ID,
        vehicleId: vehicles[0].id,
        driverId: drivers[0].id,
        enteredAt: addMinutes(baseDate, -8 * 24 * 60),
        liters: dec(54.2),
        totalCost: dec(107.48),
        currency: 'EUR',
        odometerKm: dec(182430),
        isFullTank: true,
      },
      {
        tenantId: TENANT_ID,
        vehicleId: vehicles[1].id,
        driverId: drivers[1].id,
        enteredAt: addMinutes(baseDate, -6 * 24 * 60),
        liters: dec(46.8),
        totalCost: dec(93.12),
        currency: 'EUR',
        odometerKm: dec(154900),
        isFullTank: true,
      },
      {
        tenantId: TENANT_ID,
        vehicleId: vehicles[2].id,
        driverId: drivers[2].id,
        enteredAt: addMinutes(baseDate, -4 * 24 * 60),
        liters: dec(49.3),
        totalCost: dec(96.84),
        currency: 'EUR',
        odometerKm: dec(210120),
        isFullTank: false,
      },
      {
        tenantId: TENANT_ID,
        vehicleId: vehicles[3].id,
        driverId: drivers[3].id,
        enteredAt: addMinutes(baseDate, -3 * 24 * 60),
        liters: dec(41.5),
        totalCost: dec(82.43),
        currency: 'EUR',
        odometerKm: dec(133210),
        isFullTank: true,
      },
      {
        tenantId: TENANT_ID,
        vehicleId: vehicles[4].id,
        driverId: drivers[4].id,
        enteredAt: addMinutes(baseDate, -2 * 24 * 60),
        liters: dec(58.9),
        totalCost: dec(121.31),
        currency: 'EUR',
        odometerKm: dec(240480),
        isFullTank: true,
      },
      {
        tenantId: TENANT_ID,
        vehicleId: vehicles[5].id,
        driverId: drivers[5].id,
        enteredAt: addMinutes(baseDate, -1 * 24 * 60),
        liters: dec(44.7),
        totalCost: dec(88.56),
        currency: 'EUR',
        odometerKm: dec(177880),
        isFullTank: false,
      },
    ];

    await prisma.fleetFuelEntry.createMany({ data: generatedFuelEntries });
    workingFuelEntries = await prisma.fleetFuelEntry.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { enteredAt: 'desc' },
      take: 12,
      select: { id: true, vehicleId: true, driverId: true, enteredAt: true, liters: true, totalCost: true, currency: true, odometerKm: true },
    });
  }

  await prisma.fuelCardTransaction.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.fuelCardImportBatch.deleteMany({ where: { tenantId: TENANT_ID } });

  const batchA = await prisma.fuelCardImportBatch.create({
    data: {
      tenantId: TENANT_ID,
      sourceFileName: 'fleetcard_june_2026.csv',
      sourceStoredPath: 'documents/fuel-card/fleetcard_june_2026.csv',
      sourceMimeType: 'text/csv',
      importedAt: addMinutes(new Date(), -180),
      totalRows: 5,
      matchedRows: 3,
      unmatchedRows: 1,
      ignoredRows: 1,
    },
  });

  const batchB = await prisma.fuelCardImportBatch.create({
    data: {
      tenantId: TENANT_ID,
      sourceFileName: 'fleetcard_july_2026.csv',
      sourceStoredPath: 'documents/fuel-card/fleetcard_july_2026.csv',
      sourceMimeType: 'text/csv',
      importedAt: addMinutes(new Date(), -45),
      totalRows: 3,
      matchedRows: 2,
      unmatchedRows: 1,
      ignoredRows: 0,
    },
  });

  const [driverA, driverB, driverC, driverD] = drivers;
  const [vehicleA, vehicleB, vehicleC, vehicleD] = vehicles;
  const [entryA, entryB, entryC, entryD, entryE] = workingFuelEntries;

  const transactions = [
    {
      batchId: batchA.id,
      vehicleId: entryA.vehicleId,
      driverId: entryA.driverId,
      fuelEntryId: entryA.id,
      externalReference: 'JUN-1001',
      cardLast4: '1842',
      merchantName: 'Aral München Nord',
      transactionAt: addMinutes(new Date(entryA.enteredAt), 12),
      liters: entryA.liters,
      amount: entryA.totalCost,
      currency: entryA.currency,
      odometerKm: entryA.odometerKm,
      status: 'matched',
      matchScore: 97,
      matchNote: 'Exact amount and timestamp match the fuel receipt.',
      rawPayload: { source: 'mock-card-file', line: 1 },
    },
    {
      batchId: batchA.id,
      vehicleId: entryB.vehicleId,
      driverId: entryB.driverId,
      fuelEntryId: entryB.id,
      externalReference: 'JUN-1002',
      cardLast4: '1842',
      merchantName: 'Shell Augsburg Ost',
      transactionAt: addMinutes(new Date(entryB.enteredAt), 18),
      liters: dec(Number(entryB.liters) * 0.94),
      amount: dec(Number(entryB.totalCost) * 0.91),
      currency: entryB.currency,
      odometerKm: entryB.odometerKm,
      status: 'disputed',
      matchScore: 72,
      matchNote: 'Amount differs from the receipt by 9%.',
      rawPayload: { source: 'mock-card-file', line: 2 },
    },
    {
      batchId: batchA.id,
      vehicleId: vehicleC.id,
      driverId: driverC.id,
      externalReference: 'JUN-1003',
      cardLast4: '9911',
      merchantName: 'Esso Nürnberg Süd',
      transactionAt: addMinutes(new Date(), -3 * 24 * 60),
      liters: dec(48.2),
      amount: dec(92.4),
      currency: 'EUR',
      odometerKm: null,
      status: 'imported',
      matchScore: null,
      matchNote: 'No matching fuel receipt imported yet.',
      rawPayload: { source: 'mock-card-file', line: 3 },
    },
    {
      batchId: batchA.id,
      vehicleId: vehicleD.id,
      driverId: driverD.id,
      externalReference: 'JUN-1004',
      cardLast4: '9911',
      merchantName: 'TotalEnergies Ulm West',
      transactionAt: addMinutes(new Date(), -2 * 24 * 60),
      liters: dec(51.7),
      amount: dec(97.5),
      currency: 'EUR',
      odometerKm: null,
      status: 'ignored',
      matchScore: null,
      matchNote: 'Personal fuel card use flagged for review.',
      rawPayload: { source: 'mock-card-file', line: 4 },
    },
    {
      batchId: batchA.id,
      vehicleId: entryC.vehicleId,
      driverId: entryC.driverId,
      fuelEntryId: entryC.id,
      externalReference: 'JUN-1005',
      cardLast4: '1842',
      merchantName: 'Agip Karlsruhe Süd',
      transactionAt: addMinutes(new Date(entryC.enteredAt), 7),
      liters: entryC.liters,
      amount: entryC.totalCost,
      currency: entryC.currency,
      odometerKm: entryC.odometerKm,
      status: 'matched',
      matchScore: 95,
      matchNote: 'Receipt and card amount line up.',
      rawPayload: { source: 'mock-card-file', line: 5 },
    },
    {
      batchId: batchB.id,
      vehicleId: entryD.vehicleId,
      driverId: entryD.driverId,
      fuelEntryId: entryD.id,
      externalReference: 'JUL-2001',
      cardLast4: '7760',
      merchantName: 'Aral Stuttgart Mitte',
      transactionAt: addMinutes(new Date(entryD.enteredAt), 11),
      liters: entryD.liters,
      amount: entryD.totalCost,
      currency: entryD.currency,
      odometerKm: entryD.odometerKm,
      status: 'matched',
      matchScore: 98,
      matchNote: 'Matched automatically from amount, odometer, and vehicle.',
      rawPayload: { source: 'mock-card-file', line: 1 },
    },
    {
      batchId: batchB.id,
      vehicleId: entryE.vehicleId,
      driverId: entryE.driverId,
      fuelEntryId: entryE.id,
      externalReference: 'JUL-2002',
      cardLast4: '7760',
      merchantName: 'Shell Mannheim Hafen',
      transactionAt: addMinutes(new Date(entryE.enteredAt), 16),
      liters: dec(Number(entryE.liters) * 1.08),
      amount: dec(Number(entryE.totalCost) * 1.12),
      currency: entryE.currency,
      odometerKm: entryE.odometerKm,
      status: 'disputed',
      matchScore: 66,
      matchNote: 'Volume and cost differ from the receipt.',
      rawPayload: { source: 'mock-card-file', line: 2 },
    },
    {
      batchId: batchB.id,
      vehicleId: vehicleA.id,
      driverId: driverA.id,
      externalReference: 'JUL-2003',
      cardLast4: '7760',
      merchantName: 'OMV Freiburg Nord',
      transactionAt: addMinutes(new Date(), -6 * 60),
      liters: dec(39.6),
      amount: dec(77.2),
      currency: 'EUR',
      odometerKm: null,
      status: 'imported',
      matchScore: null,
      matchNote: 'Awaiting matching against fuel receipts.',
      rawPayload: { source: 'mock-card-file', line: 3 },
    },
  ];

  const created = await prisma.$transaction([
    ...transactions.map((row) => prisma.fuelCardTransaction.create({ data: { ...row, tenantId: TENANT_ID } })),
  ]);

  console.log(
    JSON.stringify(
      {
        tenantId: TENANT_ID,
        batches: [batchA.id, batchB.id],
        transactionsSeeded: created.length,
        matched: created.filter((row) => row.status === 'matched').length,
        disputed: created.filter((row) => row.status === 'disputed').length,
        imported: created.filter((row) => row.status === 'imported').length,
        ignored: created.filter((row) => row.status === 'ignored').length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
