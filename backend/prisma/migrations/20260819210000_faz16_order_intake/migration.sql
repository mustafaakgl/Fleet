-- Faz 16 — e-posta / PDF siparis ajani: gelen mesaj, ekler ve inceleme.
--
-- TAMAMEN EKLEMELI: hicbir tablo/kolon dusurulmuyor, hicbir mevcut kolon
-- NOT NULL yapilmiyor, veri silinmiyor. `automation_proposals`a eklenen iki
-- kolonun IKISI DE NULLABLE — bugunku onerilerin hicbiri siparis uretmedi ve
-- uydurma siparislere baglanmiyorlar.
--
-- `TransportOrderSource`a `email_agent` EKLENIYOR, mevcut `manual` degeri
-- DOKUNULMADAN kaliyor. Deger bu migration icinde KULLANILMIYOR: PostgreSQL
-- ayni islemde eklenen bir enum degerinin kullanilmasina izin vermez ve
-- gerek de yok — geriye donuk hicbir satir ajandan gelmedi.
--
-- IDEMPOTENCY VERITABANINDA: `order_intake_messages(tenantId, dedupeKey)`
-- TEKIL. Anahtar sunucuda `mailbox + Message-ID + icerik hash` uzerinden
-- uretiliyor; istemciden ALINMIYOR. Ayni mesaj es zamanli iki kez dustugunde
-- uygulama kontrolu yarisi kaybeder, bu kisit kaybetmez — Faz 14'teki
-- `document_intakes(tenantId, idempotencyKey)` ile ayni desen. Kiraci ICINDE
-- tekil: kiracilar arasinda anahtar cakisabilir ve varlik SIZMAZ.
--
-- EXACTLY-ONCE SONUC: `automation_proposals.resultTransportOrderId` ve
-- `...RevisionId` TEKIL. Bir e-posta onerisi en fazla BIR taslak siparis ya da
-- BIR bekleyen revizyon uretebilir; cift tiklama ve eszamanli iki onay bu
-- kisiti gecemez (Faz 13 `resultServiceRecordId` ile ayni desen).
--
-- IPTAL ICIN SONUC KOLONU YOK ve bu bilincli: iptal yeni kayit uretmez, mevcut
-- siparisin durumunu degistirir. Assignment/Tour kayitlarina bu migration
-- DOKUNMAZ.
--
-- ESLESTIRME KOLONLARI SUNUCUYA AIT: `matchedCompanyId` / `matchedOrderId`
-- deterministik kurallarla dolduruluyor; `companyCandidates` / `orderCandidates`
-- yalnizca ADAY tasir. Gonderen adresi ya da e-posta domaini bu kolonlara
-- KESIN ESLESME olarak yazilmaz.
-- CreateEnum
CREATE TYPE "OrderIntakeChannel" AS ENUM ('web_eml', 'web_pdf', 'connector_mailbox');

