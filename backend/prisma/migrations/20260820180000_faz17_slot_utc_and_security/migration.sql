-- Faz 17e — slot zamanlarini UTC'ye tasima ve davet guvenligi alanlari.
--
-- KOLON DUSURULUYOR ve bu ISTISNAI: `delivery_slots.date`, `windowStart` ve
-- `windowEnd` kolonlari BU FAZDA (20260820100000) eklendi, hicbir surumde
-- yayinlanmadi ve UC TABLO DA BOS. Asagidaki guard bunu CALISMA ANINDA
-- dogruluyor: satir varsa migration DURUR, sessizce veri kaybetmez.
--
-- NEDEN DUSURULUYOR: `date` + `'HH:mm'` metinleri zaman dilimi tasimiyordu ve
-- bu, Faz 16/17 boyunca defalarca reddedilen belirsizligin ta kendisiydi —
-- `08:00` hangi dilimde? Yaz saati gecisinde ayni metin bir gun 60, ertesi gun
-- 120 dakika kayardi. Olculebilir bir an olmadan kapasite ve cakisma kontrolu
-- de guvenilmez olurdu. Belirsiz kolonlari "ileride lazim olur" diye tasimak,
-- yanlis kullanilmalarina davetiye cikarirdi.
--
-- `startsAt`/`endsAt` UTC ANLARI; `timezone` YALNIZCA gosterim icin.
-- `resourceRef` NULLABLE DEGIL BOS METIN: tekillik anahtarinin parcasi ve
-- PostgreSQL NULL'lari ayri saydigi icin nullable olsaydi ayni saatte
-- "kaynaksiz" iki slot acilabilirdi.
--
-- `activeTargetKey` TEKIL: ayni kalem+uc icin AYNI ANDA tek gecerli davet.
-- Iptal edilen davet alani birakir ve yenisi uretilebilir.
--
-- `sourceRevision`: davet siparisin hangi revizyonuna dayaniyordu. Musteri
-- siparisi degistirdiginde eski davet gecersiz olmali.

DO $$
BEGIN
  IF (SELECT count(*) FROM "delivery_slots") > 0
     OR (SELECT count(*) FROM "delivery_slot_invitations") > 0
     OR (SELECT count(*) FROM "delivery_slot_bookings") > 0 THEN
    RAISE EXCEPTION 'delivery slot tablolari bos degil; belirsiz zaman kolonlari elle tasinmali';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "DeliverySlotStatus" AS ENUM ('open', 'closed');

-- DropIndex
DROP INDEX "delivery_slots_tenantId_date_idx";

-- DropIndex
DROP INDEX "delivery_slots_tenantId_locationId_date_windowStart_windowE_key";

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "delivery_slots" DROP COLUMN "date",
DROP COLUMN "windowEnd",
DROP COLUMN "windowStart",
ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "resourceRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" "DeliverySlotStatus" NOT NULL DEFAULT 'open',
ADD COLUMN     "timezone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "delivery_slot_invitations" ADD COLUMN     "activeTargetKey" TEXT,
ADD COLUMN     "sourceRevision" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "delivery_slots_tenantId_startsAt_idx" ON "delivery_slots"("tenantId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slots_tenantId_locationId_startsAt_endsAt_resource_key" ON "delivery_slots"("tenantId", "locationId", "startsAt", "endsAt", "resourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slot_invitations_activeTargetKey_key" ON "delivery_slot_invitations"("activeTargetKey");


