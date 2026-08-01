import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingService } from './geocoding.service';
import { RoutingCacheService } from './routing-cache.service';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';
import { TourService } from './tour.service';
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
  controllers: [RoutingController],
  providers: [ValhallaClient, GeocodingService, RoutingCacheService, RoutingService, TourService],
  exports: [RoutingService, TourService, ValhallaClient],
})
export class RoutingModule {}
