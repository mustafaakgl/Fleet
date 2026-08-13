import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../../common/utils/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { FuelingIntentService } from './fueling-intent.service';

/**
 * Ofisin yakit duragi gorunumu — SALT OKUNUR.
 *
 * NEDEN AYRI BIR UC, tur detayinin icine gomulmus bir alan degil: tur uclari
 * RoutingModule'de, yakit katmani ise FuelStationsModule'de duruyor ve
 * FuelStationsModule ZATEN RoutingModule'u iceri aliyor (Valhalla, rota
 * onbellegi). Tur detayina gomsek modul grafinde dongu olusur ve `forwardRef`
 * ile kirmak gerekirdi. Arayuz bu ucu tur detayinin ICINDE gosteriyor
 * (TourResultPanel), yani kullanici acisindan yer degismedi — yeni ve kopuk
 * bir panel ACILMADI.
 *
 * YAZMA UCU YOK ve bilincli olarak eklenmedi: ofis bu fazda surucunun secimini
 * sessizce degistiremez, silemez ve musteri tur sirasina ekleyemez. Rol ayrimi
 * da bundan doguyor — accounting dahil tum operasyonel roller yalnizca
 * OKUYABILIR.
 */
@Controller('fleet/fueling-intents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FuelingIntentOfficeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intents: FuelingIntentService,
  ) {}

  /**
   * Bir turun aktif yakit duragi.
   *
   * Tur once KIRACI KAPSAMLI istemciyle okunuyor: baska kiracinin tur kimligi
   * verildiginde sorgu bos doner ve 404 alinir — o turun surucusu uzerinden
   * yakit niyeti sizmaz.
   */
  @Get('by-tour/:tourId')
  async byTour(@Param('tourId') tourId: string) {
    const tour = await this.prisma.tour.findFirst({
      where: { id: tourId },
      select: { id: true, driverId: true, vehicleId: true },
    });
    if (!tour) {
      throw new NotFoundException({ code: 'tour_not_found' });
    }

    return { intent: await this.intents.findActiveForTour(tour) };
  }
}
