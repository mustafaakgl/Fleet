-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('invoice', 'credit_note', 'cancellation');

-- CreateEnum
CREATE TYPE "OutgoingInvoiceStatus" AS ENUM ('draft', 'finalized', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "InvoiceUnit" AS ENUM ('day', 'hour', 'tour', 'km', 'flat');

-- CreateEnum
CREATE TYPE "InvoiceLineSource" AS ENUM ('assignment', 'manual', 'rate_card_item');

-- CreateEnum
CREATE TYPE "InvoiceTaxCategory" AS ENUM ('standard', 'reduced', 'exempt', 'reverse_charge');

-- CreateEnum
CREATE TYPE "EInvoicePreference" AS ENUM ('zugferd', 'xrechnung', 'both');

-- CreateEnum
CREATE TYPE "InvoicePaymentMethod" AS ENUM ('bank_transfer', 'cash', 'other');

-- CreateEnum
CREATE TYPE "DatevExportStatus" AS ENUM ('generated', 'downloaded');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingCountryCode" TEXT NOT NULL DEFAULT 'DE',
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingPostalCode" TEXT,
ADD COLUMN     "billingStreet" TEXT,
ADD COLUMN     "datevDebtorNumber" INTEGER,
ADD COLUMN     "defaultPaymentTermDays" INTEGER,
ADD COLUMN     "defaultTaxCategory" "InvoiceTaxCategory" NOT NULL DEFAULT 'standard',
ADD COLUMN     "eInvoicePreference" "EInvoicePreference" NOT NULL DEFAULT 'zugferd',
ADD COLUMN     "invoiceEmail" TEXT,
ADD COLUMN     "leitwegId" TEXT,
ADD COLUMN     "vatId" TEXT;

-- CreateTable
CREATE TABLE "TenantBillingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'DE',
    "taxNumber" TEXT,
    "vatId" TEXT,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "bankName" TEXT,
    "invoiceNumberFormat" TEXT NOT NULL DEFAULT 'RE-{YYYY}-{00001}',
    "defaultPaymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "defaultTaxRateBasisPoints" INTEGER NOT NULL DEFAULT 1900,
    "smallBusinessRule" BOOLEAN NOT NULL DEFAULT false,
    "logoStoredPath" TEXT,
    "invoiceFooterText" TEXT,
    "invoiceEmailCc" TEXT,
    "dunningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dunningLevel1Days" INTEGER NOT NULL DEFAULT 1,
    "dunningLevel2Days" INTEGER NOT NULL DEFAULT 14,
    "dunningLevel3Days" INTEGER NOT NULL DEFAULT 28,
    "dunningLevel1FeeCents" INTEGER NOT NULL DEFAULT 0,
    "dunningLevel2FeeCents" INTEGER NOT NULL DEFAULT 500,
    "dunningLevel3FeeCents" INTEGER NOT NULL DEFAULT 1000,
    "datevConsultantNumber" TEXT,
    "datevClientNumber" TEXT,
    "datevChart" TEXT NOT NULL DEFAULT 'SKR03',
    "revenueAccount19" TEXT NOT NULL DEFAULT '8400',
    "revenueAccount7" TEXT NOT NULL DEFAULT '8300',
    "revenueAccount0" TEXT NOT NULL DEFAULT '8125',
    "revenueAccountReverseCharge" TEXT NOT NULL DEFAULT '8337',
    "debtorNumberStart" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCardItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "rateCardId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" "InvoiceUnit" NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 1900,
    "taxCategory" "InvoiceTaxCategory" NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "companyId" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'invoice',
    "status" "OutgoingInvoiceStatus" NOT NULL DEFAULT 'draft',
    "number" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "servicePeriodStart" TIMESTAMP(3) NOT NULL,
    "servicePeriodEnd" TIMESTAMP(3) NOT NULL,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "taxBreakdown" JSONB,
    "customerName" TEXT,
    "customerStreet" TEXT,
    "customerPostalCode" TEXT,
    "customerCity" TEXT,
    "customerCountryCode" TEXT,
    "customerVatId" TEXT,
    "customerEmail" TEXT,
    "leitwegId" TEXT,
    "supplierSnapshot" JSONB,
    "notes" TEXT,
    "originalInvoiceId" TEXT,
    "pdfStoredPath" TEXT,
    "pdfSha256" TEXT,
    "zugferdXmlStoredPath" TEXT,
    "zugferdXmlSha256" TEXT,
    "xrechnungStoredPath" TEXT,
    "xrechnungSha256" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "dunningOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "finalizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" "InvoiceUnit" NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "taxCategory" "InvoiceTaxCategory" NOT NULL,
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "source" "InvoiceLineSource" NOT NULL,
    "assignmentId" TEXT,
    "rateCardItemId" TEXT,
    "serviceDate" TIMESTAMP(3),
    "sourceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAssignmentClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "assignmentId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAssignmentClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceNumberSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" "InvoicePaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invoiceId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "ccEmail" TEXT,
    "status" TEXT NOT NULL,
    "mailMode" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invoiceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningNotice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invoiceId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "pdfStoredPath" TEXT NOT NULL,
    "pdfSha256" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DunningNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatevExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileStoredPath" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "invoiceIds" JSONB NOT NULL,
    "status" "DatevExportStatus" NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatevExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantBillingProfile_tenantId_key" ON "TenantBillingProfile"("tenantId");

-- CreateIndex
CREATE INDEX "TenantBillingProfile_tenantId_idx" ON "TenantBillingProfile"("tenantId");

-- CreateIndex
CREATE INDEX "RateCard_tenantId_idx" ON "RateCard"("tenantId");

-- CreateIndex
CREATE INDEX "RateCard_companyId_validFrom_validTo_idx" ON "RateCard"("companyId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "RateCardItem_tenantId_idx" ON "RateCardItem"("tenantId");

-- CreateIndex
CREATE INDEX "RateCardItem_rateCardId_idx" ON "RateCardItem"("rateCardId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_invoiceDate_idx" ON "Invoice"("companyId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_idx" ON "InvoiceLine"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceLine_assignmentId_idx" ON "InvoiceLine"("assignmentId");

-- CreateIndex
CREATE INDEX "InvoiceLine_rateCardItemId_idx" ON "InvoiceLine"("rateCardItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceAssignmentClaim_assignmentId_key" ON "InvoiceAssignmentClaim"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceAssignmentClaim_invoiceLineId_key" ON "InvoiceAssignmentClaim"("invoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceAssignmentClaim_tenantId_idx" ON "InvoiceAssignmentClaim"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceNumberSequence_tenantId_idx" ON "InvoiceNumberSequence"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceNumberSequence_tenantId_year_key" ON "InvoiceNumberSequence"("tenantId", "year");

-- CreateIndex
CREATE INDEX "InvoicePayment_tenantId_idx" ON "InvoicePayment"("tenantId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_paidAt_idx" ON "InvoicePayment"("invoiceId", "paidAt");

-- CreateIndex
CREATE INDEX "InvoiceDeliveryAttempt_tenantId_idx" ON "InvoiceDeliveryAttempt"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceDeliveryAttempt_invoiceId_attemptedAt_idx" ON "InvoiceDeliveryAttempt"("invoiceId", "attemptedAt");

-- CreateIndex
CREATE INDEX "InvoiceAuditEvent_tenantId_idx" ON "InvoiceAuditEvent"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceAuditEvent_invoiceId_createdAt_idx" ON "InvoiceAuditEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "DunningNotice_tenantId_idx" ON "DunningNotice"("tenantId");

-- CreateIndex
CREATE INDEX "DunningNotice_sentAt_idx" ON "DunningNotice"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "DunningNotice_invoiceId_level_key" ON "DunningNotice"("invoiceId", "level");

-- CreateIndex
CREATE INDEX "DatevExport_tenantId_idx" ON "DatevExport"("tenantId");

-- CreateIndex
CREATE INDEX "DatevExport_periodStart_periodEnd_idx" ON "DatevExport"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_datevDebtorNumber_key" ON "Company"("tenantId", "datevDebtorNumber");

-- AddForeignKey
ALTER TABLE "TenantBillingProfile" ADD CONSTRAINT "TenantBillingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_rateCardItemId_fkey" FOREIGN KEY ("rateCardItemId") REFERENCES "RateCardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAssignmentClaim" ADD CONSTRAINT "InvoiceAssignmentClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAssignmentClaim" ADD CONSTRAINT "InvoiceAssignmentClaim_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAssignmentClaim" ADD CONSTRAINT "InvoiceAssignmentClaim_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceNumberSequence" ADD CONSTRAINT "InvoiceNumberSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDeliveryAttempt" ADD CONSTRAINT "InvoiceDeliveryAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDeliveryAttempt" ADD CONSTRAINT "InvoiceDeliveryAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditEvent" ADD CONSTRAINT "InvoiceAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditEvent" ADD CONSTRAINT "InvoiceAuditEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatevExport" ADD CONSTRAINT "DatevExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatevExport" ADD CONSTRAINT "DatevExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accounting integrity constraints
ALTER TABLE "TenantBillingProfile" ADD CONSTRAINT "TenantBillingProfile_paymentTermDays_check" CHECK ("defaultPaymentTermDays" >= 0);
ALTER TABLE "TenantBillingProfile" ADD CONSTRAINT "TenantBillingProfile_taxRate_check" CHECK ("defaultTaxRateBasisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_unitPriceCents_check" CHECK ("unitPriceCents" >= 0);
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_taxRate_check" CHECK ("taxRateBasisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_currency_eur_check" CHECK ("currency" = 'EUR');
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_servicePeriod_check" CHECK ("servicePeriodEnd" >= "servicePeriodStart");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentTermDays_check" CHECK ("paymentTermDays" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK ("netCents" >= 0 AND "taxCents" >= 0 AND "grossCents" >= 0 AND "paidCents" >= 0);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_taxRate_check" CHECK ("taxRateBasisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_amounts_check" CHECK ("unitPriceCents" >= 0 AND "netCents" >= 0 AND "taxCents" >= 0 AND "grossCents" >= 0);
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_amountCents_check" CHECK ("amountCents" > 0);
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_level_check" CHECK ("level" BETWEEN 1 AND 3);
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_feeCents_check" CHECK ("feeCents" >= 0);
ALTER TABLE "DatevExport" ADD CONSTRAINT "DatevExport_period_check" CHECK ("periodEnd" >= "periodStart");

