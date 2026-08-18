-- Faz 13 — servis faturasi dikey dilimi.
--
-- TAMAMEN EKLEMELI: onceki migration'lar DEGISTIRILMEDI, tablo/kolon
-- dusurulmuyor, veri silinmiyor.
--
-- `ServiceRecord` MODELI DEGISMEDI: yalnizca oneriden gelen kayitlarin
-- izlenebilmesi icin `automation_proposals.resultServiceRecordId` eklendi ve
-- TEKIL yapildi — tekrarlanan ya da eszamanli onayin ikinci bir maliyet
-- satiri yaratmasi boylece veritabaninda imkansiz.
-- CreateEnum
CREATE TYPE "AutomationDocumentKind" AS ENUM ('service_invoice');

-- AlterTable
ALTER TABLE "automation_jobs" ADD COLUMN     "documentId" TEXT;

-- AlterTable
ALTER TABLE "automation_proposals" ADD COLUMN     "resultServiceRecordId" TEXT;

-- CreateTable
CREATE TABLE "automation_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "kind" "AutomationDocumentKind" NOT NULL DEFAULT 'service_invoice',
    "fileHash" TEXT NOT NULL,
    "storedFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_documents_tenantId_idx" ON "automation_documents"("tenantId");

-- CreateIndex
CREATE INDEX "automation_documents_tenantId_kind_createdAt_idx" ON "automation_documents"("tenantId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_documents_tenantId_fileHash_key" ON "automation_documents"("tenantId", "fileHash");

-- CreateIndex
CREATE INDEX "automation_jobs_documentId_idx" ON "automation_jobs"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_proposals_resultServiceRecordId_key" ON "automation_proposals"("resultServiceRecordId");

-- AddForeignKey
ALTER TABLE "automation_documents" ADD CONSTRAINT "automation_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_documents" ADD CONSTRAINT "automation_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "automation_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_proposals" ADD CONSTRAINT "automation_proposals_resultServiceRecordId_fkey" FOREIGN KEY ("resultServiceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

