-- Kiraci isletme zaman dilimi (Faz 8 tamamlama).
--
-- NEDEN: aylik rapor kovalari `Europe/Berlin` sabitine bagliydi. 31 Temmuz
-- 23:30 UTC kaydi Berlin'de 1 Agustos, Istanbul'da 2 Agustos'tur — ayni UTC
-- ani iki kiracida farkli aya duser. Sabit kalsaydi Turkiye kiracisinin ay
-- sinirlari sessizce kayardi.
--
-- VERI KAYBI YOK: tek bir yeni kolon, DEFAULT ile eklendigi icin MEVCUT tum
-- kiracilar tek islemde 'Europe/Berlin' backfill oluyor ve gecmis raporlar
-- birebir ayni kovalari uretmeye devam ediyor. Hicbir DROP, hicbir satir
-- silme.
--
-- ENUM DEGIL: IANA veritabani yilda birkac kez degisiyor; enum her
-- guncellemede migration gerektiren olu bir liste olurdu. Dogrulama uygulama
-- katmaninda Intl ile.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin';
