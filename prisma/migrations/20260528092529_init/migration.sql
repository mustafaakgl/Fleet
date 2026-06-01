-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'boss', 'accounting', 'office', 'driver');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('active', 'on_leave', 'sick', 'inactive', 'terminated');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('green', 'yellow', 'red');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('active', 'maintenance', 'broken', 'inactive');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'needs_review');

-- CreateEnum
CREATE TYPE "CalendarStatus" AS ENUM ('AT', 'UT', 'KT', 'FT', 'HO', 'SCH', 'GR', 'AZ', 'SZ', 'US', 'FR', 'WE', 'AB', 'MT');

-- CreateEnum
CREATE TYPE "CalendarSource" AS ENUM ('assignment', 'leave', 'manual');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('vacation', 'sick_leave', 'training', 'business_trip', 'doctor_appointment', 'special_leave', 'overtime_compensation', 'free_day', 'other');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('driver', 'vehicle', 'company', 'request', 'accident', 'cargo_damage', 'vehicle_handover', 'assignment', 'service_record');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('valid', 'expiring_soon', 'expired', 'missing', 'archived');

-- CreateEnum
CREATE TYPE "HandoverType" AS ENUM ('pickup', 'return');

-- CreateEnum
CREATE TYPE "HandoverPhotoStatus" AS ENUM ('not_required', 'missing', 'uploaded', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('pending', 'completed');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('vehicle_accident', 'cargo_damage');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('reported', 'under_review', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyEmailStatus" AS ENUM ('draft', 'needs_review', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('transport_request', 'request', 'document', 'handover', 'accident', 'cargo_damage', 'company_email', 'reminder', 'system');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('unread', 'read');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('open', 'sent', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('license_expiry', 'passport_expiry', 'tuv_expiry', 'sp_expiry', 'insurance_expiry', 'document_expiry', 'custom');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "language" TEXT NOT NULL DEFAULT 'de',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "licenseNumber" TEXT,
    "licenseExpiryDate" TIMESTAMP(3),
    "passportNumber" TEXT,
    "passportExpiryDate" TIMESTAMP(3),
    "status" "DriverStatus" NOT NULL DEFAULT 'active',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'green',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "vin" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'active',
    "currentDriverId" TEXT,
    "tuvExpiryDate" TIMESTAMP(3),
    "spExpiryDate" TIMESTAMP(3),
    "insuranceExpiryDate" TIMESTAMP(3),
    "registrationExpiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "contactPerson" TEXT,
    "defaultDailyRevenue" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cargoName" TEXT NOT NULL,
    "cargoOwner" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "routeName" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cargoName" TEXT NOT NULL,
    "cargoOwner" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'pending',
    "conflictReason" TEXT,
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "requestId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "CalendarStatus" NOT NULL,
    "source" "CalendarSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "expiryDate" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'valid',
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleHandover" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "previousVehicleId" TEXT,
    "assignmentId" TEXT,
    "handoverType" "HandoverType" NOT NULL,
    "handoverDateTime" TIMESTAMP(3) NOT NULL,
    "photoRequired" BOOLEAN NOT NULL DEFAULT false,
    "photoStatus" "HandoverPhotoStatus" NOT NULL DEFAULT 'not_required',
    "damageDetected" BOOLEAN NOT NULL DEFAULT false,
    "damageNotes" TEXT,
    "status" "HandoverStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accident" (
    "id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "companyId" TEXT,
    "assignmentId" TEXT,
    "incidentDateTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "cargoName" TEXT,
    "cargoOwner" TEXT,
    "damageValue" DECIMAL(12,2),
    "status" "IncidentStatus" NOT NULL DEFAULT 'reported',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEmail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CompanyEmailStatus" NOT NULL DEFAULT 'draft',
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'medium',
    "status" "NotificationStatus" NOT NULL DEFAULT 'unread',
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notifyBeforeDays" INTEGER NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_employeeNumber_key" ON "Driver"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNumber_key" ON "Vehicle"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_internalCode_key" ON "Vehicle"("internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Assignment_driverId_workDate_idx" ON "Assignment"("driverId", "workDate");

-- CreateIndex
CREATE INDEX "Assignment_vehicleId_workDate_idx" ON "Assignment"("vehicleId", "workDate");

-- CreateIndex
CREATE INDEX "Assignment_companyId_workDate_idx" ON "Assignment"("companyId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRequest_assignmentId_key" ON "TransportRequest"("assignmentId");

-- CreateIndex
CREATE INDEX "TransportRequest_driverId_requestedDate_idx" ON "TransportRequest"("driverId", "requestedDate");

-- CreateIndex
CREATE INDEX "TransportRequest_vehicleId_requestedDate_idx" ON "TransportRequest"("vehicleId", "requestedDate");

-- CreateIndex
CREATE INDEX "TransportRequest_companyId_requestedDate_idx" ON "TransportRequest"("companyId", "requestedDate");

-- CreateIndex
CREATE INDEX "CalendarEvent_driverId_date_idx" ON "CalendarEvent"("driverId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_requestId_idx" ON "CalendarEvent"("requestId");

-- CreateIndex
CREATE INDEX "Request_driverId_startDate_endDate_idx" ON "Request"("driverId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Document_ownerType_ownerId_idx" ON "Document"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_documentType_idx" ON "Document"("documentType");

-- CreateIndex
CREATE INDEX "Document_expiryDate_idx" ON "Document"("expiryDate");

-- CreateIndex
CREATE INDEX "VehicleHandover_driverId_handoverDateTime_idx" ON "VehicleHandover"("driverId", "handoverDateTime");

-- CreateIndex
CREATE INDEX "VehicleHandover_vehicleId_handoverDateTime_idx" ON "VehicleHandover"("vehicleId", "handoverDateTime");

-- CreateIndex
CREATE INDEX "VehicleHandover_assignmentId_idx" ON "VehicleHandover"("assignmentId");

-- CreateIndex
CREATE INDEX "Accident_driverId_incidentDateTime_idx" ON "Accident"("driverId", "incidentDateTime");

-- CreateIndex
CREATE INDEX "Accident_vehicleId_incidentDateTime_idx" ON "Accident"("vehicleId", "incidentDateTime");

-- CreateIndex
CREATE INDEX "Accident_companyId_incidentDateTime_idx" ON "Accident"("companyId", "incidentDateTime");

-- CreateIndex
CREATE INDEX "Accident_assignmentId_idx" ON "Accident"("assignmentId");

-- CreateIndex
CREATE INDEX "Accident_type_status_idx" ON "Accident"("type", "status");

-- CreateIndex
CREATE INDEX "CompanyEmail_companyId_date_idx" ON "CompanyEmail"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEmail_companyId_date_key" ON "CompanyEmail"("companyId", "date");

-- CreateIndex
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_status_dueDate_idx" ON "Reminder"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Reminder_targetType_targetId_idx" ON "Reminder"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_targetType_targetId_reminderType_dueDate_notifyBef_key" ON "Reminder"("targetType", "targetId", "reminderType", "dueDate", "notifyBeforeDays");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_currentDriverId_fkey" FOREIGN KEY ("currentDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accident" ADD CONSTRAINT "Accident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accident" ADD CONSTRAINT "Accident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accident" ADD CONSTRAINT "Accident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accident" ADD CONSTRAINT "Accident_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEmail" ADD CONSTRAINT "CompanyEmail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
