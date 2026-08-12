import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FleetModule } from '../fleet.module';
import { FuelStationCacheService } from './fuel-station-cache.service';
import { FuelStationDriverController } from './fuel-station.controller';
import { FuelStationService } from './fuel-station.service';
import { FUEL_STATION_PROVIDER } from './fuel-station.types';
import { TankerkoenigFuelStationProvider } from './tankerkoenig-fuel-station.provider';
import { VehicleFuelCompatibilityService } from './vehicle-fuel-compatibility.service';

/**
 * Akilli yakit istasyonu katmani (Faz 1).
 *
 * Saglayici somut sinif yerine FUEL_STATION_PROVIDER token'i uzerinden
 * baglaniyor: ikinci bir kaynak eklendiginde (ya da testte mock verildiginde)
 * degisen tek yer bu satir.
 *
 * DriverVehicleService FleetModule'den geliyor — "surucunun bugunku araci"
 * mantigi tek yerde duruyor, burada kopyalanmiyor.
 */
@Module({
  imports: [PrismaModule, AuditModule, FleetModule],
  controllers: [FuelStationDriverController],
  providers: [
    FuelStationCacheService,
    TankerkoenigFuelStationProvider,
    { provide: FUEL_STATION_PROVIDER, useExisting: TankerkoenigFuelStationProvider },
    VehicleFuelCompatibilityService,
    FuelStationService,
  ],
  exports: [VehicleFuelCompatibilityService],
})
export class FuelStationsModule {}
