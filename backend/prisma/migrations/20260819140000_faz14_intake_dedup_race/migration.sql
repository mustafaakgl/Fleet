-- Faz 14 — yukleme tekilligini VERITABANINA tasiyor.
--
-- NEDEN: `document_intakes.artifactId` yalnizca indeksliydi ve tekillik
-- UYGULAMADA kontrol ediliyordu ("bu hash var mi?" → yoksa yaz). Iki istek
-- ayni dosyayi AYNI ANDA yukledigi zaman IKISI DE "yok" gorur, ikisi de yazar
-- ve ayni belge gelen kutusuna iki kez duser. E2E'de gercekten yasandi.
--
-- Indeks TEKIL yapiliyor: bir blob = bir gelen kutusu girdisi. Yarisi kaybeden
-- istek artik var olan girdiyi doner (idempotent), ikinci kayit ACILMAZ.
--
-- Veri kaybi YOK: yalnizca indeks tipi degisiyor.
-- DropIndex
DROP INDEX "document_intakes_artifactId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "document_intakes_artifactId_key" ON "document_intakes"("artifactId");

