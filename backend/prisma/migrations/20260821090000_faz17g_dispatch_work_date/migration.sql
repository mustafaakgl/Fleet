-- Faz 17g — planin ait oldugu IS GUNU saklaniyor.
--
-- NEDEN: `DispatchApprovalService` is gununu `computedAt`ten TURETIYORDU.
-- Yani Carsamba gunu planlanan bir Cuma turu CARSAMBA'ya yazilir, cakisma
-- kontrolu de yanlis gune bakardi: "arac musait" denip aslinda dolu oldugu
-- bir gune gorev acilabilirdi. Talep edilen gun hicbir yerde saklanmiyordu.
--
-- GERIYE DONUK DOLDURMA: var olan satirlarda `computedAt`in GUNU yaziliyor —
-- eski davranisin ta kendisi. Uydurma bir gun yazmak, gecmis planlari sessizce
-- baska bir gune tasirdi.
ALTER TABLE "dispatch_proposals" ADD COLUMN "workDate" TIMESTAMP(3);
UPDATE "dispatch_proposals" SET "workDate" = date_trunc('day', "computedAt") WHERE "workDate" IS NULL;
ALTER TABLE "dispatch_proposals" ALTER COLUMN "workDate" SET NOT NULL;
