import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TourService } from './tour.service';

/**
 * Surucu uygulamasinin tur ucu.
 *
 * Koordinat gonderiliyor, adres metni degil: telefon navigasyonu adres metnini
 * yeniden arar ve baska bir noktaya dusebilir. Bizim koordinatimiz secilmis ve
 * kamyon erisimi dogrulanmis durumda.
 */
@Controller('driver/tours')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class TourDriverController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tours: TourService,
  ) {}

  private async resolveDriverId(userId: string): Promise<string> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException({ code: 'driver_profile_not_found' });
    }
    return driver.id;
  }

  /** Surucunun o gunku turu. Tarih verilmezse bugun. */
  @Get('today')
  async today(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    const driverId = await this.resolveDriverId(userId);

    const day = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) {
      throw new NotFoundException({ code: 'invalid_date' });
    }
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const tour = await this.prisma.tour.findFirst({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        // Taslak turlar surucuye gosterilmez — dispatcher heniz onaylamadi
        status: { in: ['optimized', 'released', 'in_progress'] },
      },
      orderBy: { workDate: 'asc' },
      select: { id: true },
    });

    if (!tour) {
      return { tour: null };
    }

    return { tour: this.toClientTour(await this.tours.findById(tour.id)) };
  }

  private toClientTour(tour: Awaited<ReturnType<TourService['findById']>>) {
    return {
      id: tour.id,
      name: tour.name,
      workDate: tour.workDate.toISOString(),
      status: tour.status,
      plannedDistanceKm:
        tour.plannedDistanceKm === null ? null : Number(tour.plannedDistanceKm),
      plannedDurationMin: tour.plannedDurationMin,
      stops: tour.stops.map((stop) => ({
        id: stop.id,
        sequence: stop.sequence,
        kind: stop.kind,
        assignmentId: stop.assignmentId,
        address: stop.location.rawAddress,
        street: stop.location.street,
        postalCode: stop.location.postalCode,
        city: stop.location.city,
        latitude: stop.location.latitude === null ? null : Number(stop.location.latitude),
        longitude: stop.location.longitude === null ? null : Number(stop.location.longitude),
        /// Kamyon erisimi supheliyse surucu uyarilmali; navigasyon yine acilir
        /// ama korumasiz gitmesin.
        truckAccess: stop.location.truckAccess,
        windowStart: stop.windowStart,
        windowEnd: stop.windowEnd,
        serviceMinutes: stop.serviceMinutes,
        plannedArrivalAt: stop.plannedArrivalAt?.toISOString() ?? null,
        legDistanceKm: stop.legDistanceKm === null ? null : Number(stop.legDistanceKm),
      })),
    };
  }
}
