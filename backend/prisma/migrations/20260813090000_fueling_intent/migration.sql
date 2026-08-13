-- Surucunun sectigi GECICI yakit duragi.
--
-- NEDEN TourStop DEGIL: yakit duragi bir musteri noktasi degildir. TourStop
-- olarak yazilsaydi musteri duraklarinin `sequence` sirasina girer, tur
-- optimizasyonunun girdisi olur ve `tourId` zorunlu oldugu icin turdan
-- bagimsiz yakit alimi hic modellenemezdi. Bu migration canonical tur
-- verisine (Tour, TourStop) HIC DOKUNMUYOR: yalnizca yeni bir tip, yeni bir
-- tablo ve o tablonun indeksleri yaratiliyor. Hicbir UPDATE/DELETE/DROP yok,
-- mevcut satirlarin hicbiri degismiyor. BACKFILL YOK — donusturulecek eski
-- veri mevcut degil.
--
-- Prompt 6 (yakit fisi) hazirligi: `FuelReceipt.fuelingIntentId` iliskisi
-- BURADA ACILMIYOR. Sirf iliski ugruna bos bir model yaratmak yerine bag,
-- FuelReceipt gercekten dogdugunda kendi migration'inda eklenecek. Fis
-- yuklemenin bir FuelingIntent'e ihtiyaci hicbir zaman olmayacak.

-- CreateEnum
CREATE TYPE "FuelingIntentStatus" AS ENUM (
  'ACTIVE',
  'CANCELLED',
  'SUPERSEDED',
  'COMPLETED',
  'EXPIRED'
);

-- CreateTable
CREATE TABLE "fueling_intent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tourId" TEXT,
    "anchorTourStopId" TEXT,
    "status" "FuelingIntentStatus" NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE iken driverId, terminal durumda NULL. Asagidaki tekil indeksin
    -- tasiyicisi budur.
    "activeDriverKey" TEXT,
    "provider" TEXT NOT NULL,
    "providerStationId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "stationBrand" TEXT,
    "stationStreet" TEXT,
    "stationHouseNumber" TEXT,
    "stationPostalCode" TEXT,
    "stationCity" TEXT,
    "stationLatitude" DECIMAL(10,7) NOT NULL,
    "stationLongitude" DECIMAL(10,7) NOT NULL,
    "selectedFuelProduct" "FuelProductType" NOT NULL,
    -- Arama anindaki saglayici fiyati; odenen fiyat DEGIL. Para -> DECIMAL.
    "quotedPricePerLitre" DECIMAL(10,4),
    "priceRetrievedAt" TIMESTAMP(3),
    "attributionLabel" TEXT NOT NULL,
    "attributionUrl" TEXT,
    "plannedLitres" DECIMAL(8,2),
    "routeMode" TEXT,
    "extraDistanceKm" DECIMAL(12,3),
    "extraDurationMin" DECIMAL(8,1),
    "driveTimeToStationMin" DECIMAL(8,1),
    "stationEta" TIMESTAMP(3),
    "routeCalculatedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "navigationOpenedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fueling_intent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fueling_intent_tenantId_idx" ON "fueling_intent"("tenantId");

-- CreateIndex
CREATE INDEX "fueling_intent_tenantId_driverId_status_idx"
  ON "fueling_intent"("tenantId", "driverId", "status");

-- CreateIndex
CREATE INDEX "fueling_intent_tenantId_vehicleId_status_idx"
  ON "fueling_intent"("tenantId", "vehicleId", "status");

-- CreateIndex
CREATE INDEX "fueling_intent_tourId_idx" ON "fueling_intent"("tourId");

-- CreateIndex
CREATE INDEX "fueling_intent_anchorTourStopId_idx" ON "fueling_intent"("anchorTourStopId");

-- CreateIndex
-- "Bir surucunun ayni anda tek aktif yakit niyeti" kuralinin VERITABANI
-- karsiligi. Uygulama katmanindaki findFirst kontrolu tek basina yeterli
-- olmazdi: iki es zamanli PUT ikisi de "aktif yok" gorup iki kayit yaratirdi.
-- Postgres tekil indekste NULL'lari birbirinden farkli saydigi icin istenildigi
-- kadar terminal (CANCELLED/SUPERSEDED/COMPLETED/EXPIRED) kayit birikebilir;
-- ikinci bir ACTIVE satir yazilamaz.
CREATE UNIQUE INDEX "fueling_intent_tenantId_activeDriverKey_key"
  ON "fueling_intent"("tenantId", "activeDriverKey");

-- AddForeignKey
-- Tenant, Driver, Vehicle ve Tour tablolari @@map'siz -> tirnakli PascalCase hedef.
ALTER TABLE "fueling_intent"
  ADD CONSTRAINT "fueling_intent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fueling_intent"
  ADD CONSTRAINT "fueling_intent_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fueling_intent"
  ADD CONSTRAINT "fueling_intent_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: tur silinse bile yakit niyetinin kendisi bir gecmis kaydidir ve
-- fisle eslestirilebilmesi icin ayakta kalmali.
ALTER TABLE "fueling_intent"
  ADD CONSTRAINT "fueling_intent_tourId_fkey"
  FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: cipa yalnizca baglamdir; durak silinirse niyet kaybolmamali.
ALTER TABLE "fueling_intent"
  ADD CONSTRAINT "fueling_intent_anchorTourStopId_fkey"
  FOREIGN KEY ("anchorTourStopId") REFERENCES "TourStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
