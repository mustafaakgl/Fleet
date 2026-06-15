-- AlterTable
ALTER TABLE "VehicleEquipment" ADD COLUMN "photoDocumentId" TEXT;

-- AlterTable
ALTER TABLE "VehicleHandover" ADD COLUMN "equipmentInventoryChecks" JSONB;
