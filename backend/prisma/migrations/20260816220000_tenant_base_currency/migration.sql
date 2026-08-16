-- Kiraci temel para birimi + parasal kayitlara acik para birimi (Faz 7.1).
--
-- NEDEN: Faz 7'de maliyet toplami EUR'a SABIT kodlanmisti, cunku
-- ServiceRecord.costAmount ve Fine.amount para birimi hic tasimiyordu ve
-- tenant'ta temel para birimi alani yoktu. Urun Turkiye'ye acilirken bu sessiz
-- varsayim yanlis toplam uretirdi: TRY tutarlar EUR gibi toplanirdi.
--
-- VERI KAYBI YOK. Yalnizca uc yeni kolon; hicbir DROP, hicbir satir silme.
-- Kolonlar DEFAULT 'EUR' ile eklendigi icin MEVCUT tum satirlar tek islemde
-- EUR'a backfill oluyor ve gecmis raporlar birebir ayni rakami vermeye devam
-- ediyor.
--
-- PRISMA ENUM DEGIL: dunyadaki tum para birimlerini enum'a kopyalamak her yeni
-- pazar icin migration gerektiren olu bir liste uretirdi. Dogrulama uygulama
-- katmaninda (common/utils/currency) ISO-4217 bicimi + allowlist ile yapiliyor.
--
-- TABLO ADLARI: ServiceRecord ve Fine @@map'siz, yani tablo adlari PascalCase
-- ve tirnakli yazilmali (bkz. CLAUDE.md kural 5 — Tenant/Vehicle/Driver ile
-- ayni tuzak). Tirnaksiz yazilsaydi Postgres kucuk harfe cevirip
-- "servicerecord" arar ve migration patlardi.

-- AlterTable: kiracinin temel para birimi
ALTER TABLE "Tenant" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'EUR';

-- AlterTable: parasal kayitlar artik kendi para birimini tasiyor
ALTER TABLE "ServiceRecord" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "Fine" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR';

-- Backfill: mevcut kayitlar BAGLI OLDUKLARI kiracinin temel para birimini alir.
--
-- Su an her kiraci EUR oldugu icin bu iki ifade fiilen no-op. Yine de
-- yaziliyorlar: dogru olan kural "kaydin para birimi kiracisindan gelir" ve
-- migration bu kurali ifade etmeli. Ileride bir kiraci TRY olarak
-- olusturulmussa (ornegin bu migration'in gec uygulandigi bir ortamda) sessizce
-- yanlis etiketlenmis EUR satirlari birakmaz.
UPDATE "ServiceRecord" sr
   SET "currency" = t."baseCurrency"
  FROM "Tenant" t
 WHERE sr."tenantId" = t."id"
   AND sr."currency" <> t."baseCurrency";

UPDATE "Fine" f
   SET "currency" = t."baseCurrency"
  FROM "Tenant" t
 WHERE f."tenantId" = t."id"
   AND f."currency" <> t."baseCurrency";
