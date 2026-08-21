-- Faz 17g — tiklanabilir slot linki icin kisa omurlu oturum.
--
-- NEDEN DB'DE BIR SATIR, NEDEN IMZALI COOKIE DEGIL: imzali cookie GERI
-- ALINAMAZ. Calinmis bir cookie suresi dolana kadar gecerli kalirdi ve
-- "oturumu kapat" hicbir sey ifade etmezdi. Satir burada oldugu icin
-- `revokedAt` damgasi ANINDA etkili.
--
-- TOKEN DUZ METIN SAKLANMIYOR: yalnizca SHA-256 ozeti — RefreshToken,
-- OrdivanConnector ve DeliverySlotInvitation ile AYNI desen. Veritabanini
-- okuyan biri acik oturumlari ele geciremez.
--
-- CASCADE: davet silinirse oturumlari da gider. Davet zaten SILINMIYOR
-- (iptal `status` ile isaretleniyor) ama yetim oturum satiri birakmak,
-- hangi davete ait oldugu bilinmeyen bir yetki kaydi birakmak olurdu.
CREATE TABLE "delivery_slot_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invitationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_slot_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_slot_sessions_tokenHash_key" ON "delivery_slot_sessions"("tokenHash");
CREATE INDEX "delivery_slot_sessions_tenantId_idx" ON "delivery_slot_sessions"("tenantId");
CREATE INDEX "delivery_slot_sessions_invitationId_idx" ON "delivery_slot_sessions"("invitationId");
CREATE INDEX "delivery_slot_sessions_expiresAt_idx" ON "delivery_slot_sessions"("expiresAt");

ALTER TABLE "delivery_slot_sessions" ADD CONSTRAINT "delivery_slot_sessions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_slot_sessions" ADD CONSTRAINT "delivery_slot_sessions_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "delivery_slot_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
