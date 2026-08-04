-- Servis kaydina baslangic tarihi. Opsiyonel: mevcut satirlarda yok ve tek
-- gunluk islerde girilmesi zorunlu degil. "date" tamamlanma tarihidir.
ALTER TABLE "ServiceRecord" ADD COLUMN "startDate" TIMESTAMP(3);
