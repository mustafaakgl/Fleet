-- Faz 17f — karar tekrar anahtari.
--
-- NEDEN: onay ve red uclari artik `idempotencyKey` ZORUNLU tutuyor. Anahtari
-- yalnizca istekte tasiyip saklamasaydik hicbir sey garanti etmezdi; tekrar
-- korumasi ancak anahtar KARARLA BIRLIKTE kalicilastiginda anlam kazanir.
--
-- KISMI DEGIL TAM UNIQUE: PostgreSQL NULL'lari birbirinden AYRI saydigi icin
-- karar verilmemis oneriler (`NULL`) tekillige takilmaz — kismi indeks
-- gerekmiyor. Ayni anahtarin ayni kiracida ikinci bir oneride kullanilmasi
-- P2002 ile duser ve bu DOGRU: aksi halde istemci iki farkli plani ayni
-- "tekrar" sanardi.
ALTER TABLE "dispatch_proposals" ADD COLUMN "decisionIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "dispatch_proposals_tenantId_decisionIdempotencyKey_key"
  ON "dispatch_proposals"("tenantId", "decisionIdempotencyKey");
