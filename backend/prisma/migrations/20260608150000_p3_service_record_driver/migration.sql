-- P3-13: Link service records to the driver who reported the fault
ALTER TABLE "ServiceRecord" ADD COLUMN IF NOT EXISTS "driverId" TEXT;

ALTER TABLE "ServiceRecord" DROP CONSTRAINT IF EXISTS "ServiceRecord_driverId_fkey";
ALTER TABLE "ServiceRecord"
  ADD CONSTRAINT "ServiceRecord_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ServiceRecord_driverId_date_idx" ON "ServiceRecord"("driverId", "date");
