-- Duzeltme kaleminin isaret ettigi donem artik gercek bir FK.
-- Ihracat "hangi donemi duzeltiyor" bilgisini join'le okuyor; skaler alan
-- yeterli degildi ve silinmis bir donemi isaret eden kalem birakabilirdi.
-- RESTRICT: ustunde duzeltme duran donem silinemez.

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_correctsPeriodId_fkey" FOREIGN KEY ("correctsPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
