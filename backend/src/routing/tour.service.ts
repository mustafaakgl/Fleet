import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Location, type Tour, TourStatus, TourStopKind, TruckAccessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyOptimizedOrder,
  splitDepotStops,
  toSequenceNumbers,
  validateSequenceInput,
  violatesPickupBeforeDelivery,
  type SequenceableStop,
} from './core/tour-sequence.util';
import { computeTourSchedule, type EtaStopInput } from './core/tour-eta.util';
import { DEFAULT_TRUCK_PROFILE, type GeoPoint, type RouteLeg } from './core/routing.types';
import { RoutingService } from './routing.service';
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

/** Serbest tur kurulumunda tek bir durak girdisi. */
export interface TourStopInput {
  /** Mevcut bir Location; tenant kapsamli istemciyle DOGRULANIR */
  locationId?: string | null;
  /** Ya da ham adres metni — Location'a cozumlenir, ayni adres tekrar geocode edilmez */
  address?: string | null;
  label?: string | null;
  serviceMinutes?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

export interface CreateTourFromStopsParams {
  workDate: Date;
  /** ETA'nin dayanagi; verilmezse bacak sureleri hesaplanir, saat uretilmez */
  plannedStartAt?: Date | null;
  name?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  /** Turun basladigi nokta. Serbest: depo olmak zorunda degil. */
  start: TourStopInput;
  /** Baslangica geri donulsun mu; `end` verilmisse yok sayilir */
  returnToStart?: boolean;
  /** Baslangictan farkli bir bitis noktasi */
  end?: TourStopInput | null;
  /** Aradaki duraklar; sira kullanicinin girdigi siradir, optimizasyon ayri adim */
  stops: TourStopInput[];
  createdById: string;
}

/**
 * Optimizasyonun neden uygulanmadigi.
 *
 * Kod donuluyor, metin degil: sebep kullaniciya kendi dilinde gosterilmeli ve
 * sunucunun dili arayuzun dili degil. Serbest metin donmek Almanca bir ekranda
 * Turkce uyari cikarmisti.
 */
export type OptimizeSkipReason =
  | 'pickup_before_delivery_violated'
  | 'stop_not_reachable'
  | 'invalid_order'
  | 'invalid_input'
  | 'engine_unavailable';

export interface OptimizeResult {
  optimized: boolean;
  reasonCode?: OptimizeSkipReason;
  /** Tanilama icin ham mesaj; arayuz reasonCode kullanmali */
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
    private readonly routing: RoutingService,
  ) {}

  /**
   * Bir durak girdisini Location'a cevirir.
   *
   * `locationId` verildiyse TENANT KAPSAMLI istemciyle dogrulanir. Dogrulama
   * sart: kapsamsiz yazsaydik baska bir kiracinin Location'ina isaret eden
   * TourStop uretmek mumkun olurdu ve bu sessizce basarili olurdu.
   */
  private async resolveStopLocation(input: TourStopInput, position: string): Promise<Location> {
    if (input.locationId) {
      const existing = await this.prisma.location.findFirst({ where: { id: input.locationId } });
      if (!existing) {
        throw new NotFoundException({
          code: 'location_not_found',
          position,
          locationId: input.locationId,
        });
      }
      return existing;
    }

    const address = input.address?.trim();
    if (!address) {
      throw new BadRequestException({ code: 'stop_without_location', position });
    }

    const resolved = await this.routing.resolveLocation({
      rawAddress: address,
      label: input.label ?? null,
    });
    if (!resolved) {
      throw new BadRequestException({ code: 'address_not_resolvable', position, address });
    }
    return resolved;
  }

