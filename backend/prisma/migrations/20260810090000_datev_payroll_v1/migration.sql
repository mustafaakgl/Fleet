-- DATEV hattinin ayri bir urun parcasi olarak kurulmasi (V1: dosya export).
--
-- UC YAPISAL DEGISIKLIK:
--
-- 1. PayrollWageType → PayrollMovementType. Isim degisikligi degil, kavram
--    degisikligi: bu artik Fleet'in KENDI hareket dili, DATEV'in Lohnart'i
--    degil. Disari cikan numara esleme tablosundan geliyor, boylece DATEV
--    yerine baska bir bordro sistemi eklendiginde hesap katmani degismiyor.
--    allowance/expense simdiden eklendi (para tutarli hareketler); hesap
--    katmani henuz uretmiyor ama sema sonradan degismesin.
--
-- 2. Esleme ve surucu profili SURUMLENDI. Lohnart planlari ve personel
--    numaralari yil icinde degisebiliyor; gecmis bir donem yeniden
--    uretildiginde O TARIHTE gecerli olan deger kullanilmali. Profil
--    surumlendigi icin driverId artik tekil DEGIL ve personel numarasi
--    tekilligi veritabanindan uygulama katmanina tasindi ("ayni anda iki
--    surucude ayni numara" kontrolu hazirlik dogrulamasinda).
--
-- 3. PayrollExport surumlu ve degismez. Yanlis dosya DUZELTILMIYOR; yenisi
--    uretilip eskisi superseded oluyor, cunku hangi dosyanin gonderildigi
--    sonradan kanitlanabilmeli. sourceHash ihracat anindaki kaynak verinin
--    ozeti: donem sonradan degistiyse dosyanin bayatladigi anlasilir.
--
-- Uc tablo da BOS (0 satir) oldugu icin NOT NULL sutunlar varsayilansiz
-- eklenebiliyor ve enum yerine konabiliyor.
--
-- NOT: `migrate diff` bu sema disinda baskasinin migrate edilmemis
-- degisikliklerini de gosteriyor; BILEREK dahil edilmedi.

-- CreateEnum
CREATE TYPE "PayrollMovementType" AS ENUM ('regular_hours', 'overtime_hours', 'night_hours', 'night_core_hours', 'sunday_hours', 'holiday_hours', 'vacation', 'sickness', 'unpaid_absence', 'allowance', 'expense');

-- CreateEnum
CREATE TYPE "PayrollProvider" AS ENUM ('datev');

-- CreateEnum
CREATE TYPE "DatevPayrollSystem" AS ENUM ('lodas', 'lohn_und_gehalt');

-- AlterEnum
BEGIN;
CREATE TYPE "PayrollExportFormat_new" AS ENUM ('neutral_csv', 'datev_ascii');
ALTER TABLE "public"."PayrollExport" ALTER COLUMN "format" DROP DEFAULT;
ALTER TABLE "PayrollExport" ALTER COLUMN "format" TYPE "PayrollExportFormat_new" USING ("format"::text::"PayrollExportFormat_new");
ALTER TYPE "PayrollExportFormat" RENAME TO "PayrollExportFormat_old";
ALTER TYPE "PayrollExportFormat_new" RENAME TO "PayrollExportFormat";
DROP TYPE "public"."PayrollExportFormat_old";
ALTER TABLE "PayrollExport" ALTER COLUMN "format" SET DEFAULT 'neutral_csv';
COMMIT;

-- AlterEnum: yeni durum degerleri (ayni islemde KULLANILMIYOR)
ALTER TYPE "PayrollExportStatus" ADD VALUE 'generating';
ALTER TYPE "PayrollExportStatus" ADD VALUE 'submitted';
ALTER TYPE "PayrollExportStatus" ADD VALUE 'superseded';
ALTER TYPE "PayrollExportStatus" ADD VALUE 'failed';

-- DropIndex
DROP INDEX "DriverPayrollProfile_driverId_key";

-- DropIndex
DROP INDEX "DriverPayrollProfile_tenantId_datevPersonnelNumber_key";

-- DropIndex
DROP INDEX "PayrollWageTypeMapping_tenantId_wageType_key";

-- AlterTable
ALTER TABLE "DriverPayrollProfile" ADD COLUMN     "datevPayrollSystem" "DatevPayrollSystem",
ADD COLUMN     "payrollProvider" "PayrollProvider" NOT NULL DEFAULT 'datev',
ADD COLUMN     "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "validTo" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PayrollExport" DROP COLUMN "fileSha256",
DROP COLUMN "fileStoredPath",
ADD COLUMN     "payloadSha256" TEXT NOT NULL,
ADD COLUMN     "payloadStoredPath" TEXT NOT NULL,
ADD COLUMN     "payrollSystem" "DatevPayrollSystem",
ADD COLUMN     "provider" "PayrollProvider" NOT NULL DEFAULT 'datev',
ADD COLUMN     "recordCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceHash" TEXT NOT NULL,
ADD COLUMN     "supersedesExportId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PayrollWageTypeMapping" DROP COLUMN "wageType",
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "costUnit" TEXT,
ADD COLUMN     "movementType" "PayrollMovementType" NOT NULL,
ADD COLUMN     "payrollSystem" "DatevPayrollSystem" NOT NULL,
ADD COLUMN     "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "validTo" TIMESTAMP(3);

-- DropEnum
DROP TYPE "PayrollWageType";

-- CreateIndex
CREATE INDEX "DriverPayrollProfile_tenantId_datevPersonnelNumber_idx" ON "DriverPayrollProfile"("tenantId", "datevPersonnelNumber");

-- CreateIndex
CREATE INDEX "DriverPayrollProfile_driverId_validFrom_idx" ON "DriverPayrollProfile"("driverId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayrollProfile_driverId_validFrom_key" ON "DriverPayrollProfile"("driverId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollExport_supersedesExportId_key" ON "PayrollExport"("supersedesExportId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollExport_periodId_payrollSystem_format_version_key" ON "PayrollExport"("periodId", "payrollSystem", "format", "version");

-- CreateIndex
CREATE INDEX "PayrollWageTypeMapping_tenantId_payrollSystem_movementType_idx" ON "PayrollWageTypeMapping"("tenantId", "payrollSystem", "movementType");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollWageTypeMapping_tenantId_payrollSystem_movementType__key" ON "PayrollWageTypeMapping"("tenantId", "payrollSystem", "movementType", "validFrom");

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_supersedesExportId_fkey" FOREIGN KEY ("supersedesExportId") REFERENCES "PayrollExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
