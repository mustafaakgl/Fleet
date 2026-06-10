-- CreateEnum
CREATE TYPE "HandoverPhotoValidationStatus" AS ENUM ('validated', 'location_mismatch');

-- CreateTable
CREATE TABLE "handover_photos" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "client_taken_at" TIMESTAMP(3),
    "exif_taken_at" TIMESTAMP(3),
    "gps_lat" DECIMAL(10,7),
    "gps_lng" DECIMAL(10,7),
    "device_info" TEXT,
    "validation_status" "HandoverPhotoValidationStatus" NOT NULL DEFAULT 'validated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handover_photos_documentId_key" ON "handover_photos"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "handover_photos_file_hash_key" ON "handover_photos"("file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "handover_photos_handoverId_slot_key" ON "handover_photos"("handoverId", "slot");

-- CreateIndex
CREATE INDEX "handover_photos_handoverId_idx" ON "handover_photos"("handoverId");

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "VehicleHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
