import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Tour, TourStatus, TourStopKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyOptimizedOrder,
  splitDepotStops,
  toSequenceNumbers,
  validateSequenceInput,
  violatesPickupBeforeDelivery,
  type SequenceableStop,
} from './core/tour-sequence.util';
import { DEFAULT_TRUCK_PROFILE, type GeoPoint } from './core/routing.types';
import { ValhallaClient } from './valhalla.client';

export interface CreateTourFromAssignmentsParams {
  assignmentIds: string[];
  workDate: Date;
  name?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  depotLocationId?: string | null;
  createdById: string;
}

export interface OptimizeResult {
  optimized: boolean;
  reason?: string;
  before?: { distanceKm: number | null; durationMinutes: number | null };
  after?: { distanceKm: number; durationMinutes: number };
}

@Injectable()
export class TourService {
  private readonly logger = new Logger(TourService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly valhalla: ValhallaClient,
  ) {}

  /**
   * Secilen gorevlerden bir tur olusturur.
   *
   * Her gorev iki durak uretir: alis ve teslim. Sira once kullanicinin verdigi
   * gorev sirasidir; optimizasyon ayri bir adim olarak calisir. Bu ayrim
   * bilincli — dispatcher once ne istedigini gorur, sonra sistemin onerisini.
   */
  async createFromAssignments(params: CreateTourFromAssignmentsParams): Promise<Tour> {
    if (params.assignmentIds.length === 0) {
      throw new BadRequestException({ code: 'no_assignments' });
    }

    const assignments = await this.prisma.assignment.findMany({
      where: { id: { in: params.assignmentIds } },
      select: {
        id: true,
        pickupLocationId: true,
        deliveryLocationId: true,
        pickupAddress: true,
        deliveryAddress: true,
      },
    });

    if (assignments.length !== params.assignmentIds.length) {
      throw new NotFoundException({ code: 'assignment_not_found' });
    }

    // Adresi henuz Location'a baglanmamis gorevler turlanamaz: koordinat
    // olmadan ne siralama ne mesafe hesabi mumkun. Kullaniciya hangi gorevin
    // eksik oldugu soylenir, sessizce atlanmaz.
    const unlinked = assignments.filter((a) => !a.pickupLocationId || !a.deliveryLocationId);
    if (unlinked.length > 0) {
      throw new BadRequestException({
        code: 'assignments_without_coordinates',
        assignmentIds: unlinked.map((a) => a.id),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const tour = await tx.tour.create({
        data: {
          name: params.name ?? null,
          workDate: params.workDate,
          status: TourStatus.draft,
          vehicleId: params.vehicleId ?? null,
          driverId: params.driverId ?? null,
          depotLocationId: params.depotLocationId ?? null,
          createdById: params.createdById,
        },
      });

      let sequence = 0;
      const stops: Array<{
        sequence: number;
        kind: TourStopKind;
        locationId: string;
        assignmentId: string | null;
      }> = [];

      if (params.depotLocationId) {
        sequence += 1;
        stops.push({
          sequence,
          kind: TourStopKind.depot_start,
          locationId: params.depotLocationId,
          assignmentId: null,
        });
      }

      for (const assignment of assignments) {
        sequence += 1;
        stops.push({
          sequence,
          kind: TourStopKind.pickup,
          locationId: assignment.pickupLocationId!,
          assignmentId: assignment.id,
        });
        sequence += 1;
        stops.push({
          sequence,
          kind: TourStopKind.delivery,
          locationId: assignment.deliveryLocationId!,
          assignmentId: assignment.id,
        });
      }

      if (params.depotLocationId) {
        sequence += 1;
        stops.push({
          sequence,
          kind: TourStopKind.depot_end,
          locationId: params.depotLocationId,
          assignmentId: null,
        });
      }

      await tx.tourStop.createMany({
        data: stops.map((stop) => ({
          tourId: tour.id,
          sequence: stop.sequence,
          // Kullanicinin girdigi ilk sira korunur; optimizasyon sequence'i
          // yeniden yazsa da "once neydi" gosterilebilsin.
          plannedSequence: stop.sequence,
          kind: stop.kind,
          locationId: stop.locationId,
          assignmentId: stop.assignmentId,
        })),
      });

      return tour;
    });
  }

  async findById(tourId: string) {
    const tour = await this.prisma.tour.findFirst({
      where: { id: tourId },
      include: {
        stops: {
          orderBy: { sequence: 'asc' },
          include: { location: true },
        },
      },
    });
    if (!tour) {
      throw new NotFoundException({ code: 'tour_not_found' });
    }
    return tour;
  }

  /**
   * Durak sirasini optimize eder ve turu gunceller.
   *
   * Optimizasyon reddedilebilir ve bu bir hata degildir: cikti alis-teslim
   * sirasini ihlal ediyorsa mevcut sira korunur. Yuku almadan teslime giden
   * bir plan uretmektense optimize etmemek dogrudur.
   */
  async optimizeSequence(tourId: string): Promise<OptimizeResult> {
    const tour = await this.findById(tourId);

    if (tour.status === TourStatus.optimizing) {
      throw new BadRequestException({ code: 'optimization_already_running' });
    }

    const sequenceable: SequenceableStop[] = tour.stops.map((stop) => ({
      id: stop.id,
      kind: stop.kind,
      assignmentId: stop.assignmentId,
      latitude: stop.location.latitude === null ? null : Number(stop.location.latitude),
      longitude: stop.location.longitude === null ? null : Number(stop.location.longitude),
    }));

    const issues = validateSequenceInput(sequenceable);
    if (issues.length > 0) {
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { optimizationError: issues.map((i) => i.message).join('; ') },
      });
      return { optimized: false, reason: issues[0].message };
    }

