-- Tachograph 28/90-day deadline tracking and reminders
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'tacho_download_due';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'TachoDownloadReminderStage' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "TachoDownloadReminderStage" AS ENUM ('due_7d', 'due_1d', 'overdue');
  END IF;
END $$;

ALTER TABLE "tacho_download_schedules"
  ADD COLUMN IF NOT EXISTS "lastFulfilledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastFulfilledDddFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastReminderStage" "TachoDownloadReminderStage",
  ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);

-- Keep subject-specific interval defaults aligned with legal deadlines.
UPDATE "tacho_download_schedules"
SET "intervalDays" = 90
WHERE "subject" = 'vehicle_unit' AND "intervalDays" = 28;

UPDATE "tacho_download_schedules"
SET "intervalDays" = 28
WHERE "subject" = 'driver_card' AND "intervalDays" IS DISTINCT FROM 28;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tacho_download_schedules_lastFulfilledDddFileId_fkey'
  ) THEN
    ALTER TABLE "tacho_download_schedules"
      ADD CONSTRAINT "tacho_download_schedules_lastFulfilledDddFileId_fkey"
      FOREIGN KEY ("lastFulfilledDddFileId") REFERENCES "ddd_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tacho_download_schedules_enabled_nextDueAt_idx"
  ON "tacho_download_schedules"("enabled", "nextDueAt");

CREATE INDEX IF NOT EXISTS "tacho_download_schedules_lastFulfilledDddFileId_idx"
  ON "tacho_download_schedules"("lastFulfilledDddFileId");