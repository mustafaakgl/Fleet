import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ValhallaClient } from '../routing/valhalla.client';
import type { GeoPoint, RouteSummary } from '../routing/core/routing.types';
import { AutomationJobService } from './automation-job.service';
import {
  evaluateCandidate,
  overallStatus,
  type DispatchCheck,
  type DispatchDemand,
  type DriverFacts,
  type VehicleFacts,
} from './core/dispatch-eligibility';
import {
  activeFingerprintFor,
  buildRequestFingerprint,
  canRetryGeneration,
} from './core/dispatch-generation';
import {
  applyAgentRanking,
  buildRoutePlan,
  toTruckProfile,
  type RoutePlan,
  type ServerCandidate,
  type StopInput,
} from './core/dispatch-plan';

/**
 * DISPATCH URETIMI (Faz 17).
 *
 * BU SERVIS PLAN URETIR, PLAN UYGULAMAZ. Onay sonrasi `Assignment`/`Tour`
 * yazimi ayri bir servistedir ve MEVCUT domain servislerinden gecer.
 *
 * SORGU BUTCESI SABIT: aday sayisi ne olursa olsun arac, surucu, cakisan
 * gorev, cakisan tur ve takvim kayitlari BESER TOPLU sorguyla cekiliyor.
 * Aday basina sorgu (N+1) 50 araclik bir filoda 250 sorgu demekti ve
 * planlama ekranini kullanilamaz hale getirirdi.
 *
 * KIRACI KAPSAMI PRISMA'DAN: `this.prisma` kiraci kapsamli istemci; hicbir
 * sorguda elle `tenantId` filtresi yazilmiyor ve yazilmamali — iki farkli
 * filtreleme yolu olsaydi biri eninde sonunda unutulurdu.
 */

