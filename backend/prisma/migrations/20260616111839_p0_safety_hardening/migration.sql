-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_driverId_fkey";

-- DropForeignKey
ALTER TABLE "DriverLicense" DROP CONSTRAINT "DriverLicense_driverId_fkey";

-- DropForeignKey
ALTER TABLE "LicenseCheck" DROP CONSTRAINT "LicenseCheck_driverId_fkey";

-- DropForeignKey
ALTER TABLE "Request" DROP CONSTRAINT "Request_driverId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRecord" DROP CONSTRAINT "ServiceRecord_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleEquipment" DROP CONSTRAINT "VehicleEquipment_vehicleId_fkey";

-- DropIndex
DROP INDEX "Reminder_targetType_targetId_reminderType_dueDate_notifyBef_key";

-- AlterTable
ALTER TABLE "Accident" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Assignment" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "CalendarEvent" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "CompanyEmail" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Driver" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "DriverLocationHistory" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "MorningCheckin" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Reminder" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Request" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "ServiceRecord" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "TransportRequest" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "VehicleHandover" ALTER COLUMN "tenantId" SET DEFAULT 'default-tenant';

-- AddForeignKey
ALTER TABLE "DriverLicense" ADD CONSTRAINT "DriverLicense_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseCheck" ADD CONSTRAINT "LicenseCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleEquipment" ADD CONSTRAINT "VehicleEquipment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Reminder_tenantId_targetType_targetId_reminderType_title_dueDat" RENAME TO "Reminder_tenantId_targetType_targetId_reminderType_title_du_key";

-- RenameIndex
ALTER INDEX "fleet_trip_location_points_tripId_recordedAt_latitude_longitu_k" RENAME TO "fleet_trip_location_points_tripId_recordedAt_latitude_longi_key";
