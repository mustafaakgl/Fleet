-- CreateEnum
CREATE TYPE "WorkSessionEndReason" AS ENUM ('manual', 'app_background', 'logout');

-- CreateEnum
CREATE TYPE "WorkSessionStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "MessengerDepartment" AS ENUM ('dispatch', 'hr', 'accounting', 'maintenance', 'general');

-- CreateEnum
CREATE TYPE "VehicleEquipmentStatus" AS ENUM ('active', 'retired');

-- AlterEnum
ALTER TYPE "DocumentOwnerType" ADD VALUE 'vehicle_equipment';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "department" "MessengerDepartment" NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "VehicleHandover" ADD COLUMN "equipmentFirstAidKit" BOOLEAN,
ADD COLUMN "equipmentFireExtinguisher" BOOLEAN,
ADD COLUMN "equipmentStraps" BOOLEAN,
ADD COLUMN "equipmentSafetyVest" BOOLEAN,
ADD COLUMN "equipmentNotes" TEXT,
ADD COLUMN "equipmentVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" "WorkSessionEndReason",
    "status" "WorkSessionStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleEquipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serialNumber" TEXT,
    "notes" TEXT,
    "status" "VehicleEquipmentStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSession_tenantId_idx" ON "WorkSession"("tenantId");

-- CreateIndex
CREATE INDEX "WorkSession_driverId_status_idx" ON "WorkSession"("driverId", "status");

-- CreateIndex
CREATE INDEX "WorkSession_driverId_startedAt_idx" ON "WorkSession"("driverId", "startedAt");

-- CreateIndex
CREATE INDEX "VehicleEquipment_tenantId_idx" ON "VehicleEquipment"("tenantId");

-- CreateIndex
CREATE INDEX "VehicleEquipment_vehicleId_status_idx" ON "VehicleEquipment"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "Conversation_department_idx" ON "Conversation"("department");

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleEquipment" ADD CONSTRAINT "VehicleEquipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleEquipment" ADD CONSTRAINT "VehicleEquipment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
