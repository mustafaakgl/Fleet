-- Ofis duzeltmesi append-only kaydi bozmadan islesin diye ustunu cizme bagi.
-- Duzeltilen olay guncellenmez; yeni olay eskisini isaret eder ve katlama
-- ustu cizileni atlar. Tek basina zaman siralamasi yetmiyordu: duzeltme cikis
-- saatini ILERI alirsa orijinal cikis once gelip uygulanirdi.
--
-- @unique: bir olayin ustu yalnizca bir kez cizilebilir; duzeltmenin de
-- duzeltilmesi zinciri uzatir, dallandirmaz.

-- AlterTable
ALTER TABLE "WorkTimeEvent" ADD COLUMN "supersedesEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkTimeEvent_supersedesEventId_key" ON "WorkTimeEvent"("supersedesEventId");

-- AddForeignKey
ALTER TABLE "WorkTimeEvent" ADD CONSTRAINT "WorkTimeEvent_supersedesEventId_fkey" FOREIGN KEY ("supersedesEventId") REFERENCES "WorkTimeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
