-- Add tachograph infringement escalation fields and notification type
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'tacho_infringement';

ALTER TABLE "tacho_infringements"
  ADD COLUMN IF NOT EXISTS "payrollRelevant" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "payrollMarkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payrollMarkedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tacho_infringements_payrollMarkedById_fkey'
  ) THEN
    ALTER TABLE "tacho_infringements"
      ADD CONSTRAINT "tacho_infringements_payrollMarkedById_fkey"
      FOREIGN KEY ("payrollMarkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tacho_infringements_payrollMarkedById_idx"
  ON "tacho_infringements"("payrollMarkedById");