-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'device_silent';
ALTER TYPE "NotificationType" ADD VALUE 'fuel_theft_suspected';
ALTER TYPE "NotificationType" ADD VALUE 'telematics_coolant_high';
ALTER TYPE "NotificationType" ADD VALUE 'telematics_voltage_low';

-- CreateTable
CREATE TABLE "telemetry_quarantine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "imei" TEXT,
    "rawHex" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_quarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_processed_records" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_processed_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_quarantine_tenantId_idx" ON "telemetry_quarantine"("tenantId");

-- CreateIndex
CREATE INDEX "telemetry_quarantine_createdAt_idx" ON "telemetry_quarantine"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_processed_records_imei_recordedAt_priority_key" ON "telemetry_processed_records"("imei", "recordedAt", "priority");

-- CreateIndex
CREATE INDEX "telemetry_processed_records_createdAt_idx" ON "telemetry_processed_records"("createdAt");

-- AddForeignKey
ALTER TABLE "telemetry_quarantine" ADD CONSTRAINT "telemetry_quarantine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
