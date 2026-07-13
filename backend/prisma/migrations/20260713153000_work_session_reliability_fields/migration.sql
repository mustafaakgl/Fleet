-- CreateEnum
CREATE TYPE "WorkSessionSource" AS ENUM ('manual', 'driver_reconciled', 'office_correction');

-- AlterTable
ALTER TABLE "WorkSession"
ADD COLUMN "correctionReason" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "originalEndAt" TIMESTAMP(3),
ADD COLUMN "source" "WorkSessionSource" NOT NULL DEFAULT 'manual';

-- Backfill
UPDATE "WorkSession"
SET "lastSeenAt" = COALESCE("endedAt", "startedAt")
WHERE "lastSeenAt" IS NULL;

-- CreateIndex
CREATE INDEX "WorkSession_status_lastSeenAt_idx" ON "WorkSession"("status", "lastSeenAt");
