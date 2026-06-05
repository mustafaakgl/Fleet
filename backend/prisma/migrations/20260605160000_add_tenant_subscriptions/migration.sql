-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('basic', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'manual');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('stripe', 'manual');

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "BillingPlan" NOT NULL DEFAULT 'basic',
    "status" "BillingStatus" NOT NULL DEFAULT 'trialing',
    "billingMode" "BillingMode" NOT NULL DEFAULT 'stripe',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "vehicleLimit" INTEGER NOT NULL DEFAULT 15,
    "seatLimit" INTEGER NOT NULL DEFAULT 5,
    "monthlyAmountCents" INTEGER NOT NULL DEFAULT 29900,
    "billingEmail" TEXT,
    "manualInvoiceReference" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_stripeCustomerId_key" ON "TenantSubscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_stripeSubscriptionId_key" ON "TenantSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "TenantSubscription_status_idx" ON "TenantSubscription"("status");

-- CreateIndex
CREATE INDEX "TenantSubscription_stripeCustomerId_idx" ON "TenantSubscription"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default tenant subscription (demo / existing deployments)
INSERT INTO "TenantSubscription" (
    "id",
    "tenantId",
    "plan",
    "status",
    "billingMode",
    "vehicleLimit",
    "seatLimit",
    "monthlyAmountCents",
    "trialEndsAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'default-subscription',
    'default-tenant',
    'pro'::"BillingPlan",
    'manual'::"BillingStatus",
    'manual'::"BillingMode",
    50,
    15,
    39900,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = 'default-tenant')
ON CONFLICT ("id") DO NOTHING;
