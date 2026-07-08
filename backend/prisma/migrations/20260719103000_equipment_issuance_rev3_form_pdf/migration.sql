-- AlterTable
ALTER TABLE "EquipmentIssuance"
ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'Aushändigungsbestätigung',
ADD COLUMN     "formDocumentPath" TEXT NOT NULL DEFAULT '/uploads/documents/pending-form.pdf',
ADD COLUMN     "finalDocumentId" TEXT;

-- Data migration
UPDATE "EquipmentIssuance"
SET "finalDocumentId" = "documentId"
WHERE "documentId" IS NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "EquipmentIssuance_documentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentIssuance_finalDocumentId_key" ON "EquipmentIssuance"("finalDocumentId");

-- CreateIndex
CREATE INDEX "EquipmentIssuance_title_idx" ON "EquipmentIssuance"("title");

-- AddForeignKey
ALTER TABLE "EquipmentIssuance" ADD CONSTRAINT "EquipmentIssuance_finalDocumentId_fkey" FOREIGN KEY ("finalDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old foreign key/column
ALTER TABLE "EquipmentIssuance" DROP CONSTRAINT IF EXISTS "EquipmentIssuance_documentId_fkey";
ALTER TABLE "EquipmentIssuance" DROP COLUMN IF EXISTS "documentId";