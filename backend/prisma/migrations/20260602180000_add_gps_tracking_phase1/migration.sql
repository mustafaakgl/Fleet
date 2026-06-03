-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('mobile', 'telematics');

-- CreateEnum
CREATE TYPE "LocationTrackingStatus" AS ENUM ('active', 'paused', 'denied');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "locationTrackingConsentAt" TIMESTAMP(3),
ADD COLUMN "locationTrackingStatus" "LocationTrackingStatus" NOT NULL DEFAULT 'paused',
ADD COLUMN "locationTrackingEnabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriverLocationLatest" (
    "driverId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "altitudeM" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "source" "LocationSource" NOT NULL DEFAULT 'mobile',
    "vehicleId" TEXT,

    CONSTRAINT "DriverLocationLatest_pkey" PRIMARY KEY ("driverId")
);

-- CreateTable
CREATE TABLE "DriverLocationHistory" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "altitudeM" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "LocationSource" NOT NULL DEFAULT 'mobile',

    CONSTRAINT "DriverLocationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverLocationLatest_receivedAt_idx" ON "DriverLocationLatest"("receivedAt");

-- CreateIndex
CREATE INDEX "DriverLocationLatest_vehicleId_idx" ON "DriverLocationLatest"("vehicleId");

-- CreateIndex
CREATE INDEX "DriverLocationHistory_driverId_recordedAt_idx" ON "DriverLocationHistory"("driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "DriverLocationHistory_vehicleId_recordedAt_idx" ON "DriverLocationHistory"("vehicleId", "recordedAt");

-- CreateIndex
CREATE INDEX "DriverLocationHistory_recordedAt_idx" ON "DriverLocationHistory"("recordedAt");

-- AddForeignKey
ALTER TABLE "DriverLocationLatest" ADD CONSTRAINT "DriverLocationLatest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationLatest" ADD CONSTRAINT "DriverLocationLatest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationHistory" ADD CONSTRAINT "DriverLocationHistory_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationHistory" ADD CONSTRAINT "DriverLocationHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
