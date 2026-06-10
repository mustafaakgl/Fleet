-- CreateEnum
CREATE TYPE "LicenseCheckType" AS ENUM ('initial', 'periodic');

-- CreateEnum
CREATE TYPE "LicenseCheckStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "LicenseComplianceBadge" AS ENUM ('green', 'yellow', 'red');

-- CreateTable
CREATE TABLE "DriverLicense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "classes" TEXT[],
    "issuedAt" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "frontPhotoStoredPath" TEXT,
    "backPhotoStoredPath" TEXT,
    "nextCheckDueAt" DATE,
    "checkRequestedAt" TIMESTAMP(3),
    "lastReminderSentAt" TIMESTAMP(3),
    "lastEscalationSentAt" TIMESTAMP(3),
    "lastApprovedCheckAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "driverLicenseId" TEXT,
    "checkDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkType" "LicenseCheckType" NOT NULL,
    "status" "LicenseCheckStatus" NOT NULL DEFAULT 'pending',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "frontPhotoStoredPath" TEXT,
    "backPhotoStoredPath" TEXT,
    "selfiePhotoStoredPath" TEXT,
    "photoMetadata" JSONB,
    "dueAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverLicense_tenantId_idx" ON "DriverLicense"("tenantId");

-- CreateIndex
CREATE INDEX "DriverLicense_driverId_idx" ON "DriverLicense"("driverId");

-- CreateIndex
CREATE INDEX "DriverLicense_expiresAt_idx" ON "DriverLicense"("expiresAt");

-- CreateIndex
CREATE INDEX "DriverLicense_nextCheckDueAt_idx" ON "DriverLicense"("nextCheckDueAt");

-- CreateIndex
CREATE INDEX "DriverLicense_deletedAt_idx" ON "DriverLicense"("deletedAt");

-- CreateIndex
CREATE INDEX "LicenseCheck_tenantId_idx" ON "LicenseCheck"("tenantId");

-- CreateIndex
CREATE INDEX "LicenseCheck_driverId_checkDate_idx" ON "LicenseCheck"("driverId", "checkDate");

-- CreateIndex
CREATE INDEX "LicenseCheck_status_idx" ON "LicenseCheck"("status");

-- CreateIndex
CREATE INDEX "LicenseCheck_driverLicenseId_idx" ON "LicenseCheck"("driverLicenseId");

-- AddForeignKey
ALTER TABLE "DriverLicense" ADD CONSTRAINT "DriverLicense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLicense" ADD CONSTRAINT "DriverLicense_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseCheck" ADD CONSTRAINT "LicenseCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseCheck" ADD CONSTRAINT "LicenseCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseCheck" ADD CONSTRAINT "LicenseCheck_driverLicenseId_fkey" FOREIGN KEY ("driverLicenseId") REFERENCES "DriverLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseCheck" ADD CONSTRAINT "LicenseCheck_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
