-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('truck', 'transporter', 'car', 'special');

-- CreateEnum
CREATE TYPE "DepartureCheckOverallStatus" AS ENUM ('ok', 'maengel_gemeldet');

-- CreateEnum
CREATE TYPE "DepartureCheckItemStatus" AS ENUM ('ok', 'defekt', 'na');

-- CreateEnum
CREATE TYPE "DefectSource" AS ENUM ('departure_check', 'manual_report');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('kritisch', 'mittel', 'gering');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('offen', 'in_reparatur', 'behoben', 'bestaetigt');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "category" "VehicleCategory" NOT NULL DEFAULT 'truck';

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "name" TEXT NOT NULL,
    "vehicleCategory" "VehicleCategory" NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "requiresPhotoOnDefect" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartureCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "templateId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "accuracyM" DOUBLE PRECISION,
    "overallStatus" "DepartureCheckOverallStatus" NOT NULL,
    "templateNameSnapshot" TEXT NOT NULL,
    "signatureConfirmedAt" TIMESTAMP(3),
    "signatureMetadata" JSONB,
    "clientSubmissionId" TEXT,
    "offlineCapturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartureCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartureCheckItemResult" (
    "id" TEXT NOT NULL,
    "departureCheckId" TEXT NOT NULL,
    "templateItemId" TEXT,
    "itemKey" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "result" "DepartureCheckItemStatus" NOT NULL,
    "defectDescription" TEXT,
    "photoStoredPaths" TEXT[],
    "photoMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartureCheckItemResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "reportedByDriverId" TEXT NOT NULL,
    "source" "DefectSource" NOT NULL,
    "departureCheckId" TEXT,
    "departureCheckItemResultId" TEXT,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "severity" "DefectSeverity" NOT NULL,
    "status" "DefectStatus" NOT NULL DEFAULT 'offen',
    "photoStoredPaths" TEXT[],
    "photoMetadata" JSONB,
    "repairCompany" TEXT,
    "estimatedRepairDate" DATE,
    "serviceRecordId" TEXT,
    "confirmationDriverId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectStatusLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "defectId" TEXT NOT NULL,
    "fromStatus" "DefectStatus",
    "toStatus" "DefectStatus" NOT NULL,
    "changedByUserId" TEXT,
    "changedByDriverId" TEXT,
    "note" TEXT,
    "repairCompany" TEXT,
    "estimatedRepairDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefectStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartureCheckReminderState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "lastReminderSentAt" TIMESTAMP(3),
    "lastEscalationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartureCheckReminderState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_tenantId_idx" ON "ChecklistTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_tenantId_vehicleCategory_isActive_idx" ON "ChecklistTemplate"("tenantId", "vehicleCategory", "isActive");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_tenantId_vehicleCategory_isDefault_idx" ON "ChecklistTemplate"("tenantId", "vehicleCategory", "isDefault");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_templateId_sortOrder_idx" ON "ChecklistTemplateItem"("templateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplateItem_templateId_itemKey_key" ON "ChecklistTemplateItem"("templateId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "DepartureCheck_clientSubmissionId_key" ON "DepartureCheck"("clientSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartureCheck_driverId_vehicleId_workDate_key" ON "DepartureCheck"("driverId", "vehicleId", "workDate");

-- CreateIndex
CREATE INDEX "DepartureCheck_tenantId_idx" ON "DepartureCheck"("tenantId");

-- CreateIndex
CREATE INDEX "DepartureCheck_driverId_workDate_idx" ON "DepartureCheck"("driverId", "workDate");

-- CreateIndex
CREATE INDEX "DepartureCheck_vehicleId_workDate_idx" ON "DepartureCheck"("vehicleId", "workDate");

-- CreateIndex
CREATE INDEX "DepartureCheck_assignmentId_idx" ON "DepartureCheck"("assignmentId");

-- CreateIndex
CREATE INDEX "DepartureCheck_performedAt_idx" ON "DepartureCheck"("performedAt");

-- CreateIndex
CREATE INDEX "DepartureCheckItemResult_departureCheckId_sortOrder_idx" ON "DepartureCheckItemResult"("departureCheckId", "sortOrder");

-- CreateIndex
CREATE INDEX "DepartureCheckItemResult_templateItemId_idx" ON "DepartureCheckItemResult"("templateItemId");

-- CreateIndex
CREATE INDEX "Defect_tenantId_idx" ON "Defect"("tenantId");

-- CreateIndex
CREATE INDEX "Defect_vehicleId_status_idx" ON "Defect"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "Defect_vehicleId_severity_status_idx" ON "Defect"("vehicleId", "severity", "status");

-- CreateIndex
CREATE INDEX "Defect_reportedByDriverId_createdAt_idx" ON "Defect"("reportedByDriverId", "createdAt");

-- CreateIndex
CREATE INDEX "Defect_confirmationDriverId_status_idx" ON "Defect"("confirmationDriverId", "status");

-- CreateIndex
CREATE INDEX "Defect_departureCheckId_idx" ON "Defect"("departureCheckId");

-- CreateIndex
CREATE INDEX "Defect_anonymizedAt_idx" ON "Defect"("anonymizedAt");

-- CreateIndex
CREATE INDEX "DefectStatusLog_tenantId_idx" ON "DefectStatusLog"("tenantId");

-- CreateIndex
CREATE INDEX "DefectStatusLog_defectId_createdAt_idx" ON "DefectStatusLog"("defectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepartureCheckReminderState_driverId_workDate_key" ON "DepartureCheckReminderState"("driverId", "workDate");

-- CreateIndex
CREATE INDEX "DepartureCheckReminderState_tenantId_idx" ON "DepartureCheckReminderState"("tenantId");

-- CreateIndex
CREATE INDEX "DepartureCheckReminderState_workDate_idx" ON "DepartureCheckReminderState"("workDate");

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheck" ADD CONSTRAINT "DepartureCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheck" ADD CONSTRAINT "DepartureCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheck" ADD CONSTRAINT "DepartureCheck_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheck" ADD CONSTRAINT "DepartureCheck_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheck" ADD CONSTRAINT "DepartureCheck_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheckItemResult" ADD CONSTRAINT "DepartureCheckItemResult_departureCheckId_fkey" FOREIGN KEY ("departureCheckId") REFERENCES "DepartureCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheckItemResult" ADD CONSTRAINT "DepartureCheckItemResult_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ChecklistTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_reportedByDriverId_fkey" FOREIGN KEY ("reportedByDriverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_departureCheckId_fkey" FOREIGN KEY ("departureCheckId") REFERENCES "DepartureCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_departureCheckItemResultId_fkey" FOREIGN KEY ("departureCheckItemResultId") REFERENCES "DepartureCheckItemResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_confirmationDriverId_fkey" FOREIGN KEY ("confirmationDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectStatusLog" ADD CONSTRAINT "DefectStatusLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectStatusLog" ADD CONSTRAINT "DefectStatusLog_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectStatusLog" ADD CONSTRAINT "DefectStatusLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectStatusLog" ADD CONSTRAINT "DefectStatusLog_changedByDriverId_fkey" FOREIGN KEY ("changedByDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheckReminderState" ADD CONSTRAINT "DepartureCheckReminderState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureCheckReminderState" ADD CONSTRAINT "DepartureCheckReminderState_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
