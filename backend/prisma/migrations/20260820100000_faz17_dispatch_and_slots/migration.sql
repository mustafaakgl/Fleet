-- Faz 17 — dispatch onerisi, arac kapasitesi ve teslimat slotlari.
--
-- TAMAMEN EKLEMELI: hicbir tablo/kolon dusurulmuyor, hicbir mevcut kolon
-- NOT NULL yapilmiyor, veri silinmiyor.
--
-- ARAC KAPASITESI HEPSI NULLABLE VE VARSAYILANSIZ. Bir varsayilan yazsaydik
-- (0 kg, `adrCertified = false`) uygunluk motoru "bilmiyorum" diyemez ve eksik
-- veriyi KESIN BIR CEVAP gibi sunardi. `null` = BILINMIYOR; ne "sinirsiz" ne
-- "hayir". Motor bu alanlar bossa ilgili kontrolu `unknown` isaretler.
--
-- SLOT KAPASITESI VERITABANINDA: rezervasyon `bookedCount < capacity` kosullu
-- tek bir UPDATE ile artiyor. Once-oku-sonra-yaz olsaydi son kontenjani iki
-- eszamanli istek de "musait" gorurdu; kosullu UPDATE PostgreSQL'de atomiktir.
--
-- BIR DAVETIN AYNI ANDA EN FAZLA BIR AKTIF REZERVASYONU:
-- `delivery_slot_bookings.activeInvitationId` TEKIL ve NULLABLE — aktifken
-- davet kimligini, iptalde `null` tasiyor. Boylece kural veritabaninda duruyor
-- ama gecmis kayitlar birbirini engellemiyor (Faz 15 `duplicateKey` deseni).
-- IPTAL SILME DEGILDIR: satir kalir, `cancelledAt` damgalanir.
--
-- TOKEN DUZ METIN SAKLANMIYOR: `tokenHash` SHA-256 ozeti, `tokenPrefix`
-- yalnizca gosterim icin. Veritabanini okuyan biri linkleri kullanamaz.
--
-- EXACTLY-ONCE: `dispatch_proposals.resultTourId` TEKIL — bir oneri en fazla
-- BIR tur uretebilir; cift tiklama ve eszamanli iki onay bu kisiti gecemez.
--
-- `sourceRevision` bir GUVENLIK KILIDI: onerinin dayandigi siparis revizyonu
-- burada duruyor; onay aninda revizyon degismisse plan uygulanmaz.
-- CreateEnum
CREATE TYPE "DispatchCheckStatus" AS ENUM ('verified', 'incompatible', 'unknown');

