-- CreateEnum
CREATE TYPE "MorningCheckinStatus" AS ENUM ('confirmed', 'waiting_for_review', 'missing_vehicle_plate', 'missing_company', 'conflict', 'added_to_einsatzplan', 'rejected');

-- AlterEnum
ALTER TYPE "CompanyEmailStatus" ADD VALUE 'draft_ready';

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'needs_review';

-- CreateTable
CREATE TABLE "MorningCheckin" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehiclePlate" TEXT,
    "companyName" TEXT,
    "status" "MorningCheckinStatus" NOT NULL DEFAULT 'waiting_for_review',
    "conflictReason" TEXT,
    "assignmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MorningCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "serviceType" TEXT NOT NULL,
    "repairCompany" TEXT NOT NULL,
    "costAmount" DECIMAL(10,2) NOT NULL,
    "mileageKm" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MorningCheckin_driverId_date_idx" ON "MorningCheckin"("driverId", "date");

-- CreateIndex
CREATE INDEX "MorningCheckin_status_date_idx" ON "MorningCheckin"("status", "date");

-- CreateIndex
CREATE INDEX "ServiceRecord_vehicleId_date_idx" ON "ServiceRecord"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "ServiceRecord_repairCompany_idx" ON "ServiceRecord"("repairCompany");

-- AddForeignKey
ALTER TABLE "MorningCheckin" ADD CONSTRAINT "MorningCheckin_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorningCheckin" ADD CONSTRAINT "MorningCheckin_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
