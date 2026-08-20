-- Faz 17 — dispatch uretim yasam dongusu ve exactly-once koruması.
--
-- GUVENLI SEMA GEVSETMESI: `dispatch_proposals.proposalId` NOT NULL'dan
-- NULLABLE'a cekiliyor. Bu YIKICI DEGIL — var olan hicbir deger kaybolmaz ve
-- daha once gecerli olan her satir gecerli kalir. Ters yon (nullable -> NOT
-- NULL) yikici olurdu; bu yon degil.
--
-- NEDEN GEREKLI: `DispatchProposal` artik hem URETIM TALEBINI hem SONRADAN
-- BAGLANAN sonucu temsil ediyor. `AutomationProposal` ancak worker isi
-- tamamlayinca dogdugu icin, talep dogarken bu alan bos olmak zorunda.
--
-- `@unique` TEK BASINA YETMEZ: PostgreSQL NULL'lari birbirinden ayri sayar,
-- yani birden fazla talep ayni anda `proposalId IS NULL` tasiyabilir. Asil
-- koruma su iki mekanizma:
--
--   1. `activeFingerprint` TEKIL — ayni planlama baglaminda AYNI ANDA yalnizca
--      bir CANLI uretim olabilir. Kalici DEGIL: basarisiz/suresi dolmus ya da
--      karara baglanmis oneri alani birakir, boylece ayni siparis daha sonra
--      BILINCLI olarak yeniden planlanabilir. `(order, revision)` uzerine
--      kalici unique koysaydik, musteri hicbir sey degistirmeden ikinci kez
--      plan yapamazdi.
--
--   2. Worker tamamlamasi KOSULLU UPDATE (CAS) ile yapiliyor: dogru job,
--      dogru attempt, guncel sourceRevision, `proposalId IS NULL` ve
--      `generation = processing`. Gec ya da tekrarlanan cevap ikinci bir
--      `AutomationProposal` baglantisi olusturamaz.
--
-- `jobId` TEKIL: bir oneri en fazla bir isle iliskilenir; oneri ve is AYNI
-- TRANSACTION'da olusuyor.

-- CreateEnum
CREATE TYPE "DispatchProposalGeneration" AS ENUM ('queued', 'processing', 'ready', 'failed', 'expired');

-- AlterTable: uretim alanlari
ALTER TABLE "dispatch_proposals"
  ADD COLUMN "generation" "DispatchProposalGeneration" NOT NULL DEFAULT 'queued',
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "jobAttempt" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "activeFingerprint" TEXT;

-- `requestFingerprint` NOT NULL ama VARSAYILANSIZ olmali: bos bir parmak izi
-- sessiz bir hata olurdu. Tablo bu fazda acildi ve bos; yine de savunmaci
-- olarak once nullable eklenip, olasi satirlar kimlikten TURETILMIS bir
-- deger ile dolduruluyor. Uydurma bir "gecerli" fingerprint YAZILMIYOR —
-- `legacy:` oneki bu degerin gercek bir istekten gelmedigini soyluyor.
ALTER TABLE "dispatch_proposals" ADD COLUMN "requestFingerprint" TEXT;
UPDATE "dispatch_proposals"
  SET "requestFingerprint" = 'legacy:' || "id"
  WHERE "requestFingerprint" IS NULL;
ALTER TABLE "dispatch_proposals" ALTER COLUMN "requestFingerprint" SET NOT NULL;

-- GUVENLI GEVSETME: NOT NULL kaldiriliyor, veri kaybi yok.
ALTER TABLE "dispatch_proposals" ALTER COLUMN "proposalId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_proposals_jobId_key" ON "dispatch_proposals"("jobId");
CREATE UNIQUE INDEX "dispatch_proposals_activeFingerprint_key" ON "dispatch_proposals"("activeFingerprint");
CREATE INDEX "dispatch_proposals_tenantId_generation_createdAt_idx" ON "dispatch_proposals"("tenantId", "generation", "createdAt");
CREATE INDEX "dispatch_proposals_tenantId_requestFingerprint_idx" ON "dispatch_proposals"("tenantId", "requestFingerprint");

-- AddForeignKey
ALTER TABLE "dispatch_proposals" ADD CONSTRAINT "dispatch_proposals_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "automation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
