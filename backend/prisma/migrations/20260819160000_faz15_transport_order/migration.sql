-- Faz 15 — canonical TransportOrder ve siparis revizyonlari.
--
-- TAMAMEN EKLEMELI: tablo/kolon dusurulmuyor, veri silinmiyor, hicbir mevcut
-- kolon NOT NULL yapilmiyor. `Assignment`a eklenen uc kolonun UCU DE NULLABLE:
-- bugunku kayitlarin hicbirinin siparisi yok ve UYDURMA siparislere
-- baglanmiyorlar.
--
-- `TourStop` DEGISMEDI. `transportOrderId` bilincli olarak EKLENMEDI ve ayri
-- bir Order-Tour link tablosu acilmadi: siparis-tur iliskisi `Assignment`
-- uzerinden zaten turetilebiliyor. Ikinci bir yol, "bu durak hangi siparise
-- ait" sorusunu iki kaynaktan cevaplanabilir hale getirir ve ikisi kacinilmaz
-- olarak ayrisir.
--
-- DUPLICATE KONTROLU VERITABANINDA: `transport_orders.duplicateKey`
-- (`{companyId}:{externalReference}`) yalnizca referans doluysa ve siparis
-- iptal edilmemisse yaziliyor. Uygulama kontrolu eszamanli iki istegi
-- ayirt edemez; tekil indeks eder. Iptal referansi SERBEST BIRAKIR.
--
-- REVIZYON APPEND-ONLY: `[transportOrderId, revisionNumber]` TEKIL — eszamanli
-- iki revizyon ayni numarayi alamaz ve eski revizyon yeniden yazilmaz.
-- CreateEnum
CREATE TYPE "TransportOrderStatus" AS ENUM ('draft', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "TransportOrderBillingMode" AS ENUM ('on_order_completion', 'per_delivery');

-- CreateEnum
CREATE TYPE "TransportOrderSource" AS ENUM ('manual');

-- CreateEnum
CREATE TYPE "AdrStatus" AS ENUM ('yes', 'no', 'unknown');

-- CreateEnum
CREATE TYPE "TransportOrderRevisionStatus" AS ENUM ('applied', 'pending_review', 'rejected');

-- CreateEnum
CREATE TYPE "TransportOrderCancellationCategory" AS ENUM ('customer_cancelled', 'duplicate_order', 'created_in_error', 'no_capacity', 'price_disagreement', 'other');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "consignmentId" TEXT,
ADD COLUMN     "sourceRevision" INTEGER,
ADD COLUMN     "transportOrderId" TEXT;

-- CreateTable
CREATE TABLE "transport_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "externalReference" TEXT,
    "duplicateKey" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "contractedRevenue" DECIMAL(12,2),
    "billingMode" "TransportOrderBillingMode" NOT NULL DEFAULT 'on_order_completion',
    "status" "TransportOrderStatus" NOT NULL DEFAULT 'draft',
    "source" "TransportOrderSource" NOT NULL DEFAULT 'manual',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationCategory" "TransportOrderCancellationCategory",
    "cancellationNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "transportOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLocationId" TEXT,
    "pickupWindowStart" TIMESTAMP(3),
    "pickupWindowEnd" TIMESTAMP(3),
    "deliveryAddress" TEXT NOT NULL,
    "deliveryLocationId" TEXT,
    "deliveryWindowStart" TIMESTAMP(3),
    "deliveryWindowEnd" TIMESTAMP(3),
    "cargoDescription" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "weightKg" DECIMAL(12,2),
    "volumeM3" DECIMAL(12,3),
    "palletCount" INTEGER,
    "adrStatus" "AdrStatus" NOT NULL DEFAULT 'unknown',
    "temperatureMinC" DECIMAL(5,2),
    "temperatureMaxC" DECIMAL(5,2),
    "shipperReference" TEXT,
    "consigneeReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_order_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "transportOrderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "TransportOrderRevisionStatus" NOT NULL DEFAULT 'applied',
    "snapshot" JSONB NOT NULL,
    "changedFields" JSONB,
    "source" "TransportOrderSource" NOT NULL DEFAULT 'manual',
    "sourceVersion" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "transport_order_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_orders_tenantId_idx" ON "transport_orders"("tenantId");

-- CreateIndex
CREATE INDEX "transport_orders_tenantId_status_orderDate_idx" ON "transport_orders"("tenantId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "transport_orders_tenantId_companyId_orderDate_idx" ON "transport_orders"("tenantId", "companyId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "transport_orders_tenantId_orderNumber_key" ON "transport_orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "transport_orders_tenantId_duplicateKey_key" ON "transport_orders"("tenantId", "duplicateKey");

-- CreateIndex
CREATE INDEX "consignments_tenantId_idx" ON "consignments"("tenantId");

-- CreateIndex
CREATE INDEX "consignments_transportOrderId_idx" ON "consignments"("transportOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "consignments_transportOrderId_sequence_key" ON "consignments"("transportOrderId", "sequence");

-- CreateIndex
CREATE INDEX "transport_order_revisions_tenantId_idx" ON "transport_order_revisions"("tenantId");

-- CreateIndex
CREATE INDEX "transport_order_revisions_transportOrderId_createdAt_idx" ON "transport_order_revisions"("transportOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "transport_order_revisions_tenantId_status_idx" ON "transport_order_revisions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transport_order_revisions_transportOrderId_revisionNumber_key" ON "transport_order_revisions"("transportOrderId", "revisionNumber");

-- CreateIndex
CREATE INDEX "Assignment_transportOrderId_idx" ON "Assignment"("transportOrderId");

-- CreateIndex
CREATE INDEX "Assignment_consignmentId_idx" ON "Assignment"("consignmentId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_transportOrderId_fkey" FOREIGN KEY ("transportOrderId") REFERENCES "transport_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "consignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_orders" ADD CONSTRAINT "transport_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_orders" ADD CONSTRAINT "transport_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_orders" ADD CONSTRAINT "transport_orders_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_orders" ADD CONSTRAINT "transport_orders_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_orders" ADD CONSTRAINT "transport_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_transportOrderId_fkey" FOREIGN KEY ("transportOrderId") REFERENCES "transport_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_deliveryLocationId_fkey" FOREIGN KEY ("deliveryLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_order_revisions" ADD CONSTRAINT "transport_order_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_order_revisions" ADD CONSTRAINT "transport_order_revisions_transportOrderId_fkey" FOREIGN KEY ("transportOrderId") REFERENCES "transport_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_order_revisions" ADD CONSTRAINT "transport_order_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_order_revisions" ADD CONSTRAINT "transport_order_revisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

