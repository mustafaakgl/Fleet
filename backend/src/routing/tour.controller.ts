import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TourStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { CreateTourDto } from './dto/create-tour.dto';
import { CreateTourFromStopsDto, TourStopInputDto } from './dto/create-tour-from-stops.dto';
import { TourService, type TourStopInput } from './tour.service';

/**
 * Ofis tarafinin tur uclari: tur kur, sirayi optimize et, sonucu onayla.
 *
 * Optimizasyon bilincli olarak iki adim: once hesaplanir ve "once/sonra"
 * gosterilir, sonra dispatcher onaylar. Otomatik uygulamak guven kaybettirir —
 * sonucu goremeyen bir planlamaci sisteme guvenmez.
 */
@Controller('routing/tours')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class TourController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tours: TourService,
  ) {}

  @Get()
  async list(@Query('date') date?: string) {
    const day = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException({ code: 'invalid_date' });
    }
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const tours = await this.prisma.tour.findMany({
      where: { workDate: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        workDate: true,
        status: true,
        plannedDistanceKm: true,
        plannedDurationMin: true,
        baselineDistanceKm: true,
        optimizedAt: true,
        optimizationError: true,
        vehicle: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { stops: true } },
      },
    });

    return {
      tours: tours.map((tour) => ({
        id: tour.id,
        name: tour.name,
        workDate: tour.workDate.toISOString(),
        status: tour.status,
        stopCount: tour._count.stops,
        plannedDistanceKm: numberOrNull(tour.plannedDistanceKm),
        plannedDurationMin: tour.plannedDurationMin,
        baselineDistanceKm: numberOrNull(tour.baselineDistanceKm),
        optimizedAt: tour.optimizedAt?.toISOString() ?? null,
        optimizationError: tour.optimizationError,
        vehiclePlate: tour.vehicle?.plateNumber ?? null,
        driverName: tour.driver
          ? `${tour.driver.firstName} ${tour.driver.lastName}`.trim()
          : null,
      })),
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.toClientTour(await this.tours.findById(id));
  }

  @Post()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  async create(@Body() dto: CreateTourDto, @CurrentUser('id') userId: string) {
    const workDate = new Date(dto.work_date);
    if (Number.isNaN(workDate.getTime())) {
      throw new BadRequestException({ code: 'invalid_work_date' });
    }

    const tour = await this.tours.createFromAssignments({
      assignmentIds: dto.assignment_ids,
      workDate,
      name: dto.name ?? null,
      vehicleId: dto.vehicle_id ?? null,
      driverId: dto.driver_id ?? null,
      depotLocationId: dto.depot_location_id ?? null,
      createdById: userId,
    });

    return this.toClientTour(await this.tours.findById(tour.id));
  }

  /**
   * Serbest duraklardan tur kurar — gorev secmeye gerek yok.
   *
   * `POST /routing/tours` ile ayni turu uretir, girdisi farklidir: orada
   * gorevler, burada adresler. Iki uc bilincli olarak ayri; gorev akisi
   * alis-teslim ciftleri uretir ve Assignment -> Invoice zincirine baglidir,
   * serbest duraklar ise hicbir goreve bagli degildir.
   */
  @Post('from-stops')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  async createFromStops(
    @Body() dto: CreateTourFromStopsDto,
    @CurrentUser('id') userId: string,
  ) {
    const workDate = new Date(dto.work_date);
    if (Number.isNaN(workDate.getTime())) {
      throw new BadRequestException({ code: 'invalid_work_date' });
    }

    let plannedStartAt: Date | null = null;
    if (dto.planned_start_at) {
      plannedStartAt = new Date(dto.planned_start_at);
      if (Number.isNaN(plannedStartAt.getTime())) {
        throw new BadRequestException({ code: 'invalid_planned_start_at' });
      }
    }

    const tour = await this.tours.createFromStops({
      workDate,
      plannedStartAt,
      name: dto.name ?? null,
      vehicleId: dto.vehicle_id ?? null,
      driverId: dto.driver_id ?? null,
      start: toStopInput(dto.start),
      stops: dto.stops.map(toStopInput),
      returnToStart: dto.return_to_start ?? false,
      end: dto.end ? toStopInput(dto.end) : null,
      createdById: userId,
    });

    return this.toClientTour(await this.tours.findById(tour.id));
  }

  /**
   * Sirayi optimize eder. `optimized: false` bir HATA DEGIL — cikti alis-teslim
   * kuralini ihlal ediyorsa veya bir durak kamyona kapaliysa mevcut sira
   * korunur ve sebep donulur. Arayuz bunu uyari olarak gostermeli.
   */
  @Post(':id/optimize')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  async optimize(@Param('id') id: string) {
    const result = await this.tours.optimizeSequence(id);
    const tour = await this.tours.findById(id);

    return {
      ...result,
      savedKm:
        result.before?.distanceKm != null && result.after?.distanceKm != null
          ? Number((result.before.distanceKm - result.after.distanceKm).toFixed(2))
          : null,
      tour: this.toClientTour(tour),
    };
  }

  /**
   * Dispatcher onayi. Bu adim olmadan surucu heniz incelenmemis bir plani
   * gorurdu; tur ancak burada surucuye acilir.
   */
  @Post(':id/release')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  async release(@Param('id') id: string) {
    const tour = await this.tours.findById(id);

    if (tour.status !== TourStatus.optimized && tour.status !== TourStatus.draft) {
      throw new BadRequestException({ code: 'tour_not_releasable', status: tour.status });
    }

    await this.prisma.tour.update({
      where: { id: tour.id },
      data: { status: TourStatus.released },
    });

    return this.toClientTour(await this.tours.findById(id));
  }

  private toClientTour(tour: Awaited<ReturnType<TourService['findById']>>) {
    return {
      id: tour.id,
      name: tour.name,
      workDate: tour.workDate.toISOString(),
      plannedStartAt: tour.plannedStartAt?.toISOString() ?? null,
      plannedEndAt: tour.plannedEndAt?.toISOString() ?? null,
      status: tour.status,
      plannedDistanceKm: numberOrNull(tour.plannedDistanceKm),
      plannedDurationMin: tour.plannedDurationMin,
      baselineDistanceKm: numberOrNull(tour.baselineDistanceKm),
      baselineDurationMin: tour.baselineDurationMin,
      optimizedAt: tour.optimizedAt?.toISOString() ?? null,
      optimizationError: tour.optimizationError,
      stops: tour.stops.map((stop) => ({
        id: stop.id,
        sequence: stop.sequence,
        plannedSequence: stop.plannedSequence,
        kind: stop.kind,
        assignmentId: stop.assignmentId,
        address: stop.location.rawAddress,
        label: stop.location.label,
        city: stop.location.city,
        postalCode: stop.location.postalCode,
        latitude: numberOrNull(stop.location.latitude),
        longitude: numberOrNull(stop.location.longitude),
        truckAccess: stop.location.truckAccess,
        serviceMinutes: stop.serviceMinutes,
        windowStart: stop.windowStart,
        windowEnd: stop.windowEnd,
        legDistanceKm: numberOrNull(stop.legDistanceKm),
        legDurationMin: stop.legDurationMin,
        legShape: stop.legShape,
        plannedArrivalAt: stop.plannedArrivalAt?.toISOString() ?? null,
        plannedDepartureAt: stop.plannedDepartureAt?.toISOString() ?? null,
      })),
    };
  }
}

/** DTO'nun snake_case alanlarini servisin camelCase girdisine cevirir. */
function toStopInput(dto: TourStopInputDto): TourStopInput {
  return {
    locationId: dto.location_id ?? null,
    address: dto.address ?? null,
    label: dto.label ?? null,
    serviceMinutes: dto.service_minutes ?? null,
    windowStart: dto.window_start ?? null,
    windowEnd: dto.window_end ?? null,
  };
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
