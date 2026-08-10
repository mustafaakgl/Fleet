-- Bordro hattini saglayicidan bagimsiz hale getirir (DATEV + Lexware).
--
-- Kapsam: sema, veri degil. Var olan satirlar DATEV LODAS / Lohn und Gehalt
-- degerlerini korur; yalnizca enum degerleri urun adiyla nitelenir
-- (lodas -> datev_lodas) ki Lexware urunu ayni alana sigsin.

-- 1) Hedef urun enum'u. DatevPayrollSystem'in yerini aliyor.
CREATE TYPE "PayrollTargetSystem" AS ENUM (
  'datev_lodas',
  'datev_lohn_und_gehalt',
  'lexware_lohn_und_gehalt'
);

ALTER TYPE "PayrollExportFormat" ADD VALUE IF NOT EXISTS 'lexware_ascii';

-- 2) TenantPayrollProfile.datevPayrollSystem -> payrollTargetSystem
ALTER TABLE "TenantPayrollProfile"
  ADD COLUMN "payrollTargetSystem" "PayrollTargetSystem";

UPDATE "TenantPayrollProfile"
SET "payrollTargetSystem" = CASE "datevPayrollSystem"
  WHEN 'lodas' THEN 'datev_lodas'::"PayrollTargetSystem"
  WHEN 'lohn_und_gehalt' THEN 'datev_lohn_und_gehalt'::"PayrollTargetSystem"
END
WHERE "datevPayrollSystem" IS NOT NULL;

ALTER TABLE "TenantPayrollProfile" DROP COLUMN "datevPayrollSystem";

-- 3) DriverPayrollProfile: personel numarasi saglayicidan bagimsiz adlandirilir,
--    urun alani hedef enum'una tasinir, turetilebilir provider alani dusurulur.
DROP INDEX IF EXISTS "DriverPayrollProfile_tenantId_datevPersonnelNumber_idx";

ALTER TABLE "DriverPayrollProfile"
  RENAME COLUMN "datevPersonnelNumber" TO "externalPersonnelNumber";

CREATE INDEX "DriverPayrollProfile_tenantId_externalPersonnelNumber_idx"
  ON "DriverPayrollProfile" ("tenantId", "externalPersonnelNumber");

ALTER TABLE "DriverPayrollProfile"
  ADD COLUMN "payrollTargetSystem" "PayrollTargetSystem";

UPDATE "DriverPayrollProfile"
SET "payrollTargetSystem" = CASE "datevPayrollSystem"
  WHEN 'lodas' THEN 'datev_lodas'::"PayrollTargetSystem"
  WHEN 'lohn_und_gehalt' THEN 'datev_lohn_und_gehalt'::"PayrollTargetSystem"
END
WHERE "datevPayrollSystem" IS NOT NULL;

ALTER TABLE "DriverPayrollProfile" DROP COLUMN "datevPayrollSystem";
-- Saglayici artik hedef urunden turetiliyor; ayri alan celiskili satira izin
-- veriyordu (provider=lexware + system=lodas).
ALTER TABLE "DriverPayrollProfile" DROP COLUMN "payrollProvider";

-- 4) PayrollWageTypeMapping: esleme urun bazinda kaliyor ama urun kumesi buyudu.
ALTER TABLE "PayrollWageTypeMapping"
  DROP CONSTRAINT IF EXISTS "PayrollWageTypeMapping_tenantId_payrollSystem_movementType_v_key";
DROP INDEX IF EXISTS "PayrollWageTypeMapping_tenantId_payrollSystem_movementType_idx";

ALTER TABLE "PayrollWageTypeMapping"
  ADD COLUMN "targetSystem" "PayrollTargetSystem";

UPDATE "PayrollWageTypeMapping"
SET "targetSystem" = CASE "payrollSystem"
  WHEN 'lodas' THEN 'datev_lodas'::"PayrollTargetSystem"
  WHEN 'lohn_und_gehalt' THEN 'datev_lohn_und_gehalt'::"PayrollTargetSystem"
END;

ALTER TABLE "PayrollWageTypeMapping" ALTER COLUMN "targetSystem" SET NOT NULL;
ALTER TABLE "PayrollWageTypeMapping" DROP COLUMN "payrollSystem";

ALTER TABLE "PayrollWageTypeMapping"
  RENAME COLUMN "datevWageTypeNumber" TO "externalWageType";

CREATE UNIQUE INDEX "PayrollWageTypeMapping_tenantId_targetSystem_movementType_v_key"
  ON "PayrollWageTypeMapping" ("tenantId", "targetSystem", "movementType", "validFrom");
CREATE INDEX "PayrollWageTypeMapping_tenantId_targetSystem_movementType_idx"
  ON "PayrollWageTypeMapping" ("tenantId", "targetSystem", "movementType");

-- 5) PayrollExport: notr dosyada hedef BOS kalmaya devam ediyor.
ALTER TABLE "PayrollExport"
  DROP CONSTRAINT IF EXISTS "PayrollExport_periodId_payrollSystem_format_version_key";

ALTER TABLE "PayrollExport"
  ADD COLUMN "targetSystem" "PayrollTargetSystem";

UPDATE "PayrollExport"
SET "targetSystem" = CASE "payrollSystem"
  WHEN 'lodas' THEN 'datev_lodas'::"PayrollTargetSystem"
  WHEN 'lohn_und_gehalt' THEN 'datev_lohn_und_gehalt'::"PayrollTargetSystem"
END
WHERE "payrollSystem" IS NOT NULL;

ALTER TABLE "PayrollExport" DROP COLUMN "payrollSystem";
ALTER TABLE "PayrollExport" DROP COLUMN "provider";

CREATE UNIQUE INDEX "PayrollExport_periodId_targetSystem_format_version_key"
  ON "PayrollExport" ("periodId", "targetSystem", "format", "version");

-- 6) Artik kimse kullanmiyor.
DROP TYPE "DatevPayrollSystem";
DROP TYPE "PayrollProvider";
