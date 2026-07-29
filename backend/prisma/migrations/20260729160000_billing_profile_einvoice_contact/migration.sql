-- Seller contact and legal registration identifier for EN 16931 / XRechnung conformance.
--   phone              -> BT-42, mandatory under XRechnung BR-DE-6
--   registrationNumber -> BT-30, satisfies EN 16931 BR-CO-26 when the seller has no VAT id
-- Both are nullable: existing tenants keep working, and outgoing e-invoice generation
-- refuses with an explicit error when the value it needs is missing.
ALTER TABLE "TenantBillingProfile" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "TenantBillingProfile" ADD COLUMN "phone" TEXT;
