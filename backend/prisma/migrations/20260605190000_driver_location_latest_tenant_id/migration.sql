-- Add tenant isolation to DriverLocationLatest
ALTER TABLE "DriverLocationLatest" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

UPDATE "DriverLocationLatest" dll
SET "tenantId" = d."tenantId"
FROM "Driver" d
WHERE dll."driverId" = d."id";

ALTER TABLE "DriverLocationLatest" ADD CONSTRAINT "DriverLocationLatest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "DriverLocationLatest_tenantId_idx" ON "DriverLocationLatest"("tenantId");
