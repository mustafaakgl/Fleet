-- CreateEnum
CREATE TYPE "EquipmentIssuanceStatus" AS ENUM ('pending_signature', 'signed', 'manual_uploaded', 'approved', 'cancelled');

-- AlterEnum
ALTER TYPE "DocumentOwnerType" ADD VALUE 'equipment_issuance';

-- CreateTable
CREATE TABLE "EquipmentIssuance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "status" "EquipmentIssuanceStatus" NOT NULL DEFAULT 'pending_signature',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "signatureMethod" TEXT,
    "signatureImagePath" TEXT,
    "documentId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "clientMeta" JSONB,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentIssuance_documentId_key" ON "EquipmentIssuance"("documentId");

-- CreateIndex
CREATE INDEX "EquipmentIssuance_tenantId_idx" ON "EquipmentIssuance"("tenantId");

-- CreateIndex
CREATE INDEX "EquipmentIssuance_driverId_status_idx" ON "EquipmentIssuance"("driverId", "status");

-- CreateIndex
CREATE INDEX "EquipmentIssuance_issuedAt_idx" ON "EquipmentIssuance"("issuedAt");

-- AddForeignKey
ALTER TABLE "EquipmentIssuance" ADD CONSTRAINT "EquipmentIssuance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssuance" ADD CONSTRAINT "EquipmentIssuance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssuance" ADD CONSTRAINT "EquipmentIssuance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssuance" ADD CONSTRAINT "EquipmentIssuance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssuance" ADD CONSTRAINT "EquipmentIssuance_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;