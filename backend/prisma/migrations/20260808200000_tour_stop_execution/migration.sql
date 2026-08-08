-- Yurutme kaydi TourStop'a ekleniyor. Plan alanlari optimizasyonla yeniden
-- yazilabiliyor; gerceklesen bilgi ayri alanlarda tutuluyor ki ustune yazilmasin.

-- CreateEnum
CREATE TYPE "TourStopStatus" AS ENUM ('pending', 'arrived', 'completed', 'skipped');

-- AlterTable
ALTER TABLE "TourStop"
  ADD COLUMN "status" "TourStopStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedLatitude" DECIMAL(10,7),
  ADD COLUMN "completedLongitude" DECIMAL(10,7),
  ADD COLUMN "clientEventId" TEXT;

-- Ofis tarafi turun ilerlemesini durum uzerinden okuyor.
CREATE INDEX "TourStop_tourId_status_idx" ON "TourStop"("tourId", "status");
