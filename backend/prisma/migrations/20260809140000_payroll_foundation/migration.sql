-- DATEV Lohn zemini (Faz 4a): yapilandirma katmani. Hesap ve ihracat yok.
--
-- TenantPayrollProfile, TenantBillingProfile'in aynadaki esi: orasi
-- Rechnungswesen (AR/EXTF), burasi Lohn. AYRI tablolar cunku DATEV'de iki
-- farkli urun ve Mandantennummer bile ayri olabiliyor.
--
-- NOT: `migrate diff` bu sema disinda baskasinin migrate edilmemis
-- degisikliklerini de gosteriyor (tacho/ddd indeksleri, EquipmentIssuance
-- default'lari, HandoverPhoto indeks adi) — BILEREK dahil edilmedi.

-- CreateEnum
CREATE TYPE "PayrollDayType" AS ENUM ('work', 'vacation', 'sick', 'holiday', 'off', 'absence_unpaid');

-- CreateEnum
CREATE TYPE "PayrollEmploymentType" AS ENUM ('full_time', 'part_time', 'mini_job', 'working_student', 'apprentice');

-- CreateEnum
CREATE TYPE "GermanState" AS ENUM ('BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH');

-- CreateTable
CREATE TABLE "TenantPayrollProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "datevConsultantNumber" TEXT,
    "datevClientNumber" TEXT,
    "bundesland" "GermanState",
    "nightWindowStartMinute" INTEGER NOT NULL DEFAULT 1200,
    "nightWindowEndMinute" INTEGER NOT NULL DEFAULT 360,
    "nightCoreStartMinute" INTEGER NOT NULL DEFAULT 0,
    "nightCoreEndMinute" INTEGER NOT NULL DEFAULT 240,
    "roundingMinutes" INTEGER NOT NULL DEFAULT 1,
    "defaultWeeklyTargetMinutes" INTEGER NOT NULL DEFAULT 2400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPayrollProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayrollProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "datevPersonnelNumber" TEXT NOT NULL,
    "weeklyTargetMinutes" INTEGER,
    "monthlyTargetMinutes" INTEGER,
    "costCenter" TEXT,
    "costUnit" TEXT,
    "employmentType" "PayrollEmploymentType" NOT NULL DEFAULT 'full_time',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPayrollProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "bundesland" "GermanState",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDayTypeMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "calendarCode" TEXT NOT NULL,
    "dayType" "PayrollDayType" NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollDayTypeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPayrollProfile_tenantId_key" ON "TenantPayrollProfile"("tenantId");

-- CreateIndex
CREATE INDEX "TenantPayrollProfile_tenantId_idx" ON "TenantPayrollProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayrollProfile_driverId_key" ON "DriverPayrollProfile"("driverId");

-- CreateIndex
CREATE INDEX "DriverPayrollProfile_tenantId_idx" ON "DriverPayrollProfile"("tenantId");

-- Iki suruculye ayni personel numarasi verilirse bordro satirlari sessizce birlesir.
-- CreateIndex
CREATE UNIQUE INDEX "DriverPayrollProfile_tenantId_datevPersonnelNumber_key" ON "DriverPayrollProfile"("tenantId", "datevPersonnelNumber");

-- CreateIndex
CREATE INDEX "PublicHoliday_tenantId_idx" ON "PublicHoliday"("tenantId");

-- CreateIndex
CREATE INDEX "PublicHoliday_tenantId_date_idx" ON "PublicHoliday"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_tenantId_date_key" ON "PublicHoliday"("tenantId", "date");

-- CreateIndex
CREATE INDEX "PayrollDayTypeMapping_tenantId_idx" ON "PayrollDayTypeMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDayTypeMapping_tenantId_calendarCode_key" ON "PayrollDayTypeMapping"("tenantId", "calendarCode");

-- AddForeignKey
ALTER TABLE "TenantPayrollProfile" ADD CONSTRAINT "TenantPayrollProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayrollProfile" ADD CONSTRAINT "DriverPayrollProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayrollProfile" ADD CONSTRAINT "DriverPayrollProfile_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDayTypeMapping" ADD CONSTRAINT "PayrollDayTypeMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
