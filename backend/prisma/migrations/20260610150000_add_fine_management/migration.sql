-- CreateEnum
CREATE TYPE "FineViolationCategory" AS ENUM ('speed', 'parking', 'red_light', 'distance', 'other');

-- CreateEnum
CREATE TYPE "FineMatchType" AS ENUM ('auto', 'manual', 'unmatched');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('neu', 'fahrer_zugeordnet', 'fahrer_benachrichtigt', 'bezahlt', 'widerspruch', 'abgeschlossen');

-- CreateTable
CREATE TABLE "Fine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "matchType" "FineMatchType" NOT NULL DEFAULT 'unmatched',
    "matchedWorkSessionId" TEXT,
    "matchedAssignmentId" TEXT,
    "violationAt" TIMESTAMP(3) NOT NULL,
    "violationLocation" TEXT NOT NULL,
    "violationType" TEXT NOT NULL,
    "violationCategory" "FineViolationCategory" NOT NULL,
    "amount" DECIMAL(10,2),
    "paymentDueDate" DATE,
    "noticeDate" DATE,
    "documentStoredPath" TEXT,
    "documentMimeType" TEXT,
    "status" "FineStatus" NOT NULL DEFAULT 'neu',
    "notes" TEXT,
    "matchCandidates" JSONB,
    "matchToleranceMinutes" INTEGER NOT NULL DEFAULT 30,
    "driverNotifiedAt" TIMESTAMP(3),
    "driverAcknowledgedAt" TIMESTAMP(3),
    "driverAckMetadata" JSONB,
    "lastDriverReminderSentAt" TIMESTAMP(3),
    "lastDriverEscalationSentAt" TIMESTAMP(3),
    "lastPaymentReminderDays" INTEGER,
    "lastPaymentReminderSentAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FineStatusLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "fineId" TEXT NOT NULL,
    "fromStatus" "FineStatus",
    "toStatus" "FineStatus" NOT NULL,
    "changedByUserId" TEXT,
    "changedByDriverId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FineStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fine_tenantId_idx" ON "Fine"("tenantId");

-- CreateIndex
CREATE INDEX "Fine_vehicleId_violationAt_idx" ON "Fine"("vehicleId", "violationAt");

-- CreateIndex
CREATE INDEX "Fine_driverId_violationAt_idx" ON "Fine"("driverId", "violationAt");

-- CreateIndex
CREATE INDEX "Fine_status_idx" ON "Fine"("status");

-- CreateIndex
CREATE INDEX "Fine_paymentDueDate_idx" ON "Fine"("paymentDueDate");

-- CreateIndex
CREATE INDEX "Fine_noticeDate_idx" ON "Fine"("noticeDate");

-- CreateIndex
CREATE INDEX "Fine_matchType_idx" ON "Fine"("matchType");

-- CreateIndex
CREATE INDEX "Fine_violationCategory_idx" ON "Fine"("violationCategory");

-- CreateIndex
CREATE INDEX "FineStatusLog_tenantId_idx" ON "FineStatusLog"("tenantId");

-- CreateIndex
CREATE INDEX "FineStatusLog_fineId_createdAt_idx" ON "FineStatusLog"("fineId", "createdAt");

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_matchedWorkSessionId_fkey" FOREIGN KEY ("matchedWorkSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_matchedAssignmentId_fkey" FOREIGN KEY ("matchedAssignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineStatusLog" ADD CONSTRAINT "FineStatusLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineStatusLog" ADD CONSTRAINT "FineStatusLog_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineStatusLog" ADD CONSTRAINT "FineStatusLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineStatusLog" ADD CONSTRAINT "FineStatusLog_changedByDriverId_fkey" FOREIGN KEY ("changedByDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
