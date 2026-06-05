-- Multi-tenant isolation: tenantId on operational models + per-tenant unique constraints

-- Driver
ALTER TABLE "Driver" ADD COLUMN "tenantId" TEXT;
UPDATE "Driver" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Driver" ALTER COLUMN "tenantId" SET NOT NULL;

-- Vehicle
ALTER TABLE "Vehicle" ADD COLUMN "tenantId" TEXT;
UPDATE "Vehicle" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "tenantId" SET NOT NULL;

-- Company
ALTER TABLE "Company" ADD COLUMN "tenantId" TEXT;
UPDATE "Company" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Company" ALTER COLUMN "tenantId" SET NOT NULL;

-- Assignment
ALTER TABLE "Assignment" ADD COLUMN "tenantId" TEXT;
UPDATE "Assignment" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Assignment" ALTER COLUMN "tenantId" SET NOT NULL;

-- DriverLocationHistory
ALTER TABLE "DriverLocationHistory" ADD COLUMN "tenantId" TEXT;
UPDATE "DriverLocationHistory" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "DriverLocationHistory" ALTER COLUMN "tenantId" SET NOT NULL;

-- TransportRequest
ALTER TABLE "TransportRequest" ADD COLUMN "tenantId" TEXT;
UPDATE "TransportRequest" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "TransportRequest" ALTER COLUMN "tenantId" SET NOT NULL;

-- CalendarEvent
ALTER TABLE "CalendarEvent" ADD COLUMN "tenantId" TEXT;
UPDATE "CalendarEvent" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "CalendarEvent" ALTER COLUMN "tenantId" SET NOT NULL;

-- Request
ALTER TABLE "Request" ADD COLUMN "tenantId" TEXT;
UPDATE "Request" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Request" ALTER COLUMN "tenantId" SET NOT NULL;

-- Document
ALTER TABLE "Document" ADD COLUMN "tenantId" TEXT;
UPDATE "Document" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Document" ALTER COLUMN "tenantId" SET NOT NULL;

-- VehicleHandover
ALTER TABLE "VehicleHandover" ADD COLUMN "tenantId" TEXT;
UPDATE "VehicleHandover" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "VehicleHandover" ALTER COLUMN "tenantId" SET NOT NULL;

-- Accident
ALTER TABLE "Accident" ADD COLUMN "tenantId" TEXT;
UPDATE "Accident" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Accident" ALTER COLUMN "tenantId" SET NOT NULL;

-- CompanyEmail
ALTER TABLE "CompanyEmail" ADD COLUMN "tenantId" TEXT;
UPDATE "CompanyEmail" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "CompanyEmail" ALTER COLUMN "tenantId" SET NOT NULL;

-- Notification
ALTER TABLE "Notification" ADD COLUMN "tenantId" TEXT;
UPDATE "Notification" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL;

-- Reminder
ALTER TABLE "Reminder" ADD COLUMN "tenantId" TEXT;
UPDATE "Reminder" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Reminder" ALTER COLUMN "tenantId" SET NOT NULL;

-- MorningCheckin
ALTER TABLE "MorningCheckin" ADD COLUMN "tenantId" TEXT;
UPDATE "MorningCheckin" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "MorningCheckin" ALTER COLUMN "tenantId" SET NOT NULL;

-- ServiceRecord
ALTER TABLE "ServiceRecord" ADD COLUMN "tenantId" TEXT;
UPDATE "ServiceRecord" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "ServiceRecord" ALTER COLUMN "tenantId" SET NOT NULL;

-- Conversation
ALTER TABLE "Conversation" ADD COLUMN "tenantId" TEXT;
UPDATE "Conversation" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "Conversation" ALTER COLUMN "tenantId" SET NOT NULL;

-- AuditLog (nullable for system-level events)
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
UPDATE "AuditLog" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;

-- User: enforce tenantId
UPDATE "User" SET "tenantId" = 'default-tenant' WHERE "tenantId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- Drop global unique constraints
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "Driver_employeeNumber_key";
DROP INDEX IF EXISTS "Vehicle_plateNumber_key";
DROP INDEX IF EXISTS "Vehicle_internalCode_key";
DROP INDEX IF EXISTS "Vehicle_vin_key";
DROP INDEX IF EXISTS "Company_name_key";
DROP INDEX IF EXISTS "Reminder_targetType_targetId_reminderType_dueDate_notifyBeforeDays_key";

-- Per-tenant unique constraints
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE UNIQUE INDEX "Driver_tenantId_employeeNumber_key" ON "Driver"("tenantId", "employeeNumber");
CREATE UNIQUE INDEX "Vehicle_tenantId_plateNumber_key" ON "Vehicle"("tenantId", "plateNumber");
CREATE UNIQUE INDEX "Vehicle_tenantId_internalCode_key" ON "Vehicle"("tenantId", "internalCode");
CREATE UNIQUE INDEX "Vehicle_tenantId_vin_key" ON "Vehicle"("tenantId", "vin");
CREATE UNIQUE INDEX "Company_tenantId_name_key" ON "Company"("tenantId", "name");
CREATE UNIQUE INDEX "Reminder_tenantId_targetType_targetId_reminderType_dueDate_notifyBeforeDays_key"
  ON "Reminder"("tenantId", "targetType", "targetId", "reminderType", "dueDate", "notifyBeforeDays");

-- Tenant indexes
CREATE INDEX "Driver_tenantId_idx" ON "Driver"("tenantId");
CREATE INDEX "Vehicle_tenantId_idx" ON "Vehicle"("tenantId");
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");
CREATE INDEX "Assignment_tenantId_idx" ON "Assignment"("tenantId");
CREATE INDEX "DriverLocationHistory_tenantId_idx" ON "DriverLocationHistory"("tenantId");
CREATE INDEX "TransportRequest_tenantId_idx" ON "TransportRequest"("tenantId");
CREATE INDEX "CalendarEvent_tenantId_idx" ON "CalendarEvent"("tenantId");
CREATE INDEX "Request_tenantId_idx" ON "Request"("tenantId");
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");
CREATE INDEX "VehicleHandover_tenantId_idx" ON "VehicleHandover"("tenantId");
CREATE INDEX "Accident_tenantId_idx" ON "Accident"("tenantId");
CREATE INDEX "CompanyEmail_tenantId_idx" ON "CompanyEmail"("tenantId");
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX "Reminder_tenantId_idx" ON "Reminder"("tenantId");
CREATE INDEX "MorningCheckin_tenantId_idx" ON "MorningCheckin"("tenantId");
CREATE INDEX "ServiceRecord_tenantId_idx" ON "ServiceRecord"("tenantId");
CREATE INDEX "Conversation_tenantId_idx" ON "Conversation"("tenantId");
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- Foreign keys
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Driver" ADD CONSTRAINT "Driver_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverLocationHistory" ADD CONSTRAINT "DriverLocationHistory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Request" ADD CONSTRAINT "Request_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Accident" ADD CONSTRAINT "Accident_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanyEmail" ADD CONSTRAINT "CompanyEmail_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MorningCheckin" ADD CONSTRAINT "MorningCheckin_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
