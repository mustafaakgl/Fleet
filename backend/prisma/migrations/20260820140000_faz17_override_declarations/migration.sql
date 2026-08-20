-- Faz 17 — kapsama kilitli override beyanlari.
--
-- TAMAMEN EKLEMELI: yalnizca yeni bir tablo ve iliskileri.
--
-- NEDEN KAPSAM: bir beyan ("takograf verisi yok ama surucunun kartina baktim")
-- BELIRLI BIR DURUMA aittir. Onerinin uzerinde serbest bir bayrak olsaydi ayni
-- beyan baska bir gune, baska bir surucuye ya da baska bir oneriye tasinabilir
-- ve kimsenin kontrol etmedigi bir surus suresi "kontrol edilmis" sayilirdi.
--
-- TEKILLIK KAPSAMI ICERIYOR:
--   (dispatchProposalId, checkCode, driverId, vehicleId, workDate)
-- Ayni kontrol FARKLI bir surucu/arac/gun icin AYRI bir beyan gerektirir.
--
-- `proposalRevision` beyanin dayandigi durumu damgalar: oneri yeniden
-- hesaplandiginda eski beyan tasinmaz.
-- CreateTable
CREATE TABLE "dispatch_override_declarations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "dispatchProposalId" TEXT NOT NULL,
    "checkCode" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "proposalRevision" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "answer" TEXT,
    "declaredById" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_override_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispatch_override_declarations_tenantId_idx" ON "dispatch_override_declarations"("tenantId");

-- CreateIndex
CREATE INDEX "dispatch_override_declarations_dispatchProposalId_idx" ON "dispatch_override_declarations"("dispatchProposalId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_override_declarations_dispatchProposalId_checkCode_key" ON "dispatch_override_declarations"("dispatchProposalId", "checkCode", "driverId", "vehicleId", "workDate");

-- AddForeignKey
ALTER TABLE "dispatch_override_declarations" ADD CONSTRAINT "dispatch_override_declarations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_override_declarations" ADD CONSTRAINT "dispatch_override_declarations_dispatchProposalId_fkey" FOREIGN KEY ("dispatchProposalId") REFERENCES "dispatch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_override_declarations" ADD CONSTRAINT "dispatch_override_declarations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_override_declarations" ADD CONSTRAINT "dispatch_override_declarations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_override_declarations" ADD CONSTRAINT "dispatch_override_declarations_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

