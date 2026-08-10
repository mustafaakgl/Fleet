-- Takograf REST'inden turetilen MOLA ADAYI.
--
-- Bordro semasina dokunmuyor: adaylar ayri bir tabloda duruyor ve bordro
-- yalnizca WorkTimeEvent okumaya devam ediyor. Onay verilince olaylar normal
-- append-only yoldan yaziliyor, bu tablo yalnizca hangi adaydan turedigini
-- kaydediyor.
--
-- NOT: prisma migrate diff bu semayla birlikte, bu ozellikten ONCE var olan
-- drift'i de (TourStop/WorkSession indeksleri, EquipmentIssuance varsayilanlari,
-- handover_photos indeks adi) uretiyordu. Bunlar bilincli olarak DISARIDA
-- birakildi: ilgisiz bir indeksi bu migration'in sessizce dusurmesi yanlis
-- olurdu.

-- CreateEnum
CREATE TYPE "BreakCandidateStatus" AS ENUM ('pending', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "BreakCandidateSource" AS ENUM ('tachograph');

-- AlterTable
ALTER TABLE "TenantPayrollProfile" ADD COLUMN "breakCandidateMinMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "BreakCandidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "driverId" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "source" "BreakCandidateSource" NOT NULL DEFAULT 'tachograph',
    "status" "BreakCandidateStatus" NOT NULL DEFAULT 'pending',
    -- Onerinin gerekcesi. Takograf kayitlari yeniden islenebiliyor; hesabin
    -- girdileri sonucla birlikte dondurulmazsa aday sonradan aciklanamaz.
    "evidenceStartedAt" TIMESTAMP(3) NOT NULL,
    "evidenceEndedAt" TIMESTAMP(3) NOT NULL,
    "evidenceRestMinutes" INTEGER NOT NULL,
    "evidenceRecordedBreakMinutes" INTEGER NOT NULL,
    "evidenceActivityIds" JSONB NOT NULL,
    "evidenceDddFileIds" JSONB NOT NULL,
    "derivedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionSource" "WorkTimeEventSource",
    "breakStartEventId" TEXT,
    "breakEndEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreakCandidate_breakStartEventId_key" ON "BreakCandidate"("breakStartEventId");

-- CreateIndex
CREATE UNIQUE INDEX "BreakCandidate_breakEndEventId_key" ON "BreakCandidate"("breakEndEventId");

-- CreateIndex
CREATE INDEX "BreakCandidate_tenantId_idx" ON "BreakCandidate"("tenantId");

-- CreateIndex
CREATE INDEX "BreakCandidate_tenantId_status_idx" ON "BreakCandidate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BreakCandidate_tenantId_driverId_startedAt_idx" ON "BreakCandidate"("tenantId", "driverId", "startedAt");

-- CreateIndex
CREATE INDEX "BreakCandidate_workSessionId_status_idx" ON "BreakCandidate"("workSessionId", "status");

-- Uretim tekrarlanabilir olmali: her DDD indirmesinde yeniden taraniyor.
-- Baslangic ani capa; ayni dinlenme ikinci kez aday olmuyor ve verilmis karar
-- geri gelmiyor.
-- CreateIndex
CREATE UNIQUE INDEX "BreakCandidate_tenantId_workSessionId_startedAt_key" ON "BreakCandidate"("tenantId", "workSessionId", "startedAt");

-- AddForeignKey
ALTER TABLE "BreakCandidate" ADD CONSTRAINT "BreakCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakCandidate" ADD CONSTRAINT "BreakCandidate_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakCandidate" ADD CONSTRAINT "BreakCandidate_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakCandidate" ADD CONSTRAINT "BreakCandidate_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakCandidate" ADD CONSTRAINT "BreakCandidate_breakStartEventId_fkey" FOREIGN KEY ("breakStartEventId") REFERENCES "WorkTimeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakCandidate" ADD CONSTRAINT "BreakCandidate_breakEndEventId_fkey" FOREIGN KEY ("breakEndEventId") REFERENCES "WorkTimeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
