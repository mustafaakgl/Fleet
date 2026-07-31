-- CreateEnum
CREATE TYPE "GeocodeSource" AS ENUM ('photon', 'nominatim', 'manual', 'imported');

-- CreateEnum
CREATE TYPE "TruckAccessStatus" AS ENUM ('unknown', 'reachable', 'unreachable', 'check_failed');

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "rawAddress" TEXT NOT NULL,
    "normalizedHash" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'DE',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geocodeSource" "GeocodeSource",
    "geocodeConfidence" DECIMAL(4,3),
    "geocodedAt" TIMESTAMP(3),
    "truckAccess" "TruckAccessStatus" NOT NULL DEFAULT 'unknown',
    "truckAccessCheckedAt" TIMESTAMP(3),
    "truckSnapDistanceM" DECIMAL(8,2),
    "truckAccessNote" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

-- CreateIndex
CREATE INDEX "Location_tenantId_companyId_idx" ON "Location"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Location_tenantId_truckAccess_idx" ON "Location"("tenantId", "truckAccess");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_normalizedHash_key" ON "Location"("tenantId", "normalizedHash");

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "deliveryLocationId" TEXT,
ADD COLUMN     "pickupLocationId" TEXT;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_deliveryLocationId_fkey" FOREIGN KEY ("deliveryLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
