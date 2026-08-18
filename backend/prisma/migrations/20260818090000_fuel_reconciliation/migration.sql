-- Faz 11 — yakit fisi / telematik mutabakati.
--
-- TAMAMEN EKLEMELI: tablo ya da kolon dusurulmuyor, veri silinmiyor, mevcut
-- hicbir indeks degistirilmiyor. Var olan kayitlar bu migration'dan sonra da
-- birebir ayni kaliyor; `Vehicle.fuelTankCapacityLiters` bilincli olarak NULL
-- baslar (bkz. semadaki gerekce: uydurma kapasite = uydurma litre farki).
--
-- Faz 10'da kapatilan zincir/sema farki ile KARISTIRILMAMALI: burada yalnizca
-- yeni nesneler var.
-- CreateEnum
CREATE TYPE "FuelReconciliationStatus" AS ENUM ('pending', 'calculated', 'failed');

-- CreateEnum
CREATE TYPE "FuelReconciliationRiskLevel" AS ENUM ('insufficient_data', 'normal', 'review_required', 'high_attention');

-- CreateEnum
CREATE TYPE "FuelReconciliationReviewState" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "FuelReconciliationReviewOutcome" AS ENUM ('valid', 'corrected', 'duplicate', 'needs_investigation');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "fuelTankCapacityLiters" DECIMAL(7,2);

-- CreateTable
CREATE TABLE "vehicle_fuel_level_samples" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "fuelLevelPct" DECIMAL(5,2) NOT NULL,
    "ignition" BOOLEAN NOT NULL DEFAULT false,
    "odometerKm" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_fuel_level_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_reconciliations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "fuelEntryId" TEXT NOT NULL,
    "status" "FuelReconciliationStatus" NOT NULL DEFAULT 'pending',
    "riskLevel" "FuelReconciliationRiskLevel" NOT NULL DEFAULT 'insufficient_data',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "signals" JSONB,
    "dataQuality" JSONB,
    "evidence" JSONB,
    "algorithmVersion" INTEGER NOT NULL DEFAULT 1,
    "calculatedAt" TIMESTAMP(3),
    "recalculatedAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedAt" TIMESTAMP(3),
    "reviewState" "FuelReconciliationReviewState" NOT NULL DEFAULT 'open',
    "reviewOutcome" "FuelReconciliationReviewOutcome",
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_fuel_level_samples_tenantId_idx" ON "vehicle_fuel_level_samples"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_fuel_level_samples_recordedAt_idx" ON "vehicle_fuel_level_samples"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_fuel_level_samples_vehicleId_recordedAt_key" ON "vehicle_fuel_level_samples"("vehicleId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_reconciliations_fuelEntryId_key" ON "fuel_reconciliations"("fuelEntryId");

-- CreateIndex
CREATE INDEX "fuel_reconciliations_tenantId_idx" ON "fuel_reconciliations"("tenantId");

-- CreateIndex
CREATE INDEX "fuel_reconciliations_tenantId_status_idx" ON "fuel_reconciliations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "fuel_reconciliations_tenantId_riskLevel_reviewState_idx" ON "fuel_reconciliations"("tenantId", "riskLevel", "reviewState");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_reconciliations_tenantId_fuelEntryId_key" ON "fuel_reconciliations"("tenantId", "fuelEntryId");

-- AddForeignKey
ALTER TABLE "vehicle_fuel_level_samples" ADD CONSTRAINT "vehicle_fuel_level_samples_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fuel_level_samples" ADD CONSTRAINT "vehicle_fuel_level_samples_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_reconciliations" ADD CONSTRAINT "fuel_reconciliations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_reconciliations" ADD CONSTRAINT "fuel_reconciliations_fuelEntryId_fkey" FOREIGN KEY ("fuelEntryId") REFERENCES "fleet_fuel_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_reconciliations" ADD CONSTRAINT "fuel_reconciliations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