/** Uygunluk motoruna verilecek gunun sinirlari. */
function dayRange(workDate: string): { start: Date; end: Date } {
  const start = new Date(`${workDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException({ code: 'dispatch_invalid_work_date' });
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function toNumber(value: Prisma.Decimal | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : Number(value);
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export interface CreateDispatchProposalInput {
  transportOrderIds: string[];
  workDate: string;
}

export interface DispatchProposalCreated {
  dispatchProposalId: string;
  jobId: string | null;
  /** Ayni baglamda canli bir uretim vardi ve O donduruldu. */
  reused: boolean;
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: AutomationJobService,
    private readonly valhalla: ValhallaClient,
  ) {}

  // -------------------------------------------------------------------------
  // Uretim talebi
  // -------------------------------------------------------------------------

  /**
   * Planlama talebi acar: adaylari toplar, uygunlugu degerlendirir, rotayi
   * hesaplar ve ajan siralamasi icin bir is kuyruga koyar.
   *
   * ONERI VE IS AYNI TRANSACTION'DA: isi olmayan bir talep ya da talebi
   * olmayan bir is kalamaz. Ikisi ayri yazilsaydi, arada dusen bir surec
   * sonsuza kadar `queued` kalan bir talep birakirdi.
   *
   * TEKRARLANAN ISTEK YENI ONERI ACMAZ: `activeFingerprint` tekil oldugu icin
   * ayni baglamda ayni anda tek canli uretim olabilir. Yarisi kaybeden istek
   * hata almaz, VAR OLANI doner.
   */
  async createProposal(
    userId: string,
    input: CreateDispatchProposalInput,
  ): Promise<DispatchProposalCreated> {
    const { start, end } = dayRange(input.workDate);

    const orderIds = [...new Set(input.transportOrderIds)];
    if (orderIds.length === 0) {
      throw new BadRequestException({ code: 'dispatch_no_orders' });
    }

    // --- Siparisler: YALNIZCA `confirmed` planlanabilir ---
    const orders = await this.prisma.transportOrder.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        status: true,
        currentRevision: true,
        companyId: true,
        consignments: {
          select: {
            id: true,
            weightKg: true,
            volumeM3: true,
            palletCount: true,
            adrStatus: true,
            pickupAddress: true,
            deliveryAddress: true,
            pickupLocationId: true,
            deliveryLocationId: true,
            pickupWindowStart: true,
            pickupWindowEnd: true,
            deliveryWindowStart: true,
            deliveryWindowEnd: true,
          },
        },
      },
    });

    if (orders.length !== orderIds.length) {
      // Kiraci kapsamli sorgu: baska kiracinin siparisi "yok" gorunur.
      throw new NotFoundException({ code: 'dispatch_order_not_found' });
    }
    const notConfirmed = orders.filter((order) => order.status !== 'confirmed');
    if (notConfirmed.length > 0) {
      // TASLAK VE IPTAL PLANLANMAZ: taslak henuz ticari bir taahhut degil,
      // iptal edilmis siparis ise artik yok.
      throw new BadRequestException({
        code: 'dispatch_order_not_confirmed',
        statuses: [...new Set(notConfirmed.map((order) => order.status))],
      });
    }

    const fingerprint = buildRequestFingerprint({
      tenantId: 'scoped',
      workDate: input.workDate,
      orders: orders.map((order) => ({
        transportOrderId: order.id,
        sourceRevision: order.currentRevision,
      })),
    });

    // Canli bir uretim varsa ONU dondur — ikinci bir tane acma.
    const live = await this.prisma.dispatchProposal.findFirst({
      where: { activeFingerprint: fingerprint },
      select: { id: true, jobId: true },
    });
    if (live) {
      return { dispatchProposalId: live.id, jobId: live.jobId, reused: true };
    }

    const demand = this.buildDemand(orders.flatMap((order) => order.consignments));
    const candidates = await this.gatherCandidates(start, end, demand);
    const route = await this.computeRoute(orders.flatMap((order) => order.consignments), demand, start);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const job = await tx.automationJob.create({
          data: {
            jobType: 'dispatch.plan',
            schemaVersion: 1,
            // IS PAYLOAD'I PLAN ICERIGI TASIMAZ — yalnizca kimlik ve sayilar.
            payload: { dispatchProposalId: 'pending', candidateCount: candidates.length, orderCount: orders.length },
            requiredCapability: 'dispatch.plan@v1',
            createdById: userId,
          },
          select: { id: true },
        });

        const proposal = await tx.dispatchProposal.create({
          data: {
            generation: 'processing',
            computedAt: new Date(),
            routeStatus: route.status,
            routeFailureClass: route.failureClass,
            totalDistanceKm: route.totalDistanceKm,
            totalDurationMin: route.totalDurationMin === null ? null : Math.round(route.totalDurationMin),
            plannedStops: route.stops as unknown as Prisma.InputJsonValue,
            jobId: job.id,
            jobAttempt: 1,
            requestFingerprint: fingerprint,
            activeFingerprint: activeFingerprintFor({
              requestFingerprint: fingerprint,
              generation: 'processing',
              status: 'open',
            }),
            orders: {
              create: orders.map((order) => ({
                transportOrderId: order.id,
                sourceRevision: order.currentRevision,
              })),
            },
            candidates: {
              create: candidates.map((candidate, index) => ({
                rank: index + 1,
                vehicleId: candidate.vehicleId,
                driverId: candidate.driverId,
                overallStatus: candidate.overall,
                checks: candidate.checks as unknown as Prisma.InputJsonValue,
              })),
            },
          },
          select: { id: true },
        });

        // Payload'daki kimlik ancak oneri olustuktan sonra biliniyor; AYNI
        // transaction icinde duzeltiliyor ki is hicbir an yanlis kimlikle
        // gorunmesin.
        await tx.automationJob.update({
          where: { id: job.id },
          data: {
            payload: {
              dispatchProposalId: proposal.id,
              candidateCount: candidates.length,
              orderCount: orders.length,
            },
          },
        });

        return { dispatchProposalId: proposal.id, jobId: job.id };
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'dispatch.proposal_requested',
        entityType: 'DispatchProposal',
        entityId: created.dispatchProposalId,
        summary: 'Dispositionsvorschlag angefordert',
        // ADRES, TUTAR VE PLAKA DENETIME GIRMEZ — yalnizca sayilabilir olgular.
        metadata: {
          orderCount: orders.length,
          candidateCount: candidates.length,
          routeStatus: route.status,
          workDate: input.workDate,
        },
      });

      return { ...created, reused: false };
    } catch (error) {
      // YARIS: baska bir istek ayni baglamda uretimi bu arada baslatti.
      // Tekillik uygulamada degil VERITABANINDA; kaybeden taraf hata degil
      // VAR OLANI doner.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.dispatchProposal.findFirst({
          where: { activeFingerprint: fingerprint },
          select: { id: true, jobId: true },
        });
        if (raced) {
          return { dispatchProposalId: raced.id, jobId: raced.jobId, reused: true };
        }
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Talep -> uygunluk
  // -------------------------------------------------------------------------

  /**
   * Kalemlerden TALEBI turetir.
   *
   * TOPLAMA KURALI UC DURUMLU: bir kalemin agirligi bilinmiyorsa TOPLAM da
   * bilinmiyor olur (`null`). Eksik kalemi 0 saymak, toplami oldugundan hafif
   * gosterirdi ve kapasite kontrolu yanlis bir "sigar" uretirdi.
   *
   * ADR'DE EN KOTUSU KAZANIR: bir kalem tehlikeliyse butun sevkiyat
   * tehlikelidir; bir kalem BILINMIYORSA ve hicbiri `yes` degilse sonuc
   * `unknown` olur — "digerleri temiz, o halde temiz" DEMEK DEGIL.
   */
  private buildDemand(
    consignments: ReadonlyArray<{
      weightKg: Prisma.Decimal | null;
      volumeM3: Prisma.Decimal | null;
      palletCount: number | null;
      adrStatus: 'yes' | 'no' | 'unknown';
      pickupWindowStart: Date | null;
      pickupWindowEnd: Date | null;
      deliveryWindowStart: Date | null;
      deliveryWindowEnd: Date | null;
    }>,
  ): DispatchDemand {
    const sumOrNull = (values: Array<number | null>): number | null => {
      let total = 0;
      for (const value of values) {
        if (value === null) return null;
        total += value;
      }
      return total;
    };

    const adrValues = consignments.map((item) => item.adrStatus);
    const adr: DispatchDemand['adr'] = adrValues.includes('yes')
      ? 'yes'
      : adrValues.includes('unknown')
        ? 'unknown'
        : 'no';

    /**
     * ZAMAN DILIMI: `Consignment` penceresi `DateTime` olarak saklaniyor,
     * yani zaman dilimi ZATEN cozulmus durumda. Faz 16'da dilimsiz saat
     * reddedildigi icin buraya dilimsiz bir pencere ULASAMAZ; yine de dilim
     * alani `UTC` olarak ISARETLENIYOR ki motorun kurali bos gecmesin.
     */
    const windows = consignments.flatMap((item) => {
      const entries: DispatchDemand['windows'] = [];
      if (item.pickupWindowStart || item.pickupWindowEnd) {
        entries.push({
          kind: 'pickup',
          start: item.pickupWindowStart?.toISOString() ?? null,
          end: item.pickupWindowEnd?.toISOString() ?? null,
          timezone: 'UTC',
        });
      }
      if (item.deliveryWindowStart || item.deliveryWindowEnd) {
        entries.push({
          kind: 'delivery',
          start: item.deliveryWindowStart?.toISOString() ?? null,
          end: item.deliveryWindowEnd?.toISOString() ?? null,
          timezone: 'UTC',
        });
      }
      return entries;
    });

    return {
      totalWeightKg: sumOrNull(consignments.map((item) => toNumber(item.weightKg))),
      totalVolumeM3: sumOrNull(consignments.map((item) => toNumber(item.volumeM3))),
      totalPallets: sumOrNull(consignments.map((item) => item.palletCount)),
      adr,
      windows,
    };
  }

  /**
   * ADAYLARI TOPLAR — SABIT SAYIDA SORGU.
   *
   * Bes toplu sorgu: araclar, surucular, o gunun gorevleri, o gunun turlari
   * ve takvim kayitlari. Cakisma sayilari BELLEKTE gruplanıyor. Aday basina
   * sorgu atsaydik 50 arac x 50 surucu kombinasyonunda sorgu sayisi
   * kullanilamaz hale gelirdi.
   *
   * ESLESTIRME: her arac, o gun o araca atanmis surucuyle (varsa) eslestiriliyor;
   * arac-surucu KARTEZYEN CARPIMI URETILMIYOR — 50x50 = 2500 aday, dispatcher
   * icin bilgi degil gurultudur.
   */
  private async gatherCandidates(
    start: Date,
    end: Date,
    demand: DispatchDemand,
  ): Promise<Array<ServerCandidate & { checks: DispatchCheck[] }>> {
    const [vehicles, drivers, assignments, tours, calendar] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          currentDriverId: true,
          payloadCapacityKg: true,
          cargoVolumeM3: true,
          palletCapacity: true,
          adrCertified: true,
          tuvExpiryDate: true,
          insuranceExpiryDate: true,
          heightCm: true,
          lengthCm: true,
          widthCm: true,
          grossWeightKg: true,
        },
        take: 500,
      }),
      this.prisma.driver.findMany({
        where: { status: { not: 'terminated' } },
        select: {
          id: true,
          status: true,
          licenseExpiryDate: true,
        },
        take: 500,
      }),
      this.prisma.assignment.findMany({
        where: { workDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { vehicleId: true, driverId: true },
        take: 2_000,
      }),
      this.prisma.tour.findMany({
        where: { workDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { vehicleId: true, driverId: true },
        take: 2_000,
      }),
      this.prisma.calendarEvent.findMany({
        where: { date: { gte: start, lt: end } },
        select: { driverId: true, status: true },
        take: 2_000,
      }),
    ]);

    const count = <T extends { vehicleId?: string | null; driverId?: string | null }>(
      rows: T[],
      key: 'vehicleId' | 'driverId',
    ): Map<string, number> => {
      const result = new Map<string, number>();
      for (const row of rows) {
        const id = row[key];
        if (!id) continue;
        result.set(id, (result.get(id) ?? 0) + 1);
      }
      return result;
    };

    const vehicleAssignments = count(assignments, 'vehicleId');
    const vehicleTours = count(tours, 'vehicleId');
    const driverAssignments = count(assignments, 'driverId');
    const driverTours = count(tours, 'driverId');
    const calendarByDriver = new Map(calendar.map((row) => [row.driverId, row.status as string]));
    const driversById = new Map(drivers.map((driver) => [driver.id, driver]));

    const at = new Date();
    const result: Array<ServerCandidate & { checks: DispatchCheck[] }> = [];

    for (const [index, vehicle] of vehicles.entries()) {
      // ARACA BAGLI SURUCU: kartezyen carpim yerine gercek esleme.
      const driver = vehicle.currentDriverId ? driversById.get(vehicle.currentDriverId) : undefined;
      if (!driver) continue;

      const vehicleFacts: VehicleFacts = {
        id: vehicle.id,
        status: vehicle.status,
        payloadCapacityKg: toNumber(vehicle.payloadCapacityKg),
        cargoVolumeM3: toNumber(vehicle.cargoVolumeM3),
        palletCapacity: vehicle.palletCapacity,
        adrCertified: vehicle.adrCertified,
        conflictingAssignments: vehicleAssignments.get(vehicle.id) ?? 0,
        conflictingTours: vehicleTours.get(vehicle.id) ?? 0,
        tuvExpiryDate: toIsoDate(vehicle.tuvExpiryDate),
        insuranceExpiryDate: toIsoDate(vehicle.insuranceExpiryDate),
      };

      const driverFacts: DriverFacts = {
        id: driver.id,
        status: driver.status,
        calendarCode: calendarByDriver.get(driver.id) ?? null,
        licenseExpiresAt: toIsoDate(driver.licenseExpiryDate),
        conflictingAssignments: driverAssignments.get(driver.id) ?? 0,
        conflictingTours: driverTours.get(driver.id) ?? 0,
        /**
         * TAKOGRAF: repoda kanonik "kalan surus suresi" alani YOK.
         * `null` gecmek, motorun kontrolu DAIMA `unknown` isaretlemesini
         * saglar — bir sure UYDURMAK yerine dispatcher'a "dogrulanamadi"
         * gosteriliyor.
         */
        remainingDriveMinutes: null,
      };

      const evaluation = evaluateCandidate({
        vehicle: vehicleFacts,
        driver: driverFacts,
        demand,
        at,
      });

      result.push({
        ref: `c${index + 1}`,
        vehicleId: vehicle.id,
        driverId: driver.id,
        overall: evaluation.overall,
        checks: evaluation.checks,
      });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Rota
  // -------------------------------------------------------------------------

  /**
   * Duraklardan rota ve ETA uretir.
   *
   * VALHALLA BASARISIZSA PLAN URETILMEYE DEVAM EDER — `degraded` isaretiyle.
   * Rota servisinin dusmesi butun dispatch akisini durdursaydi, tek bir dis
   * bagimlilik urunun tamamini kullanilamaz hale getirirdi. Ama tahmin GERCEK
   * bir ETA gibi sunulmaz; durum acikca tasiniyor.
   */
  private async computeRoute(
    consignments: ReadonlyArray<{
      pickupLocationId: string | null;
      deliveryLocationId: string | null;
    }>,
    demand: DispatchDemand,
    startAt: Date,
  ): Promise<RoutePlan> {
    const locationIds = [
      ...new Set(
        consignments.flatMap((item) =>
          [item.pickupLocationId, item.deliveryLocationId].filter((id): id is string => !!id),
        ),
      ),
    ];

    if (locationIds.length < 2) {
      // Koordinati olmayan adreslerle rota hesaplanamaz; ETA UYDURULMAZ.
      return {
        status: 'failed',
        failureClass: 'missing_locations',
        totalDistanceKm: null,
        totalDurationMin: null,
        stops: [],
      };
    }

    const locations = await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, latitude: true, longitude: true },
    });
    const pointById = new Map(
      locations.map((row) => [
        row.id,
        { latitude: toNumber(row.latitude) ?? 0, longitude: toNumber(row.longitude) ?? 0 } as GeoPoint,
      ]),
    );

    const stops: StopInput[] = [];
    for (const item of consignments) {
      if (item.pickupLocationId && pointById.has(item.pickupLocationId)) {
        stops.push({
          kind: 'pickup',
          locationId: item.pickupLocationId,
          point: pointById.get(item.pickupLocationId)!,
          serviceMinutes: 30,
        });
      }
      if (item.deliveryLocationId && pointById.has(item.deliveryLocationId)) {
        stops.push({
          kind: 'delivery',
          locationId: item.deliveryLocationId,
          point: pointById.get(item.deliveryLocationId)!,
          serviceMinutes: 30,
        });
      }
    }

    if (stops.length < 2) {
      return {
        status: 'failed',
        failureClass: 'missing_coordinates',
        totalDistanceKm: null,
        totalDurationMin: null,
        stops: [],
      };
    }

    const profile = toTruckProfile(
      { heightCm: null, lengthCm: null, widthCm: null, grossWeightKg: null },
      demand.adr === 'yes',
    );

    let summary: RouteSummary | null = null;
    let failureClass: string | null = null;
    try {
      const result = await this.valhalla.route(
        stops.map((stop) => stop.point),
        profile,
      );
      if (result.ok) {
        summary = result.value;
      } else {
        // HATA SINIFI tasiniyor, saglayici mesaji DEGIL.
        failureClass = result.error;
      }
    } catch {
      // Beklenmedik istisna da degradation'a duser; dispatch akisi durmaz.
      failureClass = 'unavailable';
    }

    return buildRoutePlan({ stops, summary, failureClass, startAt });
  }

  // -------------------------------------------------------------------------
  // Yeniden calistirma
  // -------------------------------------------------------------------------

  /**
   * Basarisiz ya da suresi dolmus bir uretimi yeniden calistirir.
   *
   * `ready` ve `processing` YENIDEN CALISTIRILMAZ (bkz. canRetryGeneration):
   * calisan bir worker olabilir ve ikinci is, ayni oneriye iki cikti yazma
   * yarisi baslatirdi.
   *
   * `jobAttempt` ARTIYOR: eski denemenin gec gelen cevabi CAS kosulunu
   * gecemez ve sessizce yok sayilir.
   */
  async retryGeneration(userId: string, dispatchProposalId: string): Promise<{ jobId: string }> {
    const existing = await this.prisma.dispatchProposal.findFirst({
      where: { id: dispatchProposalId },
      select: { id: true, generation: true, jobAttempt: true, requestFingerprint: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'dispatch_proposal_not_found' });
    }
    if (!canRetryGeneration(existing.generation)) {
      throw new ConflictException({
        code: 'dispatch_retry_not_allowed',
        generation: existing.generation,
      });
    }

    const nextAttempt = existing.jobAttempt + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      const job = await tx.automationJob.create({
        data: {
          jobType: 'dispatch.plan',
          schemaVersion: 1,
          payload: { dispatchProposalId, candidateCount: 0, orderCount: 0 },
          requiredCapability: 'dispatch.plan@v1',
          createdById: userId,
        },
        select: { id: true },
      });

      const claimed = await tx.dispatchProposal.updateMany({
        // KOSULLU: bu arada baska bir istek yeniden calistirdiysa yaris
        // kaybedilir ve ikinci bir is baglanmaz.
        where: { id: dispatchProposalId, generation: existing.generation, jobAttempt: existing.jobAttempt },
        data: {
          generation: 'processing',
          jobId: job.id,
          jobAttempt: nextAttempt,
          activeFingerprint: existing.requestFingerprint,
          routeFailureClass: null,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({ code: 'dispatch_retry_raced' });
      }
      return { jobId: job.id };
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'dispatch.generation_retried',
      entityType: 'DispatchProposal',
      entityId: dispatchProposalId,
      summary: 'Dispositionsvorschlag erneut berechnet',
      metadata: { attempt: nextAttempt, previousGeneration: existing.generation },
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // Worker ciktisi -> oneri baglama
  // -------------------------------------------------------------------------

  /**
   * Ajanin siralamasini uygular ve `AutomationProposal`i baglar.
   *
   * BES KOSULLU CAS: dogru is, dogru deneme, `processing`, `proposalId IS
   * NULL` ve guncel `sourceRevision`. Kosullardan biri tutmazsa IKINCI BIR
   * BAGLANTI OLUSMAZ ve cevap sessizce yok sayilir — hata firlatmak,
   * worker'i sonsuz yeniden denemeye sokardi.
   */
  async linkProposal(input: {
    dispatchProposalId: string;
    jobId: string;
    attempt: number;
    automationProposalId: string;
    rankings: Array<{ candidateRef: string; rank: number; rationaleKey: string }>;
  }): Promise<{ linked: boolean; reason?: string }> {
    const stored = await this.prisma.dispatchProposal.findFirst({
      where: { id: input.dispatchProposalId },
      select: {
        id: true,
        jobId: true,
        jobAttempt: true,
        generation: true,
        proposalId: true,
        requestFingerprint: true,
        orders: { select: { transportOrderId: true, sourceRevision: true } },
        candidates: { select: { id: true, rank: true, vehicleId: true, driverId: true, overallStatus: true } },
      },
    });
    if (!stored) return { linked: false, reason: 'not_found' };

    const currentOrders = await this.prisma.transportOrder.findMany({
      where: { id: { in: stored.orders.map((order) => order.transportOrderId) } },
      select: { id: true, currentRevision: true },
    });

    const { evaluateCompletion } = await import('./core/dispatch-generation');
    const decision = evaluateCompletion(
      {
        jobId: stored.jobId,
        jobAttempt: stored.jobAttempt,
        generation: stored.generation,
        proposalId: stored.proposalId,
        orders: stored.orders,
      },
      {
        dispatchProposalId: input.dispatchProposalId,
        jobId: input.jobId,
        attempt: input.attempt,
        currentRevisions: currentOrders.map((order) => ({
          transportOrderId: order.id,
          currentRevision: order.currentRevision,
        })),
      },
    );

    if (!decision.accept) {
      if (decision.reason === 'stale_revision') {
        // SIPARIS DEGISTI: oneri SILINMEZ, `superseded` isaretlenir ve aktif
        // parmak izi birakilir ki yeni bir plan yapilabilsin.
        await this.prisma.dispatchProposal.updateMany({
          where: { id: input.dispatchProposalId, generation: 'processing' },
          data: { generation: 'failed', status: 'superseded', activeFingerprint: null },
        });
      }
      return { linked: false, reason: decision.reason };
    }

    // Siralamayi uygula — tanimsiz referans HATA verir ve is basarisiz olur.
    const ranked = applyAgentRanking(
      stored.candidates.map((candidate, index) => ({
        ref: `c${index + 1}`,
        vehicleId: candidate.vehicleId ?? '',
        driverId: candidate.driverId ?? '',
        overall: candidate.overallStatus,
      })),
      input.rankings,
    );

    const claimed = await this.prisma.dispatchProposal.updateMany({
      where: {
        id: input.dispatchProposalId,
        jobId: input.jobId,
        jobAttempt: input.attempt,
        generation: 'processing',
        // BU KOSUL OLMADAN gec gelen ikinci cevap var olan baglantiyi EZERDI.
        proposalId: null,
      },
      data: {
        proposalId: input.automationProposalId,
        generation: 'ready',
        activeFingerprint: activeFingerprintFor({
          requestFingerprint: stored.requestFingerprint,
          generation: 'ready',
          status: 'open',
        }),
      },
    });

    if (claimed.count === 0) {
      // YARISI KAYBETTIK: baska bir cevap once baglandi.
      return { linked: false, reason: 'already_linked' };
    }

    // Sirayi kaydet. Adaylarin KENDISI degismiyor — yalnizca sunucunun
    // belirledigi nihai sira yaziliyor.
    for (const candidate of ranked) {
      const row = stored.candidates.find(
        (item) => item.vehicleId === candidate.vehicleId && item.driverId === candidate.driverId,
      );
      if (!row) continue;
      await this.prisma.dispatchCandidate.updateMany({
        where: { id: row.id },
        data: { rank: candidate.position },
      });
    }

    return { linked: true };
  }

  /** Uretimi basarisiz isaretler — worker hata bildirdiginde. */
  async markFailed(dispatchProposalId: string, failureClass: string): Promise<void> {
    await this.prisma.dispatchProposal.updateMany({
      where: { id: dispatchProposalId, generation: 'processing' },
      data: {
        generation: 'failed',
        routeFailureClass: failureClass.slice(0, 80),
        // AKTIF PARMAK IZI BIRAKILIYOR: basarisiz uretim yeniden denenebilmeli.
        activeFingerprint: null,
      },
    });
  }

  /** Adaylarin genel durumu — arayuzun ozet gostergesi. */
  static summarize(checks: DispatchCheck[]): ReturnType<typeof overallStatus> {
    return overallStatus(checks);
  }
}
