import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingService } from './geocoding.service';
import { RoutingCacheService } from './routing-cache.service';
import { RoutingController } from './routing.controller';
import { TourController } from './tour.controller';
import { TourDriverController } from './tour-driver.controller';
import { RouteDeviationService } from './route-deviation.service';
import { RoutingService } from './routing.service';
import { TourService } from './tour.service';
import { TourStopService } from './tour-stop.service';
import { ValhallaClient } from './valhalla.client';

/**
 * Rota/mesafe/geocoding katmani. Valhalla (self-hosted) + Photon uzerine kurulu.
 *
 * Hem ic servislere hizmet veriyor (gorev kaydetme, sapma raporu, ileride tur
 * optimizasyonu) hem de gorev formunun adres otomatik tamamlamasini besleyen
 * uclari aciyor.
 */
@Module({
  imports: [PrismaModule],
  controllers: [RoutingController, TourController, TourDriverController],
  providers: [ValhallaClient, GeocodingService, RoutingCacheService, RoutingService, TourService, TourStopService, RouteDeviationService],
  exports: [RoutingService, TourService, RouteDeviationService, ValhallaClient],
})
export class RoutingModule {}
