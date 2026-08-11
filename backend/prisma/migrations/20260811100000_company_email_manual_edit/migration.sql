-- Elle duzenlenmis firma e-postasini yeniden uretimden korur.
--
-- Bugune kadar generateDraftForCompany, kayit varsa konuyu ve govdeyi kosulsuz
-- uzerine yaziyordu; ofisin elle duzelttigi metin 18:00 cron'unda siliniyordu.
-- Bu damga konunca yeniden uretim metne dokunmaz, yalnizca durumu
-- needs_review yapar.
--
-- Mevcut satirlar NULL kalir: hicbiri elle duzenlenmis sayilmaz, yani
-- davranislari bugunku gibi surer.

-- AlterTable
ALTER TABLE "CompanyEmail" ADD COLUMN "manuallyEditedAt" TIMESTAMP(3);
