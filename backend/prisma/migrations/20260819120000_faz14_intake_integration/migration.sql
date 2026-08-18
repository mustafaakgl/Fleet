-- Faz 14 — gelen kutusu entegrasyonu.
--
-- TAMAMEN EKLEMELI: tablo/kolon dusurulmuyor, veri silinmiyor. Iki degisiklik:
--
-- 1) `automation_documents.uploadedById` NULLABLE oldu. Connector (tarayici)
--    yuklemesinde makinenin arkasinda o an bir insan olmayabilir; olmayan
--    kullaniciyi uydurmak denetimde SAHTE bir sorumlu yaratirdi. Var olan
--    satirlarin hepsi dolu; bu degisiklik hicbir veriyi etkilemiyor.
--
-- 2) `intake_documents.driverId` eklendi. `FleetFuelEntry.driverId` NOT NULL:
--    yakit fisinin canonical kaydi SURUCUSUZ acilamaz. Surucu BELGEDEN
--    OKUNMUYOR — insan seciyor. Secilmediyse belge `needs_domain_review`da
--    bekler ve PARALEL BIR MODEL UYDURULMAZ.
-- DropForeignKey
ALTER TABLE "automation_documents" DROP CONSTRAINT "automation_documents_uploadedById_fkey";

-- AlterTable
ALTER TABLE "automation_documents" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "intake_documents" ADD COLUMN     "driverId" TEXT;

-- CreateIndex
CREATE INDEX "intake_documents_driverId_idx" ON "intake_documents"("driverId");

-- AddForeignKey
ALTER TABLE "automation_documents" ADD CONSTRAINT "automation_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_documents" ADD CONSTRAINT "intake_documents_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