    // Depo duraklari uclara sabitlenir; Valhalla /optimized_route ilk ve son
    // noktayi sabit tutup aradakileri siralar.
    const { start, middle, end } = splitDepotStops(sequenceable);
    const ordered: SequenceableStop[] = [
      ...(start ? [start] : []),
      ...middle,
      ...(end ? [end] : []),
    ];

    const points: GeoPoint[] = ordered.map((stop) => ({
      latitude: stop.latitude!,
      longitude: stop.longitude!,
    }));

    await this.prisma.tour.update({
      where: { id: tour.id },
      data: { status: TourStatus.optimizing, optimizationError: null },
    });

    // Mevcut siranin maliyeti — "once/sonra" karsilastirmasi bunsuz anlamsiz
    // olurdu ve dispatcher optimizasyonun ne kazandirdigini goremezdi.
    // Basarisiz olursa optimizasyon yine de calisir, sadece karsilastirma
    // eksik kalir.
    const baseline = await this.valhalla.route(points, DEFAULT_TRUCK_PROFILE);
    const baselineDistanceKm = baseline.ok ? baseline.value.distanceKm : null;
    const baselineDurationMin = baseline.ok ? Math.round(baseline.value.durationMinutes) : null;

    const result = await this.valhalla.optimizedRoute(points, DEFAULT_TRUCK_PROFILE);

    if (!result.ok) {
      const reason =
        result.error === 'no_route'
          ? 'Duraklardan biri kamyonla ulasilamiyor — tur siralanamadi'
          : result.message;
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { status: TourStatus.draft, optimizationError: reason },
      });
      return { optimized: false, reason };
    }

    const reordered = applyOptimizedOrder(ordered, result.value.order);
    if (!reordered) {
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { status: TourStatus.draft, optimizationError: 'Gecersiz siralama ciktisi' },
      });
      return { optimized: false, reason: 'Gecersiz siralama ciktisi' };
    }

    if (violatesPickupBeforeDelivery(reordered)) {
      // Valhalla bu kisiti bilmez; ihlal eden ciktiyi uygulamaktansa mevcut
      // sirayi korumak dogru. Gercek cozum OR-Tools'un pickup-delivery kisiti.
      const reason = 'Onerilen sira alis-teslim kuralini ihlal ediyor, uygulanmadi';
      this.logger.warn(`Tour ${tour.id}: ${reason}`);
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { status: TourStatus.draft, optimizationError: reason },
      });
      return { optimized: false, reason };
    }

    const before = { distanceKm: baselineDistanceKm, durationMinutes: baselineDurationMin };

    await this.prisma.$transaction(async (tx) => {
      // Iki asamali yazim: @@unique([tourId, sequence]) yuzunden dogrudan
      // yeniden numaralandirma ara adimda cakisir. Once negatif gecici
      // degerler, sonra kesin sira.
      for (const { id, sequence } of toSequenceNumbers(reordered)) {
        await tx.tourStop.update({ where: { id }, data: { sequence: -sequence } });
      }
      for (const { id, sequence } of toSequenceNumbers(reordered)) {
        await tx.tourStop.update({ where: { id }, data: { sequence } });
      }

      await tx.tour.update({
        where: { id: tour.id },
        data: {
          status: TourStatus.optimized,
          optimizedAt: new Date(),
          optimizationError: null,
          // Taban yalnizca ilk optimizasyonda yazilir; sonraki calistirmalar
          // "ilk hale gore ne kazandik" olcusunu bozmamali.
          baselineDistanceKm: tour.baselineDistanceKm ?? baselineDistanceKm,
          baselineDurationMin: tour.baselineDurationMin ?? baselineDurationMin,
          plannedDistanceKm: result.value.summary.distanceKm,
          plannedDurationMin: Math.round(result.value.summary.durationMinutes),
        },
      });
    });

    return {
      optimized: true,
      before,
      after: {
        distanceKm: Number(result.value.summary.distanceKm.toFixed(2)),
        durationMinutes: Math.round(result.value.summary.durationMinutes),
      },
    };
  }
}
