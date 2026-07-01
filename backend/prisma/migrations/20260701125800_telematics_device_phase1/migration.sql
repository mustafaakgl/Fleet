-- CreateEnum
CREATE TYPE "DeviceModel" AS ENUM ('FMC130', 'FMC650');

-- CreateEnum
CREATE TYPE "DtcSeverity" AS ENUM ('medium', 'critical');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FleetDrivingEventType" ADD VALUE 'harsh_corner';
ALTER TYPE "FleetDrivingEventType" ADD VALUE 'crash';

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "imei" TEXT NOT NULL,
    "model" "DeviceModel" NOT NULL,
    "vehicleId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_telemetry_latest" (
    "vehicleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "ignition" BOOLEAN NOT NULL DEFAULT false,
    "rpm" INTEGER,
    "fuelLevelPct" DECIMAL(5,2),
    "coolantTemp" DECIMAL(5,1),
    "voltage" DECIMAL(4,1),
    "odometerKm" DECIMAL(12,3),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_telemetry_latest_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateTable
CREATE TABLE "vehicle_dtc" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "severity" "DtcSeverity" NOT NULL DEFAULT 'medium',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_dtc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devices_tenantId_idx" ON "devices"("tenantId");

-- CreateIndex
CREATE INDEX "devices_vehicleId_idx" ON "devices"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenantId_imei_key" ON "devices"("tenantId", "imei");

-- CreateIndex
CREATE INDEX "vehicle_telemetry_latest_tenantId_idx" ON "vehicle_telemetry_latest"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_dtc_tenantId_idx" ON "vehicle_dtc"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_dtc_vehicleId_occurredAt_idx" ON "vehicle_dtc"("vehicleId", "occurredAt");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telemetry_latest" ADD CONSTRAINT "vehicle_telemetry_latest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telemetry_latest" ADD CONSTRAINT "vehicle_telemetry_latest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_dtc" ADD CONSTRAINT "vehicle_dtc_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_dtc" ADD CONSTRAINT "vehicle_dtc_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
