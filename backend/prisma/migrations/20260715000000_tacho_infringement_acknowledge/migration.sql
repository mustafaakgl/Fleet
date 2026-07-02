-- AlterTable
ALTER TABLE "tacho_infringements" ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN "acknowledgedById" TEXT,
ADD COLUMN "acknowledgementNote" TEXT;

-- CreateIndex
CREATE INDEX "tacho_infringements_tenantId_acknowledgedAt_idx" ON "tacho_infringements"("tenantId", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "tacho_infringements" ADD CONSTRAINT "tacho_infringements_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
