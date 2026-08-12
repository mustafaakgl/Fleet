import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  DEFAULT_FUEL_STATION_RADIUS_KM,
  NearbyFuelStationsQueryDto,
} from './dto/nearby-fuel-stations.query';
import { FuelStationService } from './fuel-station.service';
import { RouteRecommendationService } from './route-recommendation.service';

/**
 * Surucunun "akilli yakit istasyonu" ucu.
 *
 * Yalnizca konum ve yaricap aliyor. Arac SUNUCUDA cozuluyor — istekte arac
 * secilemez, bkz. NearbyFuelStationsQueryDto.
 */
@Controller('driver/fuel-stations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FuelStationDriverController {
  constructor(
    private readonly fuelStations: FuelStationService,
    private readonly routeRecommendations_: RouteRecommendationService,
  ) {}

  @Get('nearby')
  nearby(@CurrentUser('id') userId: string, @Query() query: NearbyFuelStationsQueryDto) {
    return this.fuelStations.findNearbyForDriver(userId, {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radius_km ?? DEFAULT_FUEL_STATION_RADIUS_KM,
    });
  }

  /**
   * Aktif tura olan gercek yol sapmasina gore oneriler.
   *
   * AYNI DTO kullaniliyor: yalnizca konum ve yaricap kabul ediliyor. Global
   * ValidationPipe forbidNonWhitelisted ile calistigi icin tourId, vehicleId,
   * driverId, nextStopId ya da rota maliyet profili gonderme denemesi 400 ile
   * REDDEDILIR — hepsi sunucuda oturumdaki surucuden ve kiracidan cozulur.
   *
   * Is mantigi controller'da DEGIL: RouteRecommendationService'te.
   */
  @Get('route-recommendations')
  routeRecommendations(
    @CurrentUser('id') userId: string,
    @Query() query: NearbyFuelStationsQueryDto,
  ) {
    return this.routeRecommendations_.findRouteRecommendationsForDriver(userId, {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radius_km ?? DEFAULT_FUEL_STATION_RADIUS_KM,
    });
  }
}
