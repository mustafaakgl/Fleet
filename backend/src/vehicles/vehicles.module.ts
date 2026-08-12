import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { FuelStationsModule } from '../fleet/fuel-stations/fuel-stations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { VehiclesController } from './vehicles.controller';
import { VehicleEquipmentService } from './vehicle-equipment.service';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    BillingModule,
    StorageModule,
    // Ofis uclari yakit uyumlulugunu buradan okuyup yaziyor; servis tek yerde.
    FuelStationsModule,
    MulterModule.register({}),
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleEquipmentService],
  exports: [VehiclesService, VehicleEquipmentService],
})
export class VehiclesModule {}
