import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { AddressSuggestQueryDto } from './dto/address-suggest.query';
import { ResolvePickedLocationDto } from './dto/resolve-picked-location.dto';
import { RouteDeviationService } from './route-deviation.service';
import { RoutingService } from './routing.service';

/**
 * Gorev formunun adres alanlarini besleyen uclar.
 *
 * Akis: kullanici sehri secer -> sokagi secer -> secim Location'a cevrilir ve
 * kamyon erisilebilirligi aninda dondurulur -> iki uc secilince rota onizlenir.
 * Hicbir adimda sunucu adres tahmini yapmaz; koordinat kullanicinin sectigi
 * adaydan gelir.
 */
@Controller('routing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class RoutingController {
  constructor(
    private readonly routing: RoutingService,
    private readonly deviation: RouteDeviationService,
  ) {}

  /**
   * Planlanan vs gerceklesen mesafe raporu.
   *
   * Gorev basina bir Valhalla cagrisi gerekebildigi icin donem sinirli
   * taraniyor; genis donemler icin arka plan isine tasinmali.
   */
  @Get('deviation-report')
  async deviationReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth(), 1);

    const fromDate = from ? new Date(from) : defaultFrom;
    const toDate = to ? new Date(to) : defaultTo;

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException({ code: 'invalid_date_range' });
    }
    if (fromDate >= toDate) {
      throw new BadRequestException({ code: 'from_must_precede_to' });
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    return this.deviation.buildReport({
      from: fromDate,
      to: toDate,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('address-suggestions')
  async suggest(@Query() query: AddressSuggestQueryDto) {
    const result = await this.routing.suggestAddresses({
      query: query.q,
      kind: query.kind,
      city: query.city ?? null,
      limit: query.limit,
    });

    if (!result.ok) {
      if (result.error === 'invalid_input') {
        throw new BadRequestException({ code: result.message });
      }
      // Geocoder gecici olarak erisilemez — form calismaya devam etmeli,
      // kullanici adresi elle yazabilir.
      return { suggestions: [], degraded: true, reason: result.error };
    }

    return { suggestions: result.value, degraded: false };
  }

  @Post('locations/pick')
  async pick(@Body() dto: ResolvePickedLocationDto) {
    const location = await this.routing.resolvePickedLocation(dto);
    if (!location) {
      throw new BadRequestException({ code: 'address_incomplete' });
    }

    return {
      id: location.id,
      rawAddress: location.rawAddress,
      street: location.street,
      houseNumber: location.houseNumber,
      postalCode: location.postalCode,
      city: location.city,
      countryCode: location.countryCode,
      latitude: location.latitude === null ? null : Number(location.latitude),
      longitude: location.longitude === null ? null : Number(location.longitude),
      truckAccess: location.truckAccess,
      truckSnapDistanceM:
        location.truckSnapDistanceM === null ? null : Number(location.truckSnapDistanceM),
      truckAccessNote: location.truckAccessNote,
    };
  }

  @Get('route-preview/:fromLocationId/:toLocationId')
  async routePreview(
    @Param('fromLocationId') fromLocationId: string,
    @Param('toLocationId') toLocationId: string,
  ) {
    const result = await this.routing.routePreviewBetweenLocations(fromLocationId, toLocationId);

    if (!result.ok) {
      if (result.error === 'invalid_input') {
        throw new BadRequestException({ code: result.message });
      }
      return { available: false, reason: result.error, message: result.message };
    }

    return {
      available: true,
      distanceKm: Number(result.value.distanceKm.toFixed(2)),
      durationMinutes: Number(result.value.durationMinutes.toFixed(1)),
      hasToll: result.value.hasToll,
      shape: result.value.shape,
    };
  }

  @Get('health')
  health() {
    return this.routing.health();
  }
}