-- CreateEnum
CREATE TYPE "DispatchProposalStatus" AS ENUM ('open', 'approved', 'rejected', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "DispatchRouteStatus" AS ENUM ('ok', 'degraded', 'failed');

-- CreateEnum
CREATE TYPE "DeliverySlotKind" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "DeliverySlotInvitationStatus" AS ENUM ('open', 'booked', 'cancelled', 'expired', 'revoked');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "adrCertified" BOOLEAN,
ADD COLUMN     "cargoVolumeM3" DECIMAL(10,3),
ADD COLUMN     "grossWeightKg" DECIMAL(10,2),
ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "lengthCm" INTEGER,
ADD COLUMN     "palletCapacity" INTEGER,
ADD COLUMN     "payloadCapacityKg" DECIMAL(10,2),
ADD COLUMN     "widthCm" INTEGER;

-- CreateTable
CREATE TABLE "dispatch_proposals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "proposalId" TEXT NOT NULL,
    "status" "DispatchProposalStatus" NOT NULL DEFAULT 'open',
    "computedAt" TIMESTAMP(3) NOT NULL,
    "routeStatus" "DispatchRouteStatus" NOT NULL DEFAULT 'ok',
    "routeFailureClass" TEXT,
    "totalDistanceKm" DECIMAL(12,3),
    "totalDurationMin" INTEGER,
    "plannedStops" JSONB,
    "resultTourId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_proposal_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "dispatchProposalId" TEXT NOT NULL,
    "transportOrderId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_proposal_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_candidates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "dispatchProposalId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "overallStatus" "DispatchCheckStatus" NOT NULL,
    "checks" JSONB NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_slots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "locationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_slot_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "consignmentId" TEXT NOT NULL,
    "kind" "DeliverySlotKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "DeliverySlotInvitationStatus" NOT NULL DEFAULT 'open',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_slot_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_slot_bookings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "invitationId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "activeInvitationId" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "delivery_slot_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_proposals_proposalId_key" ON "dispatch_proposals"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_proposals_resultTourId_key" ON "dispatch_proposals"("resultTourId");

-- CreateIndex
CREATE INDEX "dispatch_proposals_tenantId_idx" ON "dispatch_proposals"("tenantId");

-- CreateIndex
CREATE INDEX "dispatch_proposals_tenantId_status_createdAt_idx" ON "dispatch_proposals"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "dispatch_proposal_orders_tenantId_idx" ON "dispatch_proposal_orders"("tenantId");

-- CreateIndex
CREATE INDEX "dispatch_proposal_orders_transportOrderId_idx" ON "dispatch_proposal_orders"("transportOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_proposal_orders_dispatchProposalId_transportOrderI_key" ON "dispatch_proposal_orders"("dispatchProposalId", "transportOrderId");

-- CreateIndex
CREATE INDEX "dispatch_candidates_tenantId_idx" ON "dispatch_candidates"("tenantId");

-- CreateIndex
CREATE INDEX "dispatch_candidates_dispatchProposalId_idx" ON "dispatch_candidates"("dispatchProposalId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_candidates_dispatchProposalId_rank_key" ON "dispatch_candidates"("dispatchProposalId", "rank");

-- CreateIndex
CREATE INDEX "delivery_slots_tenantId_idx" ON "delivery_slots"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_slots_tenantId_date_idx" ON "delivery_slots"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slots_tenantId_locationId_date_windowStart_windowE_key" ON "delivery_slots"("tenantId", "locationId", "date", "windowStart", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slot_invitations_tokenHash_key" ON "delivery_slot_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "delivery_slot_invitations_tenantId_idx" ON "delivery_slot_invitations"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_slot_invitations_tenantId_status_expiresAt_idx" ON "delivery_slot_invitations"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "delivery_slot_invitations_consignmentId_idx" ON "delivery_slot_invitations"("consignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slot_bookings_activeInvitationId_key" ON "delivery_slot_bookings"("activeInvitationId");

-- CreateIndex
CREATE INDEX "delivery_slot_bookings_tenantId_idx" ON "delivery_slot_bookings"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_slot_bookings_invitationId_idx" ON "delivery_slot_bookings"("invitationId");

-- CreateIndex
CREATE INDEX "delivery_slot_bookings_slotId_idx" ON "delivery_slot_bookings"("slotId");

-- AddForeignKey
ALTER TABLE "dispatch_proposals" ADD CONSTRAINT "dispatch_proposals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_proposals" ADD CONSTRAINT "dispatch_proposals_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "automation_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_proposals" ADD CONSTRAINT "dispatch_proposals_resultTourId_fkey" FOREIGN KEY ("resultTourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_proposals" ADD CONSTRAINT "dispatch_proposals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_proposal_orders" ADD CONSTRAINT "dispatch_proposal_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_proposal_orders" ADD CONSTRAINT "dispatch_proposal_orders_dispatchProposalId_fkey" FOREIGN KEY ("dispatchProposalId") REFERENCES "dispatch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_proposal_orders" ADD CONSTRAINT "dispatch_proposal_orders_transportOrderId_fkey" FOREIGN KEY ("transportOrderId") REFERENCES "transport_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_candidates" ADD CONSTRAINT "dispatch_candidates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_candidates" ADD CONSTRAINT "dispatch_candidates_dispatchProposalId_fkey" FOREIGN KEY ("dispatchProposalId") REFERENCES "dispatch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_candidates" ADD CONSTRAINT "dispatch_candidates_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_candidates" ADD CONSTRAINT "dispatch_candidates_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slot_invitations" ADD CONSTRAINT "delivery_slot_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slot_invitations" ADD CONSTRAINT "delivery_slot_invitations_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slot_invitations" ADD CONSTRAINT "delivery_slot_invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slot_bookings" ADD CONSTRAINT "delivery_slot_bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slot_bookings" ADD CONSTRAINT "delivery_slot_bookings_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "delivery_slot_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slot_bookings" ADD CONSTRAINT "delivery_slot_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "delivery_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


