-- CreateEnum
CREATE TYPE "DddFileProcessingStatus" AS ENUM ('pending', 'processed', 'failed');

-- AlterTable
ALTER TABLE "ddd_files" ADD COLUMN "status" "DddFileProcessingStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "processingErrorSummary" TEXT;

-- Backfill: existing files were already processed synchronously before the queue existed.
UPDATE "ddd_files" SET "status" = 'processed' WHERE "status" = 'pending';
