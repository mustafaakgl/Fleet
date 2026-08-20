import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { TourService } from '../routing/tour.service';
import {
  evaluateCandidate,
  resolveApplyGate,
  type DispatchCheck,
  type DispatchDemand,
  type DriverFacts,
  type OverrideDeclaration,
  type VehicleFacts,
} from './core/dispatch-eligibility';

/**
 * DISPATCH ONAYI — ATOMIK UYGULAMA (Faz 17d).
 *
 * BU SERVIS HICBIR DOMAIN KAYDINI KENDISI YAZMAZ. `Assignment`
 * `AssignmentsService.create` ile, `Tour`/`TourStop` `TourService` ile
 * olusuyor. Dogrudan Prisma'ya yazsaydik ehliyet kapisi, cakisma kontrolu ve
 * takvim olayi ATLANIRDI — ve o kontrollerin var olma sebebi tam da bu.
 *
 * ATOMIKLIK: iki servis de artik DIS BIR ISLEME KATILABILIYOR (`externalTx`).
 * Boylece `Assignment` olusup `Tour` olusmamasi ya da tersi MUMKUN DEGIL —
 * ikisi ayri islemde olsaydi, tur olusturma hatasi ortada sahipsiz gorevler
 * birakirdi.
 *
 * IZOLASYON `Serializable`: cakisma kontrolu daha gevsek bir seviyede yaris
 * kosullarina acik kalirdi (`AssignmentsService` kendi islemini de bu seviyede
 * aciyor).
 *
 * CANLI VERI YENIDEN OKUNUYOR: oneri bir ANIN fotografi. Onay aninda siparis
 * iptal edilmis, revize edilmis ya da arac baska bir ise atanmis olabilir.
 * Onerideki kararlara guvenmek, eskimis bir gercege gore arac gondermek olurdu.
 */

export interface ApproveDispatchInput {
  /** Insanin sectigi aday — oneriden FARKLI olabilir. */
  vehicleId: string;
  driverId: string;
  /** Faz 15 deseni: iyimser eszamanlilik damgasi. */
  expectedUpdatedAt: string;
  /** `review_required` adaylar icin beyanlar. */
  overrides?: OverrideDeclaration[];
  /** Tekrarlanan istegi tanimak icin. */
  idempotencyKey?: string;
}

export interface ApproveDispatchResult {
  dispatchProposalId: string;
  tourId: string;
  assignmentIds: string[];
  /** `direct` ya da `manual_override`. */
  mode: 'direct' | 'manual_override';
  /** Ayni onay daha once yapilmisti ve MEVCUT sonuc donduruldu. */
  repeated: boolean;
}

/** Onay yalnizca operasyon YAZMA rollerinde. Muhasebe plan uygulayamaz. */
const APPROVAL_ROLES: readonly string[] = ['admin', 'boss', 'office'];

