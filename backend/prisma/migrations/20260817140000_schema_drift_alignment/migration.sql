-- Migration zinciri ile Prisma semasi arasindaki birikmis farki kapatir.
--
-- NEDEN GEREKLI: bu fark TEMIZ bir veritabaninda da uretiliyordu, yani yerel
-- ortam sorunu degil zincirin kendisindeydi. Sonucu somut: `prisma migrate dev`
-- calistiran herkes, hicbir ilgisi olmayan modellerde indeks DUSUREN istenmeyen
-- bir migration uretiyordu.
--
-- HICBIR YIKICI ISLEM YOK: tablo/kolon dusurulmuyor, veri silinmiyor,
-- indeks dusurulmuyor. Yalnizca eksik indeksler ekleniyor, geri doldurma
-- amacli birakilmis DEFAULT'lar kaldiriliyor ve iki indeksin adi hizalaniyor.
--
-- Farkin diger yarisi SEMA tarafinda kapatildi: veritabaninda zaten var olan
-- uc indeks (TourStop(tourId,status), WorkSession(status,lastSeenAt),
-- tacho_infringements(payrollMarkedById)) semaya geri yazildi — dusurulmedi.

-- ---------------------------------------------------------------------------
-- 1) Geri doldurma DEFAULT'larinin kaldirilmasi
-- ---------------------------------------------------------------------------
-- Bu iki DEFAULT, `ADD COLUMN ... NOT NULL DEFAULT ...` ile mevcut satirlari
-- doldurmak icin konmustu; kalici bir varsayilan olarak TASARLANMADI. Semada da
-- yok. Kalmasi tehlikeli: baslik vermeyi unutan bir kod yolu, hata almak yerine
-- sessizce 'Aushandigungsbestatigung' basligiyla kayit uretirdi.
--
-- Mevcut satirlar ETKILENMEZ — DROP DEFAULT yalnizca gelecekteki INSERT'leri
-- ilgilendirir. Uygulama her iki alani da her zaman kendisi veriyor
-- (equipment-issuances.service.ts), ham SQL insert yok.
ALTER TABLE "EquipmentIssuance" ALTER COLUMN "title" DROP DEFAULT;
ALTER TABLE "EquipmentIssuance" ALTER COLUMN "formDocumentPath" DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 2) Semada tanimli ama veritabaninda hic olusturulmamis indeksler
-- ---------------------------------------------------------------------------
-- Bunlar gercek eksiklerdi: sorgular indekssiz calisiyordu.
-- IF NOT EXISTS: elle olusturulmus ortamlarda migration patlamasin.
CREATE INDEX IF NOT EXISTS "ddd_files_tenantId_status_idx"
  ON "ddd_files"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "tacho_infringements_tenantId_acknowledgedAt_occurredAt_idx"
  ON "tacho_infringements"("tenantId", "acknowledgedAt", "occurredAt");

-- ---------------------------------------------------------------------------
-- 3) Indeks adlarinin Prisma'nin urettigi adla hizalanmasi
-- ---------------------------------------------------------------------------
-- Migration SQL'i elle yazilirken indeksler eski model adiyla adlandirilmis,
-- sonra modeller `@@map` almis. Yeniden adlandirma indeksi DUSURMEZ, veriye
-- dokunmaz; yalnizca katalog adini degistirir.
--
-- DO blogu: hedef ad zaten varsa (bazi ortamlar `db push` ile kurulmus
-- olabilir) migration hata vermeden gecsin.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'HandoverPhoto_client_request_id_key')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'handover_photos_client_request_id_key')
  THEN
    ALTER INDEX "HandoverPhoto_client_request_id_key"
      RENAME TO "handover_photos_client_request_id_key";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vehicle_fuel_compatibility_tenantId_vehicleId_productType_usage')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vehicle_fuel_compatibility_tenantId_vehicleId_productType_u_key')
  THEN
    ALTER INDEX "vehicle_fuel_compatibility_tenantId_vehicleId_productType_usage"
      RENAME TO "vehicle_fuel_compatibility_tenantId_vehicleId_productType_u_key";
  END IF;
END $$;
