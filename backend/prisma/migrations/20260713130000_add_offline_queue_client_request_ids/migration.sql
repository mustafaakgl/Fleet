-- AlterTable
ALTER TABLE "Document"
ADD COLUMN     "client_request_id" TEXT;

ALTER TABLE "handover_photos"
ADD COLUMN     "client_request_id" TEXT;

ALTER TABLE "DriverLocationHistory"
ADD COLUMN     "client_request_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_client_request_id_key" ON "Document"("client_request_id");

CREATE UNIQUE INDEX "HandoverPhoto_client_request_id_key" ON "handover_photos"("client_request_id");

CREATE UNIQUE INDEX "DriverLocationHistory_client_request_id_key" ON "DriverLocationHistory"("client_request_id");
