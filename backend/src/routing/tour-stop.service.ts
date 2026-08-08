import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, TourStopStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decideStopTransition,
  isTerminalStopStatus,
  type TourStopExecutionStatus,
} from './core/tour-stop-transition.util';

/**
 * Surucunun durak uzerindeki yurutme kayitlari.
 *
 * Fahrtenbuch (FleetTrip) BILEREK kullanilmiyor: o kayit vergi defteri, arac+
 * surucu granularitesinde ve siniflandirildiktan sonra kilitleniyor. Operasyonel
 * ilerlemeyi oraya yazmak hem yanlis granularite hem de o kaydin delil degerini
 * zedeler.
 */

const TERMINAL: TourStopStatus[] = [TourStopStatus.completed, TourStopStatus.skipped];

export interface MarkTourStopInput {
  status: TourStopStatus;
  /** Cevrimdisi kuyruk ayni olayi tekrar gonderirse ikinci kez uygulanmasin. */
  clientEventId?: string;
  latitude?: number;
  longitude?: number;
  /** Cevrimdisi yakalanan an; verilmezse sunucu saati. */
  occurredAt?: string;
}

@Injectable()
export class TourStopService {
  constructor(private readonly prisma: PrismaService) {}

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

  async markStop(userId: string, stopId: string, input: MarkTourStopInput) {
    if (input.status === TourStopStatus.pending) {
      throw new BadRequestException({ code: 'cannot_mark_pending' });
    }

    const driverId = await this.resolveDriverId(userId);

    const stop = await this.prisma.tourStop.findUnique({
      where: { id: stopId },
      select: {
        id: true,
        tenantId: true,
        tourId: true,
        assignmentId: true,
        status: true,
        clientEventId: true,
        tour: { select: { driverId: true } },
      },
    });
    if (!stop) {
      throw new NotFoundException({ code: 'tour_stop_not_found' });
    }
    // Bir surucu baskasinin turunu isaretleyemez.
    if (stop.tour.driverId !== driverId) {
      throw new ForbiddenException({ code: 'tour_stop_not_yours' });
    }

    // Uygulanip uygulanmayacagi saf fonksiyonda (core/tour-stop-transition):
    // cevrimdisi kuyruk olaylari sirasi bozuk ve tekrarli gelebiliyor.
    const decision = decideStopTransition(
      {
        status: stop.status as TourStopExecutionStatus,
        clientEventId: stop.clientEventId,
      },
      {
        status: input.status as TourStopExecutionStatus,
        clientEventId: input.clientEventId ?? null,
      },
    );
    if (!decision.apply) {
      return this.stopState(stop.id);
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException({ code: 'invalid_occurred_at' });
    }

    const data: Prisma.TourStopUpdateInput = {
      status: input.status,
      clientEventId: input.clientEventId ?? null,
    };
    if (decision.setsArrivedAt) {
      data.arrivedAt = occurredAt;
    }
    if (decision.setsCompletedAt) {
      data.completedAt = occurredAt;
      if (input.latitude !== undefined && input.longitude !== undefined) {
        data.completedLatitude = new Prisma.Decimal(input.latitude);
        data.completedLongitude = new Prisma.Decimal(input.longitude);
      }
    }

    await this.prisma.tourStop.update({ where: { id: stop.id }, data });

    if (isTerminalStopStatus(input.status as TourStopExecutionStatus)) {
      await this.closeFinishedWork(stop.tourId, stop.assignmentId);
    }

    return this.stopState(stop.id);
  }

  /** Yanlis dokunusu geri alir: durak yeniden bekliyor durumuna doner. */
  async resetStop(userId: string, stopId: string) {
    const driverId = await this.resolveDriverId(userId);
    const stop = await this.prisma.tourStop.findUnique({
      where: { id: stopId },
      select: { id: true, tour: { select: { driverId: true } } },
    });
    if (!stop) {
      throw new NotFoundException({ code: 'tour_stop_not_found' });
    }
    if (stop.tour.driverId !== driverId) {
      throw new ForbiddenException({ code: 'tour_stop_not_yours' });
    }

    await this.prisma.tourStop.update({
      where: { id: stop.id },
      data: {
        status: TourStopStatus.pending,
        arrivedAt: null,
        completedAt: null,
        completedLatitude: null,
        completedLongitude: null,
        clientEventId: null,
      },
    });

    return this.stopState(stop.id);
  }

  /**
   * Isi bitmis olani kapatir.
   *
   * Gorev bazinda calisiyor, tur bazinda degil: bir turun duraklari farkli
   * gorevlere ait olabilir ve ilk gorev erken bitiyorsa turun tamamini
   * beklememeli. Surucuye Assignment uzerinde yazma yetkisi verilmedi; kural
   * sunucuda ve yalnizca "o goreve ait tum duraklar bitti" kosuluyla isliyor.
   */
  private async closeFinishedWork(tourId: string, assignmentId: string | null) {
    if (assignmentId) {
      const open = await this.prisma.tourStop.count({
        where: { assignmentId, status: { notIn: TERMINAL } },
      });
      if (open === 0) {
        await this.prisma.assignment.updateMany({
          // Iptal edilmis veya zaten kapanmis gorevi geri acmiyoruz.
          where: {
            id: assignmentId,
            status: { in: [AssignmentStatus.planned, AssignmentStatus.confirmed, AssignmentStatus.in_progress] },
          },
          data: { status: AssignmentStatus.completed },
        });
      }
    }

    const openInTour = await this.prisma.tourStop.count({
      where: { tourId, status: { notIn: TERMINAL } },
    });
    if (openInTour === 0) {
      await this.prisma.tour.updateMany({
        where: { id: tourId, status: { notIn: ['completed', 'cancelled'] } },
        data: { status: 'completed' },
      });
    }
  }

  private async stopState(stopId: string) {
    const stop = await this.prisma.tourStop.findUniqueOrThrow({
      where: { id: stopId },
      select: {
        id: true,
        status: true,
        arrivedAt: true,
        completedAt: true,
        tourId: true,
        assignmentId: true,
      },
    });
    return {
      id: stop.id,
      status: stop.status,
      arrived_at: stop.arrivedAt?.toISOString() ?? null,
      completed_at: stop.completedAt?.toISOString() ?? null,
    };
  }
}
