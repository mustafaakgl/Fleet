-- Bordro ihracati ve Ruckrechnung damgasi (Faz 4c).
--
-- PayrollWageTypeMapping: DATEV Lohnart numaralari koda GOMULMUYOR, her
-- Steuerberater kendi planini kullaniyor.
--
-- PayrollExport: DatevExport ile ayni sekil ama AYRI tablo ve ayri klasor —
-- Rechnungswesen ile Lohn iki farkli DATEV urunu.
--
-- PayrollEntry.correctionThroughAt: gec gelen olaylar ayri tabloda degil,
-- TURETILEREK bulunuyor (createdAt > approvedAt). Bu damga olmadan ayni
-- degisiklik her seferinde yeniden duzeltme olarak cikardi.
--
-- NOT: `migrate diff` bu sema disinda baskasinin migrate edilmemis
-- degisikliklerini de gosteriyor; BILEREK dahil edilmedi.

-- CreateEnum
CREATE TYPE "PayrollWageType" AS ENUM ('regular', 'overtime', 'night', 'night_core', 'sunday', 'holiday', 'vacation', 'sick', 'unpaid_absence');

-- CreateEnum
CREATE TYPE "PayrollExportFormat" AS ENUM ('neutral_csv', 'lodas', 'lohn_und_gehalt');

-- CreateEnum
CREATE TYPE "PayrollExportStatus" AS ENUM ('generated', 'downloaded');

-- AlterTable
ALTER TABLE "PayrollEntry" ADD COLUMN     "correctionThroughAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PayrollWageTypeMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "wageType" "PayrollWageType" NOT NULL,
    "datevWageTypeNumber" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollWageTypeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "periodId" TEXT NOT NULL,
    "format" "PayrollExportFormat" NOT NULL DEFAULT 'neutral_csv',
    "fileStoredPath" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "entryIds" JSONB NOT NULL,
    "status" "PayrollExportStatus" NOT NULL DEFAULT 'generated',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollWageTypeMapping_tenantId_idx" ON "PayrollWageTypeMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollWageTypeMapping_tenantId_wageType_key" ON "PayrollWageTypeMapping"("tenantId", "wageType");

-- CreateIndex
CREATE INDEX "PayrollExport_tenantId_idx" ON "PayrollExport"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollExport_periodId_createdAt_idx" ON "PayrollExport"("periodId", "createdAt");

-- AddForeignKey
ALTER TABLE "PayrollWageTypeMapping" ADD CONSTRAINT "PayrollWageTypeMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
