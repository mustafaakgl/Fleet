-- Aracin ACIKCA onaylanmis yakit urunleri.
--
-- NEDEN YENI TABLO: Vehicle uzerinde bugun hicbir yakit alani YOK (repo
-- genelinde `fuelType` diye bir alan, kolon ya da kullanim bulunmuyor). Yani
-- ayni anlami tasiyan ikinci bir alan uretilmiyor; eksik olan bilgi ilk kez
-- modelleniyor. Tek enum kolonu yeterli olmazdi: bir arac hem E5 hem E10
-- kabul edebilir ve her onayin kendi kaynagi (uretici/VIN/ofis) ile dogrulama
-- zamani olmali.
--
-- BACKFILL YOK — bilerek: donusturulecek eski veri mevcut degil. Olsaydi bile
-- taninmayan degeri tahmin ederek doldurmak yanlis yakit hasarina yol acardi;
-- kayit yoklugu "bilinmiyor" demektir ve surucu ucu bu durumda 409 dondurur.
-- Bu migration yalnizca yeni nesne yaratir: hicbir UPDATE/DELETE/DROP yok,
-- dolayisiyla mevcut veriye dokunmuyor.

-- CreateEnum
-- Degerler buyuk harf: pompadaki urun kodlari (CalendarStatus'un AT/UT'si gibi).
-- SUPER_E5 ve SUPER_E10 AYRI degerler; biri digerini ima etmez.
CREATE TYPE "FuelProductType" AS ENUM (
  'DIESEL',
  'SUPER_E5',
  'SUPER_E10',
  'SUPER_PLUS',
  'HVO100',
  'CNG',
  'LNG',
  'ELECTRICITY',
  'HYDROGEN',
  'ADBLUE'
);

-- CreateEnum
CREATE TYPE "FuelProductUsage" AS ENUM ('PRIMARY', 'ALTERNATIVE', 'ADDITIVE');

-- CreateEnum
CREATE TYPE "FuelCompatibilitySource" AS ENUM ('MANUFACTURER', 'VIN', 'ADMIN', 'IMPORTED');

-- CreateTable
CREATE TABLE "vehicle_fuel_compatibility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "productType" "FuelProductType" NOT NULL,
    "usageType" "FuelProductUsage" NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "source" "FuelCompatibilitySource" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_fuel_compatibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_fuel_compatibility_tenantId_idx" ON "vehicle_fuel_compatibility"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_fuel_compatibility_vehicleId_idx" ON "vehicle_fuel_compatibility"("vehicleId");

-- CreateIndex
-- Ayni arac/urun/kullanim ucusu iki kez yazilamaz: PUT tum seti degistirirken
-- cift kayit uretemesin, iki es zamanli PUT birbirini cogaltmasin.
CREATE UNIQUE INDEX "vehicle_fuel_compatibility_tenantId_vehicleId_productType_usageType_key"
  ON "vehicle_fuel_compatibility"("tenantId", "vehicleId", "productType", "usageType");

-- AddForeignKey
-- Tenant ve Vehicle tablolari @@map'siz -> tirnakli PascalCase hedef.
ALTER TABLE "vehicle_fuel_compatibility"
  ADD CONSTRAINT "vehicle_fuel_compatibility_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade: bu tablo aracin teknik ozelligi, bagimsiz bir is kaydi degil.
-- Pratikte arac silinmiyor (VehiclesService.deactivate durumu degistiriyor),
-- bu yuzden kural yalnizca gercek bir silmede devreye girer.
ALTER TABLE "vehicle_fuel_compatibility"
  ADD CONSTRAINT "vehicle_fuel_compatibility_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
