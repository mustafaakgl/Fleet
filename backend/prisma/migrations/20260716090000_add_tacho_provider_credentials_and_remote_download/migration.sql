-- CreateEnum
CREATE TYPE "TachoProvider" AS ENUM ('tis_web');

-- AlterEnum
ALTER TYPE "DddFileSource" ADD VALUE IF NOT EXISTS 'remote';

-- CreateTable
CREATE TABLE "tacho_provider_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "provider" "TachoProvider" NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tacho_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tacho_download_schedules" ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "tacho_provider_credentials_tenantId_provider_key" ON "tacho_provider_credentials"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "tacho_provider_credentials_tenantId_idx" ON "tacho_provider_credentials"("tenantId");

-- AddForeignKey
ALTER TABLE "tacho_provider_credentials" ADD CONSTRAINT "tacho_provider_credentials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
