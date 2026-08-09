-- Surucunun bastigi mola ile takografin REST kaydinin karsilastirilmasi.
--
-- Takograf BORDRONUN KAYNAGI DEGIL: ana kayit surucunun kendi Zeiterfassung'u,
-- bu alanlar yalnizca dogrulama/anomali icin. Bordro hesabina girmiyorlar.
--
-- NULL kalabilirler ve bu anlamlidir: o gun icin DDD verisi yok demektir.
-- Sifir yazmak "surucu hic dinlenmedi" demek olurdu, oysa dosyanin gelmemis
-- olmasi bunu ima etmez.

-- AlterTable
ALTER TABLE "PayrollDay"
  ADD COLUMN "tachoRestMinutes" INTEGER,
  ADD COLUMN "tachoDeltaMinutes" INTEGER;

-- Surucu dugmeye basmayi geciktirir, takograf aracin durusundan sayar; ikisi
-- dakikasi dakikasina tutmaz. Bu esigin USTU incelenir.
-- AlterTable
ALTER TABLE "TenantPayrollProfile" ADD COLUMN "tachoBreakToleranceMinutes" INTEGER NOT NULL DEFAULT 15;
