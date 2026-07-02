-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'tacho_signature_invalid';

-- AlterTable
ALTER TABLE "ddd_files" ADD COLUMN "generation" INTEGER,
ADD COLUMN "signatureValid" BOOLEAN,
ADD COLUMN "skippedBlocks" JSONB;
