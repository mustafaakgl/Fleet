-- Faz 14 — akilli belge gelen kutusu.
--
-- TAMAMEN EKLEMELI: onceki migration'lar DEGISTIRILMEDI, tablo/kolon
-- dusurulmuyor, veri silinmiyor. Faz 13'un `automation_documents` blob'u
-- GENELLESTIRILDI (ikinci bir dosya deposu KURULMADI): mantiksal belgeler
-- ayni blob'a sayfa araligiyla baglaniyor, yeniden siniflandirma dosyayi
-- KOPYALAMIYOR.
--
-- BELGE TURU ENUM DEGIL: `intake_documents.typeKey` TEXT ve registry ile
-- dogrulaniyor (`service_invoice@v1` gibi surumlu anahtar). Buyuyen bir kumeyi
-- Postgres enum'una kilitlemek her yeni tur icin migration zorunlulugu
-- yaratirdi. Kapali kumeler (kanal, yasam dongusu) enum kaldi.
--
-- EXACTLY-ONCE YONLENDIRME: `intake_document_routings.intakeDocumentId` TEKIL
-- — bir mantiksal belge EN FAZLA BIR canonical kayit uretebilir. Cift tiklama
-- ve eszamanli iki incelemeci uygulama kontrolunu gecebilir; bu kural bu
-- yuzden VERITABANINDA.
-- CreateEnum
CREATE TYPE "DocumentIntakeSource" AS ENUM ('web', 'mobile', 'connector');

-- CreateEnum
CREATE TYPE "DocumentIntakeStatus" AS ENUM ('processing', 'needs_review', 'settled', 'failed');

-- CreateEnum
CREATE TYPE "IntakeDocumentStatus" AS ENUM ('classifying', 'needs_review', 'needs_domain_review', 'routed', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "IntakeVehicleMatchStatus" AS ENUM ('verified', 'failed', 'unknown');

-- AlterEnum
ALTER TYPE "AutomationDocumentKind" ADD VALUE 'document_intake';

-- CreateTable
CREATE TABLE "document_intakes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "artifactId" TEXT NOT NULL,
    "source" "DocumentIntakeSource" NOT NULL,
    "status" "DocumentIntakeStatus" NOT NULL DEFAULT 'processing',
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "uploadedById" TEXT,
    "connectorId" TEXT,
    "classifierVersion" TEXT,
    "failureClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "intakeId" TEXT NOT NULL,
    "proposedTypeKey" TEXT NOT NULL,
    "proposedConfidence" DECIMAL(4,3),
    "proposedPageFrom" INTEGER NOT NULL,
    "proposedPageTo" INTEGER NOT NULL,
    "proposedSubtype" TEXT,
    "evidence" JSONB,
    "candidates" JSONB,
    "checks" JSONB,
    "segmentationTrusted" BOOLEAN NOT NULL DEFAULT false,
    "typeKey" TEXT NOT NULL,
    "subtype" TEXT,
    "pageFrom" INTEGER NOT NULL,
    "pageTo" INTEGER NOT NULL,
    "status" "IntakeDocumentStatus" NOT NULL DEFAULT 'classifying',
    "vehicleId" TEXT,
    "vehicleMatchStatus" "IntakeVehicleMatchStatus" NOT NULL DEFAULT 'unknown',
    "assignedUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "domainReviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_document_routings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "intakeDocumentId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "secondaryEntityType" TEXT,
    "secondaryEntityId" TEXT,
    "routedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_document_routings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_intakes_tenantId_idx" ON "document_intakes"("tenantId");

-- CreateIndex
CREATE INDEX "document_intakes_tenantId_status_createdAt_idx" ON "document_intakes"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "document_intakes_tenantId_source_createdAt_idx" ON "document_intakes"("tenantId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "document_intakes_artifactId_idx" ON "document_intakes"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "document_intakes_tenantId_idempotencyKey_key" ON "document_intakes"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "intake_documents_tenantId_idx" ON "intake_documents"("tenantId");

-- CreateIndex
CREATE INDEX "intake_documents_tenantId_status_createdAt_idx" ON "intake_documents"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "intake_documents_tenantId_typeKey_createdAt_idx" ON "intake_documents"("tenantId", "typeKey", "createdAt");

-- CreateIndex
CREATE INDEX "intake_documents_intakeId_idx" ON "intake_documents"("intakeId");

-- CreateIndex
CREATE INDEX "intake_documents_vehicleId_idx" ON "intake_documents"("vehicleId");

-- CreateIndex
CREATE INDEX "intake_documents_assignedUserId_idx" ON "intake_documents"("assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "intake_document_routings_intakeDocumentId_key" ON "intake_document_routings"("intakeDocumentId");

-- CreateIndex
CREATE INDEX "intake_document_routings_tenantId_idx" ON "intake_document_routings"("tenantId");

-- CreateIndex
CREATE INDEX "intake_document_routings_tenantId_destination_createdAt_idx" ON "intake_document_routings"("tenantId", "destination", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "intake_document_routings_tenantId_entityType_entityId_key" ON "intake_document_routings"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "document_intakes" ADD CONSTRAINT "document_intakes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_intakes" ADD CONSTRAINT "document_intakes_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "automation_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_intakes" ADD CONSTRAINT "document_intakes_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_intakes" ADD CONSTRAINT "document_intakes_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "ordivan_connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_documents" ADD CONSTRAINT "intake_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_documents" ADD CONSTRAINT "intake_documents_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "document_intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_documents" ADD CONSTRAINT "intake_documents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_documents" ADD CONSTRAINT "intake_documents_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_documents" ADD CONSTRAINT "intake_documents_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_document_routings" ADD CONSTRAINT "intake_document_routings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_document_routings" ADD CONSTRAINT "intake_document_routings_intakeDocumentId_fkey" FOREIGN KEY ("intakeDocumentId") REFERENCES "intake_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_document_routings" ADD CONSTRAINT "intake_document_routings_routedById_fkey" FOREIGN KEY ("routedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

