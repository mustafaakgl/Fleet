-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('draft', 'optimizing', 'optimized', 'released', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TourStopKind" AS ENUM ('depot_start', 'pickup', 'delivery', 'depot_end');

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "name" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "status" "TourStatus" NOT NULL DEFAULT 'draft',
    "vehicleId" TEXT,
    "driverId" TEXT,
    "depotLocationId" TEXT,
    "plannedDistanceKm" DECIMAL(12,3),
    "plannedDurationMin" INTEGER,
    "plannedFuelLiters" DECIMAL(10,3),
    "plannedTollCents" INTEGER,
    "baselineDistanceKm" DECIMAL(12,3),
    "baselineDurationMin" INTEGER,
    "optimizedAt" TIMESTAMP(3),
    "optimizationJobId" TEXT,
    "optimizationError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourStop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "tourId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedSequence" INTEGER,
    "kind" "TourStopKind" NOT NULL,
    "locationId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "serviceMinutes" INTEGER NOT NULL DEFAULT 0,
    "weightKg" DECIMAL(10,2),
    "volumeM3" DECIMAL(10,3),
    "plannedArrivalAt" TIMESTAMP(3),
    "plannedDepartureAt" TIMESTAMP(3),
    "legDistanceKm" DECIMAL(12,3),
    "legDurationMin" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tour_tenantId_idx" ON "Tour"("tenantId");

-- CreateIndex
CREATE INDEX "Tour_tenantId_workDate_idx" ON "Tour"("tenantId", "workDate");

-- CreateIndex
CREATE INDEX "Tour_tenantId_vehicleId_workDate_idx" ON "Tour"("tenantId", "vehicleId", "workDate");

-- CreateIndex
CREATE INDEX "Tour_tenantId_driverId_workDate_idx" ON "Tour"("tenantId", "driverId", "workDate");

-- CreateIndex
CREATE INDEX "Tour_tenantId_status_idx" ON "Tour"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TourStop_tenantId_idx" ON "TourStop"("tenantId");

-- CreateIndex
CREATE INDEX "TourStop_tourId_idx" ON "TourStop"("tourId");

-- CreateIndex
CREATE INDEX "TourStop_tenantId_locationId_idx" ON "TourStop"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "TourStop_assignmentId_idx" ON "TourStop"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TourStop_tourId_sequence_key" ON "TourStop"("tourId", "sequence");

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_depotLocationId_fkey" FOREIGN KEY ("depotLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
