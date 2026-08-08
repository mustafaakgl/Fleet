-- Sürücüyü bağlı olduğu müşteri firmaya bağlar (Einsatzplan'daki "Abteilung").
ALTER TABLE "Driver" ADD COLUMN "companyId" TEXT;

CREATE INDEX "Driver_companyId_idx" ON "Driver"("companyId");

ALTER TABLE "Driver"
  ADD CONSTRAINT "Driver_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
