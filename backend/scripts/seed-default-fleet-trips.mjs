#!/usr/bin/env node
import 'dotenv/config';
import { FleetTelemetrySource, FleetTripStatus, Prisma, PrismaClient, TripPurpose } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'default-tenant';

function startOfMonth(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(1);
  return value;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function dec(value) {
  return new Prisma.Decimal(Number(value).toFixed(3));
}

async function main() {
  const drivers = await prisma.driver.findMany({
    where: { tenantId: TENANT_ID, status: 'active' },
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: { id: true, firstName: true, lastName: true },
  });

  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: TENANT_ID, status: 'active' },
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: { id: true, plateNumber: true, brand: true, model: true },
  });

  if (drivers.length === 0 || vehicles.length === 0) {
    throw new Error('Default tenant does not have enough active drivers and vehicles to seed fleet trips.');
  }

  await prisma.fleetTripPurposeLog.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.fleetTrip.deleteMany({ where: { tenantId: TENANT_ID } });

  const baseStart = addMinutes(startOfMonth(new Date()), 3 * 24 * 60 + 8 * 60 + 15);
  const purposes = [TripPurpose.business, TripPurpose.private, TripPurpose.commute, TripPurpose.business, TripPurpose.private];
  const seedTrips = [];

  for (let index = 0; index < Math.min(5, drivers.length, vehicles.length); index += 1) {
    const startedAt = addMinutes(baseStart, index * 140);
    const endedAt = addMinutes(startedAt, 42 + index * 6);
    const purpose = purposes[index] ?? TripPurpose.business;
    const distanceKm = 24.5 + index * 7.35;
    const durationS = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    const avgSpeedKmh = distanceKm / (durationS / 3600);
    const startLat = 48.1351 + index * 0.018;
    const startLng = 11.5820 + index * 0.022;
    const endLat = startLat + 0.052;
    const endLng = startLng + 0.037;
    const trip = await prisma.fleetTrip.create({
      data: {
        tenantId: TENANT_ID,
        vehicleId: vehicles[index].id,
        driverId: drivers[index].id,
        source: FleetTelemetrySource.device,
        purpose,
        purposeNote: purpose === TripPurpose.business ? `Kunde ${index + 1} besuchen` : purpose === TripPurpose.commute ? 'Morgendliche Fahrt zum Einsatzort' : 'Privater Weg',
        businessContact: purpose === TripPurpose.business ? `Kontakt ${index + 1}` : null,
        classifiedAt: addSeconds(endedAt, 300),
        classifiedById: null,
        purposeLockedAt: addDays(endedAt, 7),
        startedAt,
        endedAt,
        distanceKm: dec(distanceKm),
        durationS,
        avgSpeedKmh: dec(avgSpeedKmh),
        maxSpeedKmh: dec(avgSpeedKmh + 12),
        idleS: 180 + index * 20,
        score: dec(88 - index * 4),
        hasDataGap: index === 2,
        status: FleetTripStatus.closed,
      },
    });

    const points = [];
    for (let pointIndex = 0; pointIndex < 12; pointIndex += 1) {
      const pointTime = addMinutes(startedAt, pointIndex * 4);
      points.push({
        tripId: trip.id,
        recordedAt: pointTime,
        latitude: dec(startLat + pointIndex * 0.004),
        longitude: dec(startLng + pointIndex * 0.003),
        speedKmh: pointIndex === 0 ? 0 : 28 + index * 3,
        headingDeg: (index * 45 + pointIndex * 17) % 360,
        accuracyM: 6,
        source: FleetTelemetrySource.device,
      });
    }

    await prisma.fleetTripLocationPoint.createMany({ data: points });
    seedTrips.push({
      tripId: trip.id,
      driver: `${drivers[index].firstName} ${drivers[index].lastName}`,
      vehicle: vehicles[index].plateNumber,
      purpose,
    });
  }

  console.log(JSON.stringify({ tenantId: TENANT_ID, tripsSeeded: seedTrips.length, seedTrips }, null, 2));
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
