-- Zeiterfassung'un append-only olay kaydi. WorkSession'a DOKUNULMUYOR: vardiya
-- kabi ve durumu orada kaliyor, bu tablo onun icindeki giris/mola/cikis detayi.
-- Toplam hicbir yerde saklanmiyor, gun olaylardan yeniden hesaplaniyor.
--
-- NOT: `migrate diff` bu sema disinda 7 adim daha uretiyor (TourStop/WorkSession
-- indeks dusurmeleri, EquipmentIssuance default'lari, tacho indeks adlari) —
-- bunlar baskasinin migrate edilmemis degisikligi, BILEREK dahil edilmedi.

-- CreateEnum
CREATE TYPE "WorkTimeEventType" AS ENUM ('clock_in', 'break_start', 'break_end', 'clock_out');

-- CreateEnum
CREATE TYPE "WorkTimeEventSource" AS ENUM ('driver_web', 'driver_mobile', 'office', 'auto');

-- CreateTable
CREATE TABLE "WorkTimeEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "workSessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "WorkTimeEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "WorkTimeEventSource" NOT NULL,
    "assignmentId" TEXT,
    "tourId" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "clientEventId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTimeEvent_tenantId_idx" ON "WorkTimeEvent"("tenantId");

-- CreateIndex
CREATE INDEX "WorkTimeEvent_workSessionId_occurredAt_idx" ON "WorkTimeEvent"("workSessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkTimeEvent_tenantId_driverId_occurredAt_idx" ON "WorkTimeEvent"("tenantId", "driverId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkTimeEvent_assignmentId_idx" ON "WorkTimeEvent"("assignmentId");

-- CreateIndex
CREATE INDEX "WorkTimeEvent_tourId_idx" ON "WorkTimeEvent"("tourId");

-- Cevrimdisi kuyrugun tekrar gonderdigi olay ikinci kez yazilamaz.
-- clientEventId NULL olabilir (ofis olaylari); Postgres coklu NULL'a izin verir.
-- CreateIndex
CREATE UNIQUE INDEX "WorkTimeEvent_tenantId_clientEventId_key" ON "WorkTimeEvent"("tenantId", "clientEventId");

-- AddForeignKey
ALTER TABLE "WorkTimeEvent" ADD CONSTRAINT "WorkTimeEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTimeEvent" ADD CONSTRAINT "WorkTimeEvent_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTimeEvent" ADD CONSTRAINT "WorkTimeEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTimeEvent" ADD CONSTRAINT "WorkTimeEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTimeEvent" ADD CONSTRAINT "WorkTimeEvent_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
