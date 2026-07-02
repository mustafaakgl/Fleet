/*
  Warnings:

  - You are about to drop the `vehicle_telemetry_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "DddFileType" AS ENUM ('card', 'vu', 'unknown');

-- CreateEnum
CREATE TYPE "DddFileSource" AS ENUM ('manual', 'remote', 'service');

-- CreateEnum
CREATE TYPE "TachoWorkState" AS ENUM ('driving', 'rest', 'work', 'available');

-- CreateEnum
CREATE TYPE "TachoInfringementType" AS ENUM ('daily_driving_exceeded', 'insufficient_daily_rest', 'insufficient_break', 'exceeded_weekly_driving', 'exceeded_two_week_driving', 'insufficient_weekly_rest', 'driving_without_card');

-- CreateEnum
CREATE TYPE "TachoDownloadSubject" AS ENUM ('driver_card', 'vehicle_unit');

-- DropForeignKey
ALTER TABLE "vehicle_telemetry_history" DROP CONSTRAINT "vehicle_telemetry_history_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_telemetry_history" DROP CONSTRAINT "vehicle_telemetry_history_vehicleId_fkey";

-- DropTable
DROP TABLE "vehicle_telemetry_history";

-- CreateTable
CREATE TABLE "ddd_files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT,
    "driverId" TEXT,
    "uploadedByUserId" TEXT,
    "fileType" "DddFileType" NOT NULL,
    "source" "DddFileSource" NOT NULL DEFAULT 'manual',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "storedPath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ddd_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tacho_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "dddFileId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "driverCardNo" TEXT,
    "workState" "TachoWorkState" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationS" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tacho_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tacho_infringements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "dddFileId" TEXT,
    "type" "TachoInfringementType" NOT NULL,
    "severity" "DtcSeverity" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tacho_infringements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tacho_download_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "subject" "TachoDownloadSubject" NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "intervalDays" INTEGER NOT NULL DEFAULT 28,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastDownloadAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tacho_download_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ddd_files_tenantId_idx" ON "ddd_files"("tenantId");

-- CreateIndex
CREATE INDEX "ddd_files_vehicleId_idx" ON "ddd_files"("vehicleId");

-- CreateIndex
CREATE INDEX "ddd_files_driverId_idx" ON "ddd_files"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ddd_files_tenantId_sha256_key" ON "ddd_files"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "tacho_activities_tenantId_idx" ON "tacho_activities"("tenantId");

-- CreateIndex
CREATE INDEX "tacho_activities_dddFileId_idx" ON "tacho_activities"("dddFileId");

-- CreateIndex
CREATE INDEX "tacho_activities_vehicleId_startedAt_idx" ON "tacho_activities"("vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "tacho_activities_driverId_startedAt_idx" ON "tacho_activities"("driverId", "startedAt");

-- CreateIndex
CREATE INDEX "tacho_infringements_tenantId_idx" ON "tacho_infringements"("tenantId");

-- CreateIndex
CREATE INDEX "tacho_infringements_driverId_occurredAt_idx" ON "tacho_infringements"("driverId", "occurredAt");

-- CreateIndex
CREATE INDEX "tacho_infringements_dddFileId_idx" ON "tacho_infringements"("dddFileId");

-- CreateIndex
CREATE UNIQUE INDEX "tacho_infringements_tenantId_driverId_type_occurredAt_key" ON "tacho_infringements"("tenantId", "driverId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "tacho_download_schedules_tenantId_idx" ON "tacho_download_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "tacho_download_schedules_subject_nextDueAt_idx" ON "tacho_download_schedules"("subject", "nextDueAt");

-- CreateIndex
CREATE INDEX "tacho_download_schedules_driverId_idx" ON "tacho_download_schedules"("driverId");

-- CreateIndex
CREATE INDEX "tacho_download_schedules_vehicleId_idx" ON "tacho_download_schedules"("vehicleId");

-- AddForeignKey
ALTER TABLE "ddd_files" ADD CONSTRAINT "ddd_files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ddd_files" ADD CONSTRAINT "ddd_files_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ddd_files" ADD CONSTRAINT "ddd_files_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_activities" ADD CONSTRAINT "tacho_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_activities" ADD CONSTRAINT "tacho_activities_dddFileId_fkey" FOREIGN KEY ("dddFileId") REFERENCES "ddd_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_activities" ADD CONSTRAINT "tacho_activities_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_activities" ADD CONSTRAINT "tacho_activities_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_infringements" ADD CONSTRAINT "tacho_infringements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_infringements" ADD CONSTRAINT "tacho_infringements_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_infringements" ADD CONSTRAINT "tacho_infringements_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_infringements" ADD CONSTRAINT "tacho_infringements_dddFileId_fkey" FOREIGN KEY ("dddFileId") REFERENCES "ddd_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_download_schedules" ADD CONSTRAINT "tacho_download_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_download_schedules" ADD CONSTRAINT "tacho_download_schedules_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tacho_download_schedules" ADD CONSTRAINT "tacho_download_schedules_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
