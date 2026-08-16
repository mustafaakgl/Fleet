-- Muhasebe yakit fisi incelemesi (Faz 7).
--
-- YENI TABLO YOK ve bilincli olarak olmayacak:
--   * Onay AYRI BIR MALIYET SATIRI uretmiyor — maliyet sorgusu zaten
--     `workflowStatus = 'approved'` satirlarini topluyor. Ikinci bir "gider"
--     ya da "onay" tablosu ayni gercegi iki yerde tutar ve raporlarin
--     hangisini saydigini belirsiz birakirdi.
--   * Review GECMISI icin de paralel model yok: AuditLog kiraci kapsamli ve
--     entityType + entityId + action ile sorgulanabiliyor. Asagidaki alanlar
--     yalnizca SON durumun ozeti.
--
-- VERI KAYBI YOK: yalnizca yeni nullable kolonlar + bir indeks + bir FK.
-- Hicbir DROP, hicbir UPDATE, hicbir satir silme. Mevcut kayitlarin
-- `workflowStatus` degeri DEGISMIYOR — Faz 6'da `approved`a backfill edilen
-- gecmis kayitlar oldugu gibi kaliyor ve raporlar ayni rakami vermeye
-- devam ediyor.

-- AlterTable
ALTER TABLE "fleet_fuel_entries"
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "accountingNote" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "resubmittedAt" TIMESTAMP(3);

-- CreateIndex
-- Muhasebe kuyrugunun canonical sorgusu: kiraci + durum + en uzun bekleyen
-- once. `submittedAt` siralamasi indekste, cunku varsayilan gorunum tam olarak
-- bu ve buyuk filolarda her acilista tam tarama yapilmamali.
CREATE INDEX "fleet_fuel_entries_tenantId_workflowStatus_submittedAt_idx"
  ON "fleet_fuel_entries"("tenantId", "workflowStatus", "submittedAt");

-- AddForeignKey
-- SetNull: inceleyen kullanici silinse bile fisin kendisi bir MALI kayittir
-- ve ayakta kalmali; kimin onayladigi bilgisi denetim kaydinda da duruyor.
-- User tablosu @@map'siz -> tirnakli PascalCase hedef.
ALTER TABLE "fleet_fuel_entries"
  ADD CONSTRAINT "fleet_fuel_entries_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
