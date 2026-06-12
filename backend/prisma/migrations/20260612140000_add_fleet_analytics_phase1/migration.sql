-- CreateEnum
CREATE TYPE "FleetTelemetrySource" AS ENUM ('phone', 'device', 'api');

-- CreateEnum
CREATE TYPE "FleetTripStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "FleetDrivingEventType" AS ENUM ('speeding', 'harsh_accel', 'harsh_brake');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "avgConsumptionLPer100Km" DECIMAL(6,2),
ADD COLUMN "initialOdometerKm" DECIMAL(12,3),
ADD COLUMN "odometerCorrectedKm" DECIMAL(12,3),
ADD COLUMN "odometerCorrectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "fleet_trips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "source" "FleetTelemetrySource" NOT NULL DEFAULT 'phone',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "distanceKm" DECIMAL(12,3),
    "durationS" INTEGER,
    "avgSpeedKmh" DECIMAL(8,2),
    "maxSpeedKmh" DECIMAL(8,2),
    "idleS" INTEGER,
    "score" DECIMAL(5,2),
    "hasDataGap" BOOLEAN NOT NULL DEFAULT false,
    "status" "FleetTripStatus" NOT NULL DEFAULT 'active',
    "assignmentId" TEXT,
    "workSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_trip_location_points" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speedKmh" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "source" "FleetTelemetrySource" NOT NULL DEFAULT 'phone',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_trip_location_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_driving_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "FleetDrivingEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "value" DECIMAL(10,3) NOT NULL,
    "threshold" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_driving_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_fuel_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "liters" DECIMAL(10,3) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "odometerKm" DECIMAL(12,3),
    "isFullTank" BOOLEAN NOT NULL DEFAULT false,
    "receiptStoredPath" TEXT,
    "receiptMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_fuel_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_maintenance_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalKm" DECIMAL(12,3),
    "intervalDays" INTEGER,
    "lastDoneAtKm" DECIMAL(12,3),
    "lastDoneAtDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_maintenance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fleet_trips_tenantId_idx" ON "fleet_trips"("tenantId");

-- CreateIndex
CREATE INDEX "fleet_trips_vehicleId_startedAt_idx" ON "fleet_trips"("vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "fleet_trips_driverId_startedAt_idx" ON "fleet_trips"("driverId", "startedAt");

-- CreateIndex
CREATE INDEX "fleet_trips_status_startedAt_idx" ON "fleet_trips"("status", "startedAt");

-- CreateIndex
CREATE INDEX "fleet_trips_assignmentId_idx" ON "fleet_trips"("assignmentId");

-- CreateIndex
CREATE INDEX "fleet_trips_workSessionId_idx" ON "fleet_trips"("workSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_trip_location_points_tripId_recordedAt_latitude_longitu_key" ON "fleet_trip_location_points"("tripId", "recordedAt", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "fleet_trip_location_points_tripId_recordedAt_idx" ON "fleet_trip_location_points"("tripId", "recordedAt");

-- CreateIndex
CREATE INDEX "fleet_driving_events_tenantId_idx" ON "fleet_driving_events"("tenantId");

-- CreateIndex
CREATE INDEX "fleet_driving_events_tripId_occurredAt_idx" ON "fleet_driving_events"("tripId", "occurredAt");

-- CreateIndex
CREATE INDEX "fleet_driving_events_driverId_occurredAt_idx" ON "fleet_driving_events"("driverId", "occurredAt");

-- CreateIndex
CREATE INDEX "fleet_driving_events_type_occurredAt_idx" ON "fleet_driving_events"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "fleet_fuel_entries_tenantId_idx" ON "fleet_fuel_entries"("tenantId");

-- CreateIndex
CREATE INDEX "fleet_fuel_entries_vehicleId_enteredAt_idx" ON "fleet_fuel_entries"("vehicleId", "enteredAt");

-- CreateIndex
CREATE INDEX "fleet_fuel_entries_driverId_enteredAt_idx" ON "fleet_fuel_entries"("driverId", "enteredAt");

-- CreateIndex
CREATE INDEX "fleet_maintenance_rules_tenantId_idx" ON "fleet_maintenance_rules"("tenantId");

-- CreateIndex
CREATE INDEX "fleet_maintenance_rules_vehicleId_idx" ON "fleet_maintenance_rules"("vehicleId");

-- AddForeignKey
ALTER TABLE "fleet_trips" ADD CONSTRAINT "fleet_trips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trips" ADD CONSTRAINT "fleet_trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trips" ADD CONSTRAINT "fleet_trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trips" ADD CONSTRAINT "fleet_trips_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trips" ADD CONSTRAINT "fleet_trips_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trip_location_points" ADD CONSTRAINT "fleet_trip_location_points_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "fleet_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_driving_events" ADD CONSTRAINT "fleet_driving_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_driving_events" ADD CONSTRAINT "fleet_driving_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "fleet_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_driving_events" ADD CONSTRAINT "fleet_driving_events_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_fuel_entries" ADD CONSTRAINT "fleet_fuel_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_fuel_entries" ADD CONSTRAINT "fleet_fuel_entries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_fuel_entries" ADD CONSTRAINT "fleet_fuel_entries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_maintenance_rules" ADD CONSTRAINT "fleet_maintenance_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_maintenance_rules" ADD CONSTRAINT "fleet_maintenance_rules_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
