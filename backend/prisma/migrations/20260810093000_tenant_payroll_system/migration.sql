-- Tenant duzeyinde DATEV bordro urunu. Ihracat bunu bilmeden dosya uretemez:
-- LODAS ile Lohn und Gehalt farkli dosya duzenleri ve farkli Lohnart
-- planlari kullaniyor. Surucu profilindeki alan bunu ezebiliyor.

-- AlterTable
ALTER TABLE "TenantPayrollProfile" ADD COLUMN "datevPayrollSystem" "DatevPayrollSystem";
