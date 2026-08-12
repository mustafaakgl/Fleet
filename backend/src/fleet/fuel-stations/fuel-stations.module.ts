import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RoutingModule } from '../../routing/routing.module';
import { FleetModule } from '../fleet.module';
import { FuelStationCacheService } from './fuel-station-cache.service';
import { resolveFuelStationProviderKind } from './fuel-station-provider.config';
import { FuelStationDriverController } from './fuel-station.controller';
import { FuelStationService } from './fuel-station.service';
import { FUEL_STATION_PROVIDER } from './fuel-station.types';
import { MockFuelStationProvider } from './mock-fuel-station.provider';
import { RouteRecommendationService } from './route-recommendation.service';
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
  // RoutingModule: mevcut Valhalla istemcisi, RoutingService ve rota onbellegi
  // buradan geliyor — paralel bir routing katmani kurulmadi.
  imports: [PrismaModule, AuditModule, FleetModule, RoutingModule],
  controllers: [FuelStationDriverController],
  providers: [
    FuelStationCacheService,
    TankerkoenigFuelStationProvider,
    MockFuelStationProvider,
    {
      // Saglayici ACILISTA seciliyor, istek basina degil: yanlis yapilandirma
      // ilk surucu istegini bekleyip sessizce 503 uretmek yerine surec
      // baslarken duyulur olmali. resolveFuelStationProviderKind uretimde
      // mock secilmisse burada firlatir ve modul kurulumu basarisiz olur.
      provide: FUEL_STATION_PROVIDER,
      useFactory: (
        tankerkoenig: TankerkoenigFuelStationProvider,
        mock: MockFuelStationProvider,
      ) => (resolveFuelStationProviderKind() === 'mock' ? mock : tankerkoenig),
      inject: [TankerkoenigFuelStationProvider, MockFuelStationProvider],
    },
    VehicleFuelCompatibilityService,
    FuelStationService,
    RouteRecommendationService,
  ],
  exports: [VehicleFuelCompatibilityService],
})
export class FuelStationsModule {}
