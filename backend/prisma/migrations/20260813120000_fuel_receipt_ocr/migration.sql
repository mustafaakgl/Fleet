-- Yakit fisi yukleme, OCR taslagi ve surucu dogrulamasi.
--
-- NEDEN YENI TABLO YOK: FleetFuelEntry sistemdeki canonical yakit islemi ve
-- oyle kaliyor. Ayri bir FuelReceipt/FuelExpense tablosu ayni gercegi iki
-- yerde tutar, raporlarin hangisini saydigini belirsiz birakirdi.
--
-- VERI KAYBI YOK. Bu migration:
--   * hicbir DROP TABLE / DROP COLUMN icermiyor,
--   * hicbir satiri silmiyor,
--   * yalnizca yeni tip + yeni kolon + yeni indeks ekliyor,
--   * iki kolonda NOT NULL kisitini GEVSETIYOR (daraltmiyor).
--
-- KRITIK BACKFILL: `workflowStatus` once DEFAULT 'approved' ile ekleniyor.
-- Boylece MEVCUT butun kayitlar tek islemde `approved` oluyor ve raporlar
-- (TCO, yakit analitigi, sapma raporu) birebir ayni rakami vermeye devam
-- ediyor. Hemen ardindan varsayilan `driver_review`'a cevriliyor: BUNDAN
-- SONRAKI kayitlar surucu incelemesinde dogar. Kolonu dogrudan
-- DEFAULT 'driver_review' ile eklemek, gecmisteki tum yakit maliyetini
-- raporlardan silerdi.

-- CreateEnum
CREATE TYPE "FuelEntryWorkflowStatus" AS ENUM (
  'driver_review',
  'submitted',
  'approved',
  'rejected'
);

-- CreateEnum
CREATE TYPE "FuelReceiptOcrStatus" AS ENUM (
  'not_requested',
  'processing',
  'succeeded',
  'failed'
);

-- AlterTable: is akisi durumu + GECMISI KORUYAN backfill
ALTER TABLE "fleet_fuel_entries"
  ADD COLUMN "workflowStatus" "FuelEntryWorkflowStatus" NOT NULL DEFAULT 'approved';
ALTER TABLE "fleet_fuel_entries"
  ALTER COLUMN "workflowStatus" SET DEFAULT 'driver_review';

-- AlterTable: upload-first icin mali alanlarin NOT NULL kisiti gevsetiliyor.
-- Fis yuklendigi anda litre ve tutar gercekten bilinmiyor; 0 yazmak "bedava
-- yakit" demek olurdu. `submitted` durumuna gecis dogrulamasi ikisini de
-- zorunlu tutuyor (bkz. FuelReceiptService.confirm).
ALTER TABLE "fleet_fuel_entries" ALTER COLUMN "liters" DROP NOT NULL;
ALTER TABLE "fleet_fuel_entries" ALTER COLUMN "totalCost" DROP NOT NULL;

-- AlterTable: surucunun onayladigi canonical fis alanlari + OCR snapshot'i
ALTER TABLE "fleet_fuel_entries"
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "stationName" TEXT,
  ADD COLUMN "stationAddress" TEXT,
  ADD COLUMN "receiptNumber" TEXT,
  ADD COLUMN "fuelProduct" "FuelProductType",
  ADD COLUMN "pricePerLiter" DECIMAL(10,4),
  -- Fisin GENEL brut toplami. `totalCost` (yakit satiri) ile arasindaki fark
  -- bilincli: biri araca yazilan yakit maliyeti, digeri kasada odenen tutar.
  ADD COLUMN "receiptGrossAmount" DECIMAL(12,2),
  ADD COLUMN "receiptNetAmount" DECIMAL(12,2),
  ADD COLUMN "receiptVatAmount" DECIMAL(12,2),
  ADD COLUMN "receiptVatRate" DECIMAL(5,2),
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "receiptPlateNumber" TEXT,
  ADD COLUMN "compatibilityMismatch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "compatibilityAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "receiptFileHash" TEXT,
  ADD COLUMN "receiptFileSize" INTEGER,
  ADD COLUMN "receiptOriginalName" TEXT,
  ADD COLUMN "ocrStatus" "FuelReceiptOcrStatus" NOT NULL DEFAULT 'not_requested',
  ADD COLUMN "ocrProvider" TEXT,
  ADD COLUMN "ocrProviderVersion" TEXT,
  ADD COLUMN "ocrProcessedAt" TIMESTAMP(3),
  ADD COLUMN "ocrExtraction" JSONB,
  ADD COLUMN "ocrErrorClass" TEXT,
  ADD COLUMN "ocrDataMode" TEXT,
  ADD COLUMN "fuelingIntentId" TEXT,
  ADD COLUMN "fuelingIntentSettledKey" TEXT;

-- CreateIndex
-- Ayni kiraci icinde birebir ayni dosya iki kez yuklenemez. Mevcut kayitlarin
-- hash'i NULL ve Postgres tekil indekste NULL'lari birbirinden farkli saydigi
-- icin eski satirlar bu kisiti ihlal ETMEZ.
CREATE UNIQUE INDEX "fleet_fuel_entries_tenantId_receiptFileHash_key"
  ON "fleet_fuel_entries"("tenantId", "receiptFileHash");

-- CreateIndex
-- Bir yakit niyetine EN FAZLA BIR kesinlesmis fis. Tasiyici kolon yalnizca
-- submitted/approved iken dolu; taslak fisler kilidi tutmaz (Faz 5'teki
-- activeDriverKey ile ayni desen).
CREATE UNIQUE INDEX "fleet_fuel_entries_tenantId_fuelingIntentSettledKey_key"
  ON "fleet_fuel_entries"("tenantId", "fuelingIntentSettledKey");

-- CreateIndex
CREATE INDEX "fleet_fuel_entries_tenantId_workflowStatus_idx"
  ON "fleet_fuel_entries"("tenantId", "workflowStatus");

-- CreateIndex
CREATE INDEX "fleet_fuel_entries_tenantId_driverId_workflowStatus_idx"
  ON "fleet_fuel_entries"("tenantId", "driverId", "workflowStatus");

-- CreateIndex
CREATE INDEX "fleet_fuel_entries_fuelingIntentId_idx"
  ON "fleet_fuel_entries"("fuelingIntentId");

-- AddForeignKey
-- SetNull: niyet silinse bile fis bir mali kayittir, ayakta kalmali.
ALTER TABLE "fleet_fuel_entries"
  ADD CONSTRAINT "fleet_fuel_entries_fuelingIntentId_fkey"
  FOREIGN KEY ("fuelingIntentId") REFERENCES "fueling_intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
