-- Bordro hesap katmani (Faz 4b): donem, gun, kalem.
--
-- PayrollDay YEREL takvim gunudur: gece yarisini asan vardiya iki satira
-- bolunur, cunku gece/Pazar/tatil zamlari dakikanin gerceklestigi gune bagli.
--
-- `approved` dondurma noktasi: gun satirlari orada kesinlesir. Sonradan gelen
-- cevrimdisi olay donemi degistirmez, sonraki doneme duzeltme (Ruckrechnung)
-- olarak tasinir — bunun tasiyicisi PayrollEntry.kind + correctsPeriodId.
--
-- NOT: `migrate diff` bu sema disinda baskasinin migrate edilmemis
-- degisikliklerini de gosteriyor; BILEREK dahil edilmedi.

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('draft', 'review', 'approved', 'exported', 'locked');

-- CreateEnum
CREATE TYPE "PayrollEntryKind" AS ENUM ('regular', 'correction');

-- CreateEnum
CREATE TYPE "PayrollDayTypeSource" AS ENUM ('holiday_table', 'calendar', 'events', 'unmapped', 'none');

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "periodId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayType" "PayrollDayType",
    "dayTypeSource" "PayrollDayTypeSource" NOT NULL,
    "calendarCode" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightCoreMinutes" INTEGER NOT NULL DEFAULT 0,
    "sundayMinutes" INTEGER NOT NULL DEFAULT 0,
    "holidayMinutes" INTEGER NOT NULL DEFAULT 0,
    "anomalies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "periodId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "PayrollEntryKind" NOT NULL DEFAULT 'regular',
    "correctsPeriodId" TEXT,
    "targetMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "creditedMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "balanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightCoreMinutes" INTEGER NOT NULL DEFAULT 0,
    "sundayMinutes" INTEGER NOT NULL DEFAULT 0,
    "holidayMinutes" INTEGER NOT NULL DEFAULT 0,
    "vacationDays" INTEGER NOT NULL DEFAULT 0,
    "sickDays" INTEGER NOT NULL DEFAULT 0,
    "unpaidAbsenceDays" INTEGER NOT NULL DEFAULT 0,
    "driverProfileSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollPeriod_tenantId_idx" ON "PayrollPeriod"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_tenantId_status_idx" ON "PayrollPeriod"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_tenantId_year_month_key" ON "PayrollPeriod"("tenantId", "year", "month");

-- CreateIndex
CREATE INDEX "PayrollDay_tenantId_idx" ON "PayrollDay"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollDay_periodId_driverId_idx" ON "PayrollDay"("periodId", "driverId");

-- CreateIndex
CREATE INDEX "PayrollDay_tenantId_driverId_date_idx" ON "PayrollDay"("tenantId", "driverId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDay_periodId_driverId_date_key" ON "PayrollDay"("periodId", "driverId", "date");

-- CreateIndex
CREATE INDEX "PayrollEntry_tenantId_idx" ON "PayrollEntry"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollEntry_periodId_idx" ON "PayrollEntry"("periodId");

-- CreateIndex
CREATE INDEX "PayrollEntry_tenantId_driverId_idx" ON "PayrollEntry"("tenantId", "driverId");

-- CreateIndex
CREATE INDEX "PayrollEntry_correctsPeriodId_idx" ON "PayrollEntry"("correctsPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_periodId_driverId_kind_correctsPeriodId_key" ON "PayrollEntry"("periodId", "driverId", "kind", "correctsPeriodId");

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDay" ADD CONSTRAINT "PayrollDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDay" ADD CONSTRAINT "PayrollDay_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDay" ADD CONSTRAINT "PayrollDay_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
