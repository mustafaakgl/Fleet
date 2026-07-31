import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingService } from './geocoding.service';
import { RoutingCacheService } from './routing-cache.service';
import { RoutingService } from './routing.service';
import { ValhallaClient } from './valhalla.client';

/**
 * Rota/mesafe/geocoding katmani. Valhalla (self-hosted) + Photon uzerine kurulu.
 *
 * Bilerek controller icermiyor: bu modul su an ic servislere hizmet veriyor
 * (gorev kaydetme, sapma raporu, ileride tur optimizasyonu). Disa acilacak bir
 * uc gerektiginde ilgili modul bu servisi enjekte eder.
 */
@Module({
  imports: [PrismaModule],
  providers: [ValhallaClient, GeocodingService, RoutingCacheService, RoutingService],
  exports: [RoutingService, ValhallaClient],
})
export class RoutingModule {}