-- CreateEnum
CREATE TYPE "OrderIntakeMessageStatus" AS ENUM ('extracting', 'needs_review', 'settled', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "OrderIntakeIntent" AS ENUM ('new_order', 'amendment', 'cancellation', 'unknown');

-- CreateEnum
CREATE TYPE "OrderIntakeCompanyMatchStatus" AS ENUM ('customer_number', 'vat_id', 'contact_email', 'ambiguous', 'unknown');

-- CreateEnum
CREATE TYPE "OrderIntakeOrderMatchStatus" AS ENUM ('external_reference', 'order_number', 'ambiguous', 'unknown');

-- CreateEnum
CREATE TYPE "OrderIntakeReviewStatus" AS ENUM ('open', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "OrderIntakeFinancialContent" AS ENUM ('yes', 'no', 'unknown');

-- AlterEnum
ALTER TYPE "TransportOrderSource" ADD VALUE 'email_agent';

-- AlterTable
ALTER TABLE "automation_proposals" ADD COLUMN     "resultTransportOrderId" TEXT,
ADD COLUMN     "resultTransportOrderRevisionId" TEXT;

-- CreateTable
CREATE TABLE "order_intake_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "artifactId" TEXT NOT NULL,
    "channel" "OrderIntakeChannel" NOT NULL,
    "status" "OrderIntakeMessageStatus" NOT NULL DEFAULT 'extracting',
    "mailbox" TEXT,
    "externalMessageId" TEXT,
    "inReplyTo" TEXT,
    "fromAddress" TEXT,
    "fromDisplayName" TEXT,
    "subject" TEXT,
    "sentAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "containsFinancialData" "OrderIntakeFinancialContent" NOT NULL DEFAULT 'unknown',
    "connectorId" TEXT,
    "uploadedById" TEXT,
    "extractorVersion" TEXT,
    "failureClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_intake_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_intake_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "messageId" TEXT NOT NULL,
    "intakeId" TEXT,
    "fileName" TEXT NOT NULL,
    "declaredMimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rejectionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_intake_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_intake_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "messageId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "proposedIntent" "OrderIntakeIntent" NOT NULL,
    "proposedIntentConfidence" DECIMAL(4,3),
    "matchedCompanyId" TEXT,
    "companyMatchStatus" "OrderIntakeCompanyMatchStatus" NOT NULL DEFAULT 'unknown',
    "companyCandidates" JSONB,
    "matchedOrderId" TEXT,
    "orderMatchStatus" "OrderIntakeOrderMatchStatus" NOT NULL DEFAULT 'unknown',
    "orderCandidates" JSONB,
    "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfOrderId" TEXT,
    "status" "OrderIntakeReviewStatus" NOT NULL DEFAULT 'open',
    "resolvedIntent" "OrderIntakeIntent",
    "selectedCompanyId" TEXT,
    "selectedOrderId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_intake_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_intake_messages_tenantId_idx" ON "order_intake_messages"("tenantId");

-- CreateIndex
CREATE INDEX "order_intake_messages_tenantId_status_createdAt_idx" ON "order_intake_messages"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "order_intake_messages_tenantId_channel_createdAt_idx" ON "order_intake_messages"("tenantId", "channel", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_intake_messages_tenantId_dedupeKey_key" ON "order_intake_messages"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "order_intake_attachments_tenantId_idx" ON "order_intake_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "order_intake_attachments_messageId_idx" ON "order_intake_attachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "order_intake_attachments_messageId_contentHash_key" ON "order_intake_attachments"("messageId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "order_intake_reviews_messageId_key" ON "order_intake_reviews"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "order_intake_reviews_proposalId_key" ON "order_intake_reviews"("proposalId");

-- CreateIndex
CREATE INDEX "order_intake_reviews_tenantId_idx" ON "order_intake_reviews"("tenantId");

-- CreateIndex
CREATE INDEX "order_intake_reviews_tenantId_status_createdAt_idx" ON "order_intake_reviews"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "order_intake_reviews_tenantId_proposedIntent_createdAt_idx" ON "order_intake_reviews"("tenantId", "proposedIntent", "createdAt");

-- CreateIndex
CREATE INDEX "order_intake_reviews_matchedCompanyId_idx" ON "order_intake_reviews"("matchedCompanyId");

-- CreateIndex
CREATE INDEX "order_intake_reviews_matchedOrderId_idx" ON "order_intake_reviews"("matchedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_proposals_resultTransportOrderId_key" ON "automation_proposals"("resultTransportOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_proposals_resultTransportOrderRevisionId_key" ON "automation_proposals"("resultTransportOrderRevisionId");

-- AddForeignKey
ALTER TABLE "automation_proposals" ADD CONSTRAINT "automation_proposals_resultTransportOrderId_fkey" FOREIGN KEY ("resultTransportOrderId") REFERENCES "transport_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_proposals" ADD CONSTRAINT "automation_proposals_resultTransportOrderRevisionId_fkey" FOREIGN KEY ("resultTransportOrderRevisionId") REFERENCES "transport_order_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_messages" ADD CONSTRAINT "order_intake_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_messages" ADD CONSTRAINT "order_intake_messages_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "automation_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_messages" ADD CONSTRAINT "order_intake_messages_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "ordivan_connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_messages" ADD CONSTRAINT "order_intake_messages_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_attachments" ADD CONSTRAINT "order_intake_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_attachments" ADD CONSTRAINT "order_intake_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "order_intake_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_attachments" ADD CONSTRAINT "order_intake_attachments_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "document_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "order_intake_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "automation_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_matchedCompanyId_fkey" FOREIGN KEY ("matchedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "transport_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_duplicateOfOrderId_fkey" FOREIGN KEY ("duplicateOfOrderId") REFERENCES "transport_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_selectedCompanyId_fkey" FOREIGN KEY ("selectedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_selectedOrderId_fkey" FOREIGN KEY ("selectedOrderId") REFERENCES "transport_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_intake_reviews" ADD CONSTRAINT "order_intake_reviews_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


