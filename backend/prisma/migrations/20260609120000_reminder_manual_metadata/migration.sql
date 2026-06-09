ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

DROP INDEX IF EXISTS "Reminder_tenantId_targetType_targetId_reminderType_dueDate_notifyBeforeDays_key";

CREATE UNIQUE INDEX "Reminder_tenantId_targetType_targetId_reminderType_title_dueDate_notifyBeforeDays_key"
ON "Reminder"("tenantId", "targetType", "targetId", "reminderType", "title", "dueDate", "notifyBeforeDays");
