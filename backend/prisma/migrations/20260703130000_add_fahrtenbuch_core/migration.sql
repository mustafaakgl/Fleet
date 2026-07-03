-- CreateEnum
CREATE TYPE "TripPurpose" AS ENUM ('business', 'private', 'commute');

-- AlterTable
ALTER TABLE "fleet_trips"
  ADD COLUMN "purpose" "TripPurpose",
  ADD COLUMN "purposeNote" TEXT,
  ADD COLUMN "businessContact" TEXT,
  ADD COLUMN "classifiedAt" TIMESTAMP(3),
  ADD COLUMN "classifiedById" TEXT,
  ADD COLUMN "purposeLockedAt" TIMESTAMP(3),
  ADD COLUMN "odoStartKm" DECIMAL(12,3),
  ADD COLUMN "odoEndKm" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "fleet_trip_purpose_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "tripId" TEXT NOT NULL,
    "oldPurpose" "TripPurpose",
    "newPurpose" "TripPurpose" NOT NULL,
    "oldNote" TEXT,
    "newNote" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "fleet_trip_purpose_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fleet_trip_purpose_logs_tenantId_idx" ON "fleet_trip_purpose_logs"("tenantId");

-- CreateIndex
CREATE INDEX "fleet_trip_purpose_logs_tripId_changedAt_idx" ON "fleet_trip_purpose_logs"("tripId", "changedAt");

-- CreateIndex
CREATE INDEX "fleet_trip_purpose_logs_changedById_changedAt_idx" ON "fleet_trip_purpose_logs"("changedById", "changedAt");

-- AddForeignKey
ALTER TABLE "fleet_trips" ADD CONSTRAINT "fleet_trips_classifiedById_fkey" FOREIGN KEY ("classifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trip_purpose_logs" ADD CONSTRAINT "fleet_trip_purpose_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trip_purpose_logs" ADD CONSTRAINT "fleet_trip_purpose_logs_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "fleet_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_trip_purpose_logs" ADD CONSTRAINT "fleet_trip_purpose_logs_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
