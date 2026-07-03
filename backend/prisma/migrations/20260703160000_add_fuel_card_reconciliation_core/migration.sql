-- CreateEnum
CREATE TYPE "FuelCardTransactionStatus" AS ENUM ('imported', 'matched', 'disputed', 'ignored');

-- CreateTable
CREATE TABLE "fuel_card_import_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "sourceFileName" TEXT NOT NULL,
    "sourceStoredPath" TEXT,
    "sourceMimeType" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "matchedRows" INTEGER NOT NULL DEFAULT 0,
    "unmatchedRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_card_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_card_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "batchId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "fuelEntryId" TEXT,
    "externalReference" TEXT,
    "cardLast4" TEXT,
    "merchantName" TEXT NOT NULL,
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "liters" DECIMAL(10,3),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "odometerKm" DECIMAL(12,3),
    "status" "FuelCardTransactionStatus" NOT NULL DEFAULT 'imported',
    "matchScore" INTEGER,
    "matchNote" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_card_import_batches_tenantId_idx" ON "fuel_card_import_batches"("tenantId");

-- CreateIndex
CREATE INDEX "fuel_card_transactions_tenantId_idx" ON "fuel_card_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "fuel_card_transactions_batchId_idx" ON "fuel_card_transactions"("batchId");

-- CreateIndex
CREATE INDEX "fuel_card_transactions_vehicleId_transactionAt_idx" ON "fuel_card_transactions"("vehicleId", "transactionAt");

-- CreateIndex
CREATE INDEX "fuel_card_transactions_driverId_transactionAt_idx" ON "fuel_card_transactions"("driverId", "transactionAt");

-- CreateIndex
CREATE INDEX "fuel_card_transactions_fuelEntryId_idx" ON "fuel_card_transactions"("fuelEntryId");

-- CreateIndex
CREATE INDEX "fuel_card_transactions_status_idx" ON "fuel_card_transactions"("status");

-- AddForeignKey
ALTER TABLE "fuel_card_import_batches" ADD CONSTRAINT "fuel_card_import_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_card_transactions" ADD CONSTRAINT "fuel_card_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_card_transactions" ADD CONSTRAINT "fuel_card_transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fuel_card_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_card_transactions" ADD CONSTRAINT "fuel_card_transactions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_card_transactions" ADD CONSTRAINT "fuel_card_transactions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_card_transactions" ADD CONSTRAINT "fuel_card_transactions_fuelEntryId_fkey" FOREIGN KEY ("fuelEntryId") REFERENCES "fleet_fuel_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