  /**
   * Serbest duraklardan tur kurar — gorev gerekmez.
   *
   * Adres cozumleme TRANSACTION DISINDA yapilir: geocoding ag cagrisi ve
   * kamyon erisim probu iceriyor, transaction icinde saniyelerce kilit tutar
   * (bkz. docs/route-optimization-plan.md, Faz 1 adim 4).
   *
   * Koordinati olmayan veya kamyona kapali durak BURADA reddedilir,
   * optimizasyonda degil: Valhalla tek bir kapali durak yuzunden tum turu
   * opak bir 400 ile cokertiyor ve hangi duragin suclu oldugu anlasilmiyor.
   */
  async createFromStops(params: CreateTourFromStopsParams): Promise<Tour> {
    if (params.stops.length === 0) {
      throw new BadRequestException({ code: 'no_stops' });
    }

    const startLocation = await this.resolveStopLocation(params.start, 'start');
    const middleLocations: Location[] = [];
    for (const [index, stop] of params.stops.entries()) {
      middleLocations.push(await this.resolveStopLocation(stop, `stop_${index}`));
    }

    let endLocation: Location | null = null;
    if (params.end) {
      endLocation = await this.resolveStopLocation(params.end, 'end');
    } else if (params.returnToStart) {
      endLocation = startLocation;
    }

    const involved = [startLocation, ...middleLocations, ...(endLocation ? [endLocation] : [])];

    const withoutCoordinates = involved.filter(
      (location) => location.latitude === null || location.longitude === null,
    );
    if (withoutCoordinates.length > 0) {
      throw new BadRequestException({
        code: 'stops_without_coordinates',
        addresses: [...new Set(withoutCoordinates.map((location) => location.rawAddress))],
      });
    }

    const unreachable = involved.filter(
      (location) => location.truckAccess === TruckAccessStatus.unreachable,
    );
    if (unreachable.length > 0) {
      throw new BadRequestException({
        code: 'stops_not_reachable',
        addresses: [...new Set(unreachable.map((location) => location.rawAddress))],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const tour = await tx.tour.create({
        data: {
          name: params.name ?? null,
          workDate: params.workDate,
          plannedStartAt: params.plannedStartAt ?? null,
          status: TourStatus.draft,
          vehicleId: params.vehicleId ?? null,
          driverId: params.driverId ?? null,
          // Baslangic noktasi depo olmak zorunda degil, ama turun sabit ucu
          // odur; rapor ve harita bu alani kullaniyor.
          depotLocationId: startLocation.id,
          createdById: params.createdById,
        },
      });

      const rows: Array<{
        sequence: number;
        kind: TourStopKind;
        locationId: string;
        serviceMinutes: number;
        windowStart: string | null;
        windowEnd: string | null;
      }> = [];

      rows.push({
        sequence: 1,
        kind: TourStopKind.depot_start,
        locationId: startLocation.id,
        serviceMinutes: Math.max(0, params.start.serviceMinutes ?? 0),
        windowStart: params.start.windowStart ?? null,
        windowEnd: params.start.windowEnd ?? null,
      });

      middleLocations.forEach((location, index) => {
        const input = params.stops[index];
        rows.push({
          sequence: rows.length + 1,
          kind: TourStopKind.waypoint,
          locationId: location.id,
          serviceMinutes: Math.max(0, input.serviceMinutes ?? 0),
          windowStart: input.windowStart ?? null,
          windowEnd: input.windowEnd ?? null,
        });
      });

      if (endLocation) {
        const input = params.end ?? params.start;
        rows.push({
          sequence: rows.length + 1,
          kind: TourStopKind.depot_end,
          locationId: endLocation.id,
          serviceMinutes: Math.max(0, input.serviceMinutes ?? 0),
          windowStart: input.windowStart ?? null,
          windowEnd: input.windowEnd ?? null,
        });
      }

      await tx.tourStop.createMany({
        data: rows.map((row) => ({
          tourId: tour.id,
          sequence: row.sequence,
          plannedSequence: row.sequence,
          kind: row.kind,
          locationId: row.locationId,
          serviceMinutes: row.serviceMinutes,
          windowStart: row.windowStart,
          windowEnd: row.windowEnd,
        })),
      });

      return tour;
    });
  }

  /**
   * Secilen gorevlerden bir tur olusturur.
   *
   * Her gorev iki durak uretir: alis ve teslim. Sira once kullanicinin verdigi
   * gorev sirasidir; optimizasyon ayri bir adim olarak calisir. Bu ayrim
   * bilincli — dispatcher once ne istedigini gorur, sonra sistemin onerisini.
   */

  /**
   * DIS TRANSACTION VARSA ONA KATIL, yoksa kendi islemini ac.
   *
   * Prisma IC ICE `$transaction` DESTEKLEMEZ: dis bir islem surerken ikincisini
   * acmak ya kilitlenir ya da sessizce AYRI bir baglantida calisir — ikincisi
   * daha tehlikeli, cunku dis islem geri alindiginda ic yazim KALIR.
   *
   * Bu yardimci o secimi TEK YERDE yapiyor. Govde degismiyor, dolayisiyla
   * dogrulama mantigi KOPYALANMIYOR: cagiran ister tek basina ister daha genis
   * bir islemin parcasi olarak calissin, AYNI kontrollerden geciyor.
   */
  private runInTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    body: (client: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    // IZOLASYON SEVIYESI KORUNUYOR: kendi islemimizi acarken cagiranin
    // istedigi seviye aynen geciyor. Dis bir isleme KATILIRKEN seviye o
    // islemin seviyesidir — bu yuzden dispatch onayi kendi islemini
    // `Serializable` aciyor; daha gevsek bir seviyede cakisma kontrolu
    // yaris kosullarina acik kalirdi.
    return tx ? body(tx) : this.prisma.$transaction(body, options);
  }

  /**
   * Gorevlerden tur olusturur.
   *
   * `externalTx`: verilirse yazim DIS islemin parcasi olur — dispatch onayinda
   * `Assignment` ve `Tour` atomik olsun diye.
   */
  async createFromAssignments(
    params: CreateTourFromAssignmentsParams,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Tour> {
    if (params.assignmentIds.length === 0) {
      throw new BadRequestException({ code: 'no_assignments' });
    }

    /**
     * OKUMA DA DIS ISLEMDEN (Faz 17g duzeltmesi).
     *
     * Bu sorgu `this.prisma` uzerinden yapiliyordu; yani dis islem varken
     * BASKA BIR BAGLANTIDAN okuyordu. Dispatch onayinda `Assignment` kayitlari
     * TAM DA O ISLEMIN icinde olusuyor ve henuz commit edilmemis olduklari
     * icin disaridan GORUNMUYORLARDI — sonuc, her onayin
     * `assignment_not_found` ile dusmesi. Yazimi dis isleme katip okumayi
     * disarida birakmak, atomikligi yarim uygulamakti.
     */
    const reader = externalTx ?? this.prisma;
    const assignments = await reader.assignment.findMany({
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

    return this.runInTransaction(externalTx, async (tx) => {
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
      return { optimized: false, reasonCode: 'invalid_input', reason: issues[0].message };
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
      const reasonCode: OptimizeSkipReason =
        result.error === 'no_route' ? 'stop_not_reachable' : 'engine_unavailable';
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { status: TourStatus.draft, optimizationError: reasonCode },
      });
      return { optimized: false, reasonCode, reason: result.message };
    }

    const reordered = applyOptimizedOrder(ordered, result.value.order);
    if (!reordered) {
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { status: TourStatus.draft, optimizationError: 'invalid_order' },
      });
      return { optimized: false, reasonCode: 'invalid_order', reason: 'invalid optimizer order' };
    }

    if (violatesPickupBeforeDelivery(reordered)) {
      // Valhalla bu kisiti bilmez; ihlal eden ciktiyi uygulamaktansa mevcut
      // sirayi korumak dogru. Gercek cozum OR-Tools'un pickup-delivery kisiti.
      this.logger.warn(`Tour ${tour.id}: optimizer order violates pickup-before-delivery`);
      await this.prisma.tour.update({
        where: { id: tour.id },
        data: { status: TourStatus.draft, optimizationError: 'pickup_before_delivery_violated' },
      });
      return {
        optimized: false,
        reasonCode: 'pickup_before_delivery_violated',
        reason: 'optimizer order violates pickup-before-delivery',
      };
    }

    const before = { distanceKm: baselineDistanceKm, durationMinutes: baselineDurationMin };

    // Bacaklar ziyaret sirasinda gelir: legs[i], reordered[i] -> reordered[i+1]
    // bacagidir. Ilk duragin gelis bacagi yoktur.
    const legs = result.value.summary.legs;
    const legsUsable = legs.length === reordered.length - 1;
    if (!legsUsable && legs.length > 0) {
      this.logger.warn(
        `Tour ${tour.id}: leg count ${legs.length} does not match ${reordered.length} stops — leg detail skipped`,
      );
    }

    const serviceMinutesByStop = new Map(
      tour.stops.map((stop) => [stop.id, stop.serviceMinutes ?? 0]),
    );

    const legForStop = (index: number): RouteLeg | null =>
      legsUsable && index > 0 ? (legs[index - 1] ?? null) : null;

    const etaInput: EtaStopInput[] = reordered.map((stop, index) => {
      const leg = legForStop(index);
      return {
        id: stop.id,
        serviceMinutes: serviceMinutesByStop.get(stop.id) ?? 0,
        // Kaydedilen tamsayi degerle ayni sureyi kullaniyoruz; aksi halde
        // ekranda gosterilen bacak suresi ile varis saati birbirini tutmaz.
        legDurationMin: leg ? Math.round(leg.durationMinutes) : null,
      };
    });

    const schedule = computeTourSchedule(tour.plannedStartAt, etaInput);
    const scheduleByStop = new Map(schedule.stops.map((entry) => [entry.id, entry]));

    await this.prisma.$transaction(async (tx) => {
      // Iki asamali yazim: @@unique([tourId, sequence]) yuzunden dogrudan
      // yeniden numaralandirma ara adimda cakisir. Once negatif gecici
      // degerler, sonra kesin sira.
      for (const { id, sequence } of toSequenceNumbers(reordered)) {
        await tx.tourStop.update({ where: { id }, data: { sequence: -sequence } });
      }

      for (const [index, { id, sequence }] of toSequenceNumbers(reordered).entries()) {
        const leg = legForStop(index);
        const timing = scheduleByStop.get(id);
        await tx.tourStop.update({
          where: { id },
          data: {
            sequence,
            legDistanceKm: leg ? leg.distanceKm : null,
            legDurationMin: leg ? Math.round(leg.durationMinutes) : null,
            legShape: leg ? leg.shape : null,
            plannedArrivalAt: timing?.plannedArrivalAt ?? null,
            plannedDepartureAt: timing?.plannedDepartureAt ?? null,
          },
        });
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
          plannedEndAt: schedule.endAt,
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
