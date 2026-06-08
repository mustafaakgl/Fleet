-- Per-driver vacation entitlement for Urlaubsübersicht.
ALTER TABLE "Driver" ADD COLUMN "vacationEntitlementDays" DECIMAL(5,2) NOT NULL DEFAULT 24;
ALTER TABLE "Driver" ADD COLUMN "vacationCarryOverDays" DECIMAL(5,2) NOT NULL DEFAULT 0;