@Injectable()
export class DispatchApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignments: AssignmentsService,
    private readonly tours: TourService,
  ) {}

  // -------------------------------------------------------------------------
  // Onay
  // -------------------------------------------------------------------------

  async approve(
    userId: string,
    role: string | null | undefined,
    dispatchProposalId: string,
    input: ApproveDispatchInput,
  ): Promise<ApproveDispatchResult> {
    if (!APPROVAL_ROLES.includes(role ?? '')) {
      // AJAN/WORKER DA BURAYA GIREMEZ: connector'in rolu yok, `@Roles`
      // guard'i zaten dusurur; bu kontrol ikinci kapi.
      throw new ForbiddenException({ code: 'dispatch_approval_role_forbidden' });
    }

    /**
     * DAMGA BICIMI EN BASTA: bozuk bir `expectedUpdatedAt` bir CAKISMA degil,
     * bir ISTEK HATASIDIR. Sonra dogrulasaydik istemci 409 alir ve "baskasi
     * onayladi" sanirdi.
     */
    const expected = this.parseExpected(input.expectedUpdatedAt);

    const proposal = await this.load(dispatchProposalId);

    // --- TEKRARLANAN ONAY: mevcut sonucu don ---
    if (proposal.resultTourId) {
      const existingAssignments = await this.prisma.assignment.findMany({
        where: { tourStops: { some: { tourId: proposal.resultTourId } } },
        select: { id: true },
      });
      return {
        dispatchProposalId,
        tourId: proposal.resultTourId,
        assignmentIds: existingAssignments.map((row) => row.id),
        mode: proposal.appliedMode,
        repeated: true,
      };
    }

    if (proposal.generation !== 'ready') {
      throw new ConflictException({
        code: 'dispatch_proposal_not_ready',
        generation: proposal.generation,
      });
    }
    if (proposal.status !== 'open') {
      throw new ConflictException({ code: 'dispatch_proposal_already_decided', status: proposal.status });
    }

    // --- CANLI VERI: siparisler hala planlanabilir mi ---
    const orders = await this.prisma.transportOrder.findMany({
      where: { id: { in: proposal.orders.map((order) => order.transportOrderId) } },
      select: {
        id: true,
        status: true,
        currentRevision: true,
        companyId: true,
        consignments: {
          select: {
            id: true,
            cargoDescription: true,
            pickupAddress: true,
            deliveryAddress: true,
            pickupLocationId: true,
            deliveryLocationId: true,
            weightKg: true,
            volumeM3: true,
            palletCount: true,
            adrStatus: true,
            pickupWindowStart: true,
            pickupWindowEnd: true,
            deliveryWindowStart: true,
            deliveryWindowEnd: true,
          },
        },
      },
    });

    if (orders.length !== proposal.orders.length) {
      throw new ConflictException({ code: 'dispatch_order_missing' });
    }
    for (const order of orders) {
      if (order.status !== 'confirmed') {
        // TASLAK/IPTAL: plan uygulanamaz. Siparis onay bekledigimiz surede
        // iptal edilmis olabilir.
        throw new ConflictException({ code: 'dispatch_order_not_confirmed', status: order.status });
      }
      const planned = proposal.orders.find((item) => item.transportOrderId === order.id);
      if (!planned || planned.sourceRevision !== order.currentRevision) {
        // BAYAT PLAN: musteri bu arada siparisi degistirdi.
        throw new ConflictException({
          code: 'dispatch_stale_revision',
          transportOrderId: order.id,
          plannedRevision: planned?.sourceRevision ?? null,
          currentRevision: order.currentRevision,
        });
      }
    }

    /**
     * KALEMSIZ PLAN YAPISAL BIR EKSIKTIR, uygunluk sorunu degil.
     *
     * Uygunluk kapisindan ONCE bakiliyor ki istemci "arac uygun degil" gibi
     * yaniltici bir cakisma hatasi yerine gercek sebebi gorsun.
     */
    const totalConsignments = orders.reduce((sum, order) => sum + order.consignments.length, 0);
    if (totalConsignments === 0) {
      throw new BadRequestException({ code: 'dispatch_no_consignments' });
    }

    // --- CANLI VERI: secilen arac/surucu hala uygun mu ---
    const workDate = proposal.workDate;
    const gate = await this.revalidate(input.vehicleId, input.driverId, workDate, orders, {
      dispatchProposalId,
      overrides: input.overrides ?? [],
      proposalRevision: proposal.jobAttempt,
    });

    if (!gate.applicable) {
      // `blocked` HICBIR ROLLE uygulanamaz; `review_required` yalnizca gecerli
      // ve KAPSAMLI beyanla asilabilir.
      throw new ConflictException({
        code: 'dispatch_not_applicable',
        decision: gate.decision,
        blocking: gate.blocking.map((check) => check.code),
        needsData: gate.needsData.map((check) => check.code),
        needsDeclaration: gate.needsDeclaration.map((check) => check.code),
      });
    }

    // --- TEK ISLEM: Assignment + Tour + baglama + karar + gorev ---
    const result = await this.prisma.$transaction(
      async (tx) => {
        /**
         * CAS ONCE: iki eszamanli onaydan yalnizca biri devam eder.
         *
         * `updatedAt` damgasi + `status = open` + `resultTourId IS NULL`.
         * Kaybeden taraf HICBIR domain kaydi olusturmadan duser, cunku bu
         * kontrol islemin ILK adimi.
         */
        const claimed = await tx.dispatchProposal.updateMany({
          where: {
            id: dispatchProposalId,
            status: 'open',
            generation: 'ready',
            resultTourId: null,
            updatedAt: expected,
          },
          data: { status: 'approved', decidedById: userId, decidedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new ConflictException({ code: 'dispatch_approval_raced' });
        }

        // --- Gorevler: MEVCUT SERVIS, mevcut kurallar ---
        const assignmentIds: string[] = [];
        for (const order of orders) {
          for (const consignment of order.consignments) {
            const created = await this.assignments.create(
              {
                driver_id: input.driverId,
                vehicle_id: input.vehicleId,
                company_id: order.companyId,
                cargo_name: consignment.cargoDescription,
                cargo_owner: consignment.cargoDescription,
                pickup_address: consignment.pickupAddress,
                delivery_address: consignment.deliveryAddress,
                pickup_location_id: consignment.pickupLocationId ?? undefined,
                delivery_location_id: consignment.deliveryLocationId ?? undefined,
                work_date: workDate.toISOString().slice(0, 10),
              },
              userId,
              // AYNI ISLEM: gorev ve tur birlikte olusur ya da hicbiri olusmaz.
              tx,
            );
            assignmentIds.push(created.id);
          }
        }

        if (assignmentIds.length === 0) {
          // Ikinci kapi: yukaridaki kontrolden sonra buraya gelinmemeli, ama
          // gelirse SESSIZCE BOS TUR ACMIYORUZ.
          throw new BadRequestException({ code: 'dispatch_no_consignments' });
        }

        // --- Tur: MEVCUT SERVIS ---
        const tour = await this.tours.createFromAssignments(
          {
            assignmentIds,
            workDate,
            vehicleId: input.vehicleId,
            driverId: input.driverId,
            createdById: userId,
          },
          tx,
        );

        /**
         * SONUCU BAGLA — EXACTLY-ONCE VERITABANINDA.
         *
         * `resultTourId` `@unique`; ayrica `resultTourId: null` kosulu
         * tekrarlanan bir baglamayi da engelliyor.
         */
        const linked = await tx.dispatchProposal.updateMany({
          where: { id: dispatchProposalId, resultTourId: null },
          data: {
            resultTourId: tour.id,
            // CANLI DEGIL ARTIK: ayni siparis daha sonra yeniden planlanabilsin.
            activeFingerprint: null,
          },
        });
        if (linked.count === 0) {
          throw new ConflictException({ code: 'dispatch_result_already_linked' });
        }

        // --- Inceleme gorevi ---
        if (proposal.proposalId) {
          await tx.approvalTask.updateMany({
            where: { proposalId: proposal.proposalId, status: 'open' },
            data: {
              status: 'decided',
              decision: 'approved',
              decidedById: userId,
              decidedAt: new Date(),
            },
          });
        }

        // --- Beyanlar: kim neyi ustlendi ---
        for (const code of gate.acceptedOverrides) {
          const declaration = (input.overrides ?? []).find((item) => item.code === code);
          await tx.dispatchOverrideDeclaration.create({
            data: {
              dispatchProposalId,
              checkCode: code,
              driverId: input.driverId,
              vehicleId: input.vehicleId,
              workDate,
              proposalRevision: proposal.jobAttempt,
              note: declaration?.note ?? '',
              answer: declaration?.answer ?? null,
              declaredById: userId,
            },
          });
        }

        return { tourId: tour.id, assignmentIds };
      },
      // `AssignmentsService` kendi islemini de bu seviyede aciyor; katilan
      // islem daha gevsek olsaydi cakisma kontrolu zayiflardi.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.logAction({
      actorUserId: userId,
      action: 'dispatch.proposal_approved',
      entityType: 'DispatchProposal',
      entityId: dispatchProposalId,
      summary: 'Dispositionsvorschlag freigegeben',
      // ADRES, TUTAR VE AD DENETIME GIRMEZ.
      metadata: {
        tourId: result.tourId,
        assignmentCount: result.assignmentIds.length,
        orderCount: orders.length,
        mode: gate.mode,
        overrides: gate.acceptedOverrides,
      },
    });

    return {
      dispatchProposalId,
      tourId: result.tourId,
      assignmentIds: result.assignmentIds,
      mode: gate.mode,
      repeated: false,
    };
  }

  // -------------------------------------------------------------------------
  // Red
  // -------------------------------------------------------------------------

  /**
   * Oneriyi reddeder.
   *
   * HICBIR DOMAIN KAYDI OLUSMAZ. Red bir karardir, bir islem degil; burada
   * `Assignment`/`Tour` yazan tek satir yok ve olmamali.
   */
  async reject(
    userId: string,
    role: string | null | undefined,
    dispatchProposalId: string,
    reason: string,
  ): Promise<{ dispatchProposalId: string }> {
    if (!APPROVAL_ROLES.includes(role ?? '')) {
      throw new ForbiddenException({ code: 'dispatch_approval_role_forbidden' });
    }
    if (reason.trim().length < 5) {
      // SEBEPSIZ RED, neyin duzeltilecegini bilinmez kilar.
      throw new BadRequestException({ code: 'dispatch_reject_reason_required' });
    }

    const claimed = await this.prisma.dispatchProposal.updateMany({
      where: { id: dispatchProposalId, status: 'open' },
      data: {
        status: 'rejected',
        decidedById: userId,
        decidedAt: new Date(),
        rejectionReason: reason.trim().slice(0, 500),
        // Karara baglandi: ayni siparis yeniden planlanabilsin.
        activeFingerprint: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'dispatch_proposal_already_decided' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'dispatch.proposal_rejected',
      entityType: 'DispatchProposal',
      entityId: dispatchProposalId,
      summary: 'Dispositionsvorschlag abgelehnt',
      metadata: { dispatchProposalId },
    });

    return { dispatchProposalId };
  }

  // -------------------------------------------------------------------------
  // Yeniden dogrulama
  // -------------------------------------------------------------------------

  /**
   * Secilen arac/surucu icin uygunlugu ONAY ANINDA yeniden hesaplar.
   *
   * KULLANICI ADAYI DEGISTIRDIYSE de burasi calisir: onerideki kararlar o
   * adaya ait degildi. Onerinin DEGISMEZ AI ciktisi (`AutomationProposal`)
   * bu hesaptan ETKILENMEZ; degisiklik ayri bir kayit olarak duruyor.
   */
  private async revalidate(
    vehicleId: string,
    driverId: string,
    workDate: Date,
    orders: ReadonlyArray<{ consignments: ReadonlyArray<Record<string, unknown>> }>,
    context: {
      dispatchProposalId: string;
      overrides: OverrideDeclaration[];
      proposalRevision: number;
    },
  ): ReturnType<typeof resolveApplyGate> extends infer R ? Promise<R> : never {
    const start = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const [vehicle, driver, vehicleConflicts, driverConflicts, vehicleTours, driverTours, calendar] =
      await Promise.all([
        this.prisma.vehicle.findFirst({
          where: { id: vehicleId, deletedAt: null },
          select: {
            id: true,
            status: true,
            payloadCapacityKg: true,
            cargoVolumeM3: true,
            palletCapacity: true,
            adrCertified: true,
            tuvExpiryDate: true,
            insuranceExpiryDate: true,
          },
        }),
        this.prisma.driver.findFirst({
          where: { id: driverId },
          select: { id: true, status: true, licenseExpiryDate: true },
        }),
        this.prisma.assignment.count({
          where: { vehicleId, workDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        }),
        this.prisma.assignment.count({
          where: { driverId, workDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        }),
        this.prisma.tour.count({
          where: { vehicleId, workDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        }),
        this.prisma.tour.count({
          where: { driverId, workDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        }),
        this.prisma.calendarEvent.findFirst({
          where: { driverId, date: { gte: start, lt: end } },
          select: { status: true },
        }),
      ]);

    if (!vehicle || !driver) {
      // Kiraci kapsamli sorgu: baska kiracinin araci/surucusu "yok" gorunur.
      throw new NotFoundException({ code: 'dispatch_candidate_not_found' });
    }

    const demand = this.demandOf(orders.flatMap((order) => order.consignments));

    const vehicleFacts: VehicleFacts = {
      id: vehicle.id,
      status: vehicle.status,
      payloadCapacityKg: numberOrNull(vehicle.payloadCapacityKg),
      cargoVolumeM3: numberOrNull(vehicle.cargoVolumeM3),
      palletCapacity: vehicle.palletCapacity,
      adrCertified: vehicle.adrCertified,
      conflictingAssignments: vehicleConflicts,
      conflictingTours: vehicleTours,
      tuvExpiryDate: isoDate(vehicle.tuvExpiryDate),
      insuranceExpiryDate: isoDate(vehicle.insuranceExpiryDate),
    };

    const driverFacts: DriverFacts = {
      id: driver.id,
      status: driver.status,
      calendarCode: calendar?.status ?? null,
      licenseExpiresAt: isoDate(driver.licenseExpiryDate),
      conflictingAssignments: driverConflicts,
      conflictingTours: driverTours,
      // Kanonik takograf verisi yok; kontrol DAIMA `unknown` ve ancak
      // KAPSAMLI bir beyanla asilabilir.
      remainingDriveMinutes: null,
    };

    const evaluation = evaluateCandidate({
      vehicle: vehicleFacts,
      driver: driverFacts,
      demand,
      at: new Date(),
    });

    /**
     * BEYAN KAPSAMI ONAY ANINDA DA DOGRULANIYOR.
     *
     * Baska bir gune, baska bir surucuye ya da baska bir oneriye ait bir
     * beyan burada GECERSIZ. Kapsami yalnizca uretim aninda kontrol etseydik,
     * onay istegine elle eklenmis bir beyan kapiyi acardi.
     */
    return resolveApplyGate(evaluation.checks, context.overrides, {
      dispatchProposalId: context.dispatchProposalId,
      driverId,
      vehicleId,
      workDate: workDate.toISOString().slice(0, 10),
      proposalRevision: context.proposalRevision,
    }) as never;
  }

  private demandOf(consignments: ReadonlyArray<Record<string, unknown>>): DispatchDemand {
    const sumOrNull = (key: string): number | null => {
      let total = 0;
      for (const item of consignments) {
        const value = numberOrNull(item[key] as Prisma.Decimal | number | null);
        if (value === null) return null;
        total += value;
      }
      return total;
    };

    const adrValues = consignments.map((item) => item.adrStatus as string);
    return {
      totalWeightKg: sumOrNull('weightKg'),
      totalVolumeM3: sumOrNull('volumeM3'),
      totalPallets: sumOrNull('palletCount'),
      adr: adrValues.includes('yes') ? 'yes' : adrValues.includes('unknown') ? 'unknown' : 'no',
      windows: consignments.flatMap((item) => {
        const entries: DispatchDemand['windows'] = [];
        const pickupStart = item.pickupWindowStart as Date | null;
        const deliveryStart = item.deliveryWindowStart as Date | null;
        if (pickupStart) {
          entries.push({
            kind: 'pickup',
            start: pickupStart.toISOString(),
            end: (item.pickupWindowEnd as Date | null)?.toISOString() ?? null,
            timezone: 'UTC',
          });
        }
        if (deliveryStart) {
          entries.push({
            kind: 'delivery',
            start: deliveryStart.toISOString(),
            end: (item.deliveryWindowEnd as Date | null)?.toISOString() ?? null,
            timezone: 'UTC',
          });
        }
        return entries;
      }),
    };
  }

  private async load(dispatchProposalId: string) {
    const row = await this.prisma.dispatchProposal.findFirst({
      where: { id: dispatchProposalId },
      select: {
        id: true,
        status: true,
        generation: true,
        proposalId: true,
        resultTourId: true,
        jobAttempt: true,
        computedAt: true,
        orders: { select: { transportOrderId: true, sourceRevision: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'dispatch_proposal_not_found' });
    }
    return {
      ...row,
      // Plan gunu: oneri hesaplandigi gun icin kuruldu.
      workDate: new Date(
        Date.UTC(
          row.computedAt.getUTCFullYear(),
          row.computedAt.getUTCMonth(),
          row.computedAt.getUTCDate(),
        ),
      ),
      appliedMode: 'direct' as const,
    };
  }

  private parseExpected(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({ code: 'dispatch_expected_updated_at_invalid' });
    }
    return parsed;
  }
}

function numberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export type { DispatchCheck };
