-- Faz 9: onaylanmis yakit fisinin ters kaydi.
--
-- YALNIZCA ADDITIVE. Mevcut hicbir satir silinmiyor, hicbir finansal alan
-- degistirilmiyor, hicbir kolon dusurulmuyor. Orijinal `fleet_fuel_entries`
-- kayitlari OLDUGU GIBI kaliyor; gecerlilik bilgisi bu yeni tabloda duruyor.

-- CreateEnum
CREATE TYPE "FuelEntryReversalReason" AS ENUM ('duplicate', 'incorrect_amount', 'incorrect_vehicle', 'incorrect_currency', 'incorrect_date', 'wrong_or_unreadable_document', 'other');

-- CreateTable
CREATE TABLE "fleet_fuel_entry_reversals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "originalEntryId" TEXT NOT NULL,
    "replacementEntryId" TEXT,
    "reasonCode" "FuelEntryReversalReason" NOT NULL,
    "reason" TEXT NOT NULL,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_fuel_entry_reversals_pkey" PRIMARY KEY ("id")
);

-- Bir fis EN FAZLA BIR KEZ ters kayda alinabilir. Kural VERITABANINDA:
-- iki es zamanli istek uygulama kontrolunu birlikte gecebilir, unique
-- indeksi gecemez.
-- CreateIndex
CREATE UNIQUE INDEX "fleet_fuel_entry_reversals_originalEntryId_key" ON "fleet_fuel_entry_reversals"("originalEntryId");

-- Bir duzeltme kaydi EN FAZLA BIR ters kayda ait olabilir.
-- CreateIndex
CREATE UNIQUE INDEX "fleet_fuel_entry_reversals_replacementEntryId_key" ON "fleet_fuel_entry_reversals"("replacementEntryId");

-- CreateIndex
CREATE INDEX "fleet_fuel_entry_reversals_tenantId_idx" ON "fleet_fuel_entry_reversals"("tenantId");

-- CreateIndex
CREATE INDEX "fleet_fuel_entry_reversals_tenantId_reversedAt_idx" ON "fleet_fuel_entry_reversals"("tenantId", "reversedAt");

-- AddForeignKey
ALTER TABLE "fleet_fuel_entry_reversals" ADD CONSTRAINT "fleet_fuel_entry_reversals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT: ters kayda alinmis bir fis silinemez hale gelir. Bu bilincli —
-- denetim zinciri, halkalarindan biri yok olunca anlamini kaybeder.
-- AddForeignKey
ALTER TABLE "fleet_fuel_entry_reversals" ADD CONSTRAINT "fleet_fuel_entry_reversals_originalEntryId_fkey" FOREIGN KEY ("originalEntryId") REFERENCES "fleet_fuel_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_fuel_entry_reversals" ADD CONSTRAINT "fleet_fuel_entry_reversals_replacementEntryId_fkey" FOREIGN KEY ("replacementEntryId") REFERENCES "fleet_fuel_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kullanici silinirse ters kayit KALIR: denetim izi, aktoru artik
-- cozulemese bile kaybolmamali.
-- AddForeignKey
ALTER TABLE "fleet_fuel_entry_reversals" ADD CONSTRAINT "fleet_fuel_entry_reversals_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
