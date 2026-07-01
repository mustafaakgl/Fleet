-- CreateTable
CREATE TABLE "vehicle_telemetry_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "vehicleId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "speedKmh" INTEGER,
    "rpm" INTEGER,
    "fuelLevelPct" DECIMAL(5,2),
    "coolantTemp" DECIMAL(5,1),
    "voltage" DECIMAL(4,1),
    "odometerKm" DECIMAL(12,3),

    CONSTRAINT "vehicle_telemetry_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_telemetry_history_tenantId_idx" ON "vehicle_telemetry_history"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_telemetry_history_vehicleId_recordedAt_idx" ON "vehicle_telemetry_history"("vehicleId", "recordedAt");

-- AddForeignKey
ALTER TABLE "vehicle_telemetry_history" ADD CONSTRAINT "vehicle_telemetry_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telemetry_history" ADD CONSTRAINT "vehicle_telemetry_history_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
