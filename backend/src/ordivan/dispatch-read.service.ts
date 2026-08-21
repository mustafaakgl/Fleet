import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DispatchCheckStatus,
  DispatchProposalGeneration,
  DispatchProposalStatus,
  DispatchRouteStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decisionOf, type DispatchCheck, type DispatchDecision } from './core/dispatch-eligibility';
import {
  canSeeDispatchFinancials,
  maskDispatchFinancials,
  maskEvidenceRecord,
  maskFreeText,
  maskReasonKey,
} from './core/dispatch-field-security';

/**
 * DISPATCH OKUMA VE PROJEKSIYON (Faz 17f).
 *
 * HAM PRISMA NESNESI HICBIR ZAMAN DONMEZ. Her uc, asagida ACIKCA TIPLENMIS
 * bir govde uretiyor. `select` ile "yeterince dar" bir sorgu yazmak tek
 * basina yetmez: birisi ileride `select`e bir alan eklediginde o alan
 * SESSIZCE istemciye cikardi. Acik projeksiyonda ayni degisiklik derleme
 * hatasi ya da gorunur bir kod degisikligi olur.
 *
 * FINANS MASKESI IKI KATMANLI:
 *   1. Projeksiyon kurulurken alan alan (asagida `financialsVisible`).
 *   2. Cikista `maskDispatchFinancials` ile ad bazli derin tarama.
 * Ikincisi birincisinin unuttugunu yakalar; birincisi ikincisinin
 * yakalayamayacagi yapisal alanlari (ornegin `orders[].contractedRevenue`)
 * kesin olarak kaldirir.
 *
 * KIRACI KAPSAMI PRISMA'DAN: hicbir sorguda elle `tenantId` filtresi YOK ve
 * olmamali. Baska kiracinin onerisi bu yuzden "yok" gorunur — 403 ile 404
 * arasindaki fark, kaydin VARLIGINI ele verirdi.
 */

// ---------------------------------------------------------------------------
// Yanit sozlesmesi — ACIK VE TIPLI
// ---------------------------------------------------------------------------

export interface DispatchCheckView {
  code: string;
  status: DispatchCheckStatus;
  reasonKey: string;
  evidence?: Record<string, string | number | boolean | null>;
  /** `unknown` kontrolun beyanla asilabilirligi. */
  overridable: boolean;
}

export interface DispatchOrderView {
  transportOrderId: string;
  orderNumber: string;
  status: string;
  companyId: string;
  companyName: string | null;
  /** Onerinin dayandigi revizyon. */
  sourceRevision: number;
  /** Siparisin GUNCEL revizyonu. */
  currentRevision: number;
  /** Ikisi farkliysa plan uygulanamaz. */
  stale: boolean;
  consignmentCount: number;
  /** --- Finansal: yalnizca finans rollerinde dolu --- */
  currency: string | null;
  contractedRevenue: number | null;
  billingMode: string | null;
}

export interface DispatchPlannedStopView {
  sequence: number;
  kind: string;
  locationId: string | null;
  etaAt: string | null;
  /**
   * KONUM — HARITA ICIN (Faz 17g).
   *
   * Koordinat `Location` kaydindan cozuluyor, `plannedStops` JSON'undan
   * DEGIL: JSON bir anin fotografi ve koordinat sonradan duzeltilmis
   * olabilir. Geokodlanmamis konumda `null` kaliyor ve harita o duragi
   * CIZMIYOR — 0,0'a bir isaret koymak, Gine Korfezi'nde bir teslimat
   * gostermek olurdu.
   */
  latitude: number | null;
  longitude: number | null;
  /** Insan tarafindan okunabilir konum adi. Ham depolama yolu DEGIL. */
  locationLabel: string | null;
}

export interface DispatchRouteView {
  status: DispatchRouteStatus;
  /** Teknik hata SINIFI — saglayici mesaji DEGIL. */
  failureClass: string | null;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  plannedStops: DispatchPlannedStopView[];
}

/**
 * AJANIN CIKTISI — YENIDEN INSA EDILMIS.
 *
 * `AutomationProposal.payload` HAM HALIYLE DONMUYOR. Bugunku sozlesme kapali
 * ve referans tabanli, ama surum artabilir ve o gun eklenen bir alan bu uctan
 * sessizce disari cikardi. Burada yalnizca BILINEN alanlar okunuyor.
 */
export interface DispatchAgentView {
  proposalType: string;
  schemaVersion: number;
  rankedCandidates: Array<{ candidateRef: string; rank: number; rationaleKey: string }>;
  consolidationRefs: string[];
  stopOrderRefs: string[];
}

export interface DispatchProposalListRow {
  id: string;
  status: DispatchProposalStatus;
  generation: DispatchProposalGeneration;
  workDate: string;
  computedAt: string;
  orderCount: number;
  candidateCount: number;
  routeStatus: DispatchRouteStatus;
  resultTourId: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** `expectedUpdatedAt` icin gereken iyimser eszamanlilik damgasi. */
  updatedAt: string;
}

export interface DispatchProposalDetail extends DispatchProposalListRow {
  jobAttempt: number;
  route: DispatchRouteView;
  orders: DispatchOrderView[];
  agent: DispatchAgentView | null;
  decidedById: string | null;
  rejectionReason: string | null;
  decisionNote: string | null;
  /** Finans rolu olmayan kullaniciya donen isaret. */
  financialFieldsMasked: boolean;
}

export interface DispatchCandidateView {
  id: string;
  rank: number;
  vehicleId: string | null;
  vehiclePlate: string | null;
  driverId: string | null;
  driverName: string | null;
  overallStatus: DispatchCheckStatus;
  decision: DispatchDecision;
  selected: boolean;
  checks: DispatchCheckView[];
}

export interface DispatchOverrideView {
  id: string;
  checkCode: string;
  vehicleId: string | null;
  driverId: string | null;
  workDate: string;
  proposalRevision: number;
  answer: string | null;
  note: string;
  declaredById: string | null;
  declaredAt: string;
}

export interface DispatchTourStopView {
  sequence: number;
  kind: string;
  status: string;
  locationId: string | null;
  plannedArrivalAt: string | null;
}

export interface DispatchTourView {
  tourId: string;
  status: string;
  workDate: string;
  vehicleId: string | null;
  driverId: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedDistanceKm: number | null;
  plannedDurationMin: number | null;
  /** Finansal: yalnizca finans rollerinde dolu. */
  plannedTollCents: number | null;
  stops: DispatchTourStopView[];
  assignmentIds: string[];
}

export interface Paginated<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListDispatchQuery {
  status?: DispatchProposalStatus;
  generation?: DispatchProposalGeneration;
  workDateFrom?: string;
  workDateTo?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Plan gunu KAYITTAN — `computedAt`ten TURETILMIYOR (Faz 17g). */
function workDateOf(workDate: Date): string {
  return workDate.toISOString().slice(0, 10);
}

@Injectable()
export class DispatchReadService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Kuyruk
  // -------------------------------------------------------------------------

  async list(query: ListDispatchQuery, role: string | null | undefined): Promise<Paginated<DispatchProposalListRow>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const where: Prisma.DispatchProposalWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.generation) where.generation = query.generation;
    if (query.workDateFrom || query.workDateTo) {
      where.computedAt = {
        ...(query.workDateFrom ? { gte: new Date(`${query.workDateFrom}T00:00:00.000Z`) } : {}),
        ...(query.workDateTo ? { lt: new Date(`${query.workDateTo}T00:00:00.000Z`) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.dispatchProposal.count({ where }),
      this.prisma.dispatchProposal.findMany({
        where,
        // ID ikinci sira anahtari: ayni milisaniyede olusan iki kayit sayfalar
        // arasinda yer degistirmesin.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          generation: true,
          computedAt: true,
          workDate: true,
          routeStatus: true,
          resultTourId: true,
          decidedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true, candidates: true } },
        },
      }),
    ]);

    return {
      rows: maskDispatchFinancials(
        rows.map((row) => ({
          id: row.id,
          status: row.status,
          generation: row.generation,
          workDate: workDateOf(row.workDate),
          computedAt: row.computedAt.toISOString(),
          orderCount: row._count.orders,
          candidateCount: row._count.candidates,
          routeStatus: row.routeStatus,
          resultTourId: row.resultTourId,
          decidedAt: toIso(row.decidedAt),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        role,
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // -------------------------------------------------------------------------
  // Detay
  // -------------------------------------------------------------------------

  async detail(id: string, role: string | null | undefined): Promise<DispatchProposalDetail> {
    const financials = canSeeDispatchFinancials(role);

    const row = await this.prisma.dispatchProposal.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        generation: true,
        jobAttempt: true,
        computedAt: true,
        workDate: true,
        routeStatus: true,
        routeFailureClass: true,
        totalDistanceKm: true,
        totalDurationMin: true,
        plannedStops: true,
        resultTourId: true,
        decidedById: true,
        decidedAt: true,
        rejectionReason: true,
        decisionNote: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true, candidates: true } },
        orders: {
          select: {
            sourceRevision: true,
            transportOrder: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                currentRevision: true,
                companyId: true,
                currency: true,
                contractedRevenue: true,
                billingMode: true,
                company: { select: { name: true } },
                _count: { select: { consignments: true } },
              },
            },
          },
        },
        proposal: { select: { proposalType: true, schemaVersion: true, payload: true } },
      },
    });

    if (!row) {
      // Kiraci kapsamli sorgu: baska kiracinin onerisi de BURADA "yok".
      throw new NotFoundException({ code: 'dispatch_proposal_not_found' });
    }

    const detail: DispatchProposalDetail = {
      id: row.id,
      status: row.status,
      generation: row.generation,
      jobAttempt: row.jobAttempt,
      workDate: workDateOf(row.workDate),
      computedAt: row.computedAt.toISOString(),
      orderCount: row._count.orders,
      candidateCount: row._count.candidates,
      routeStatus: row.routeStatus,
      resultTourId: row.resultTourId,
      decidedById: row.decidedById,
      decidedAt: toIso(row.decidedAt),
      // GEREKCE DE SIZDIRIR: "gelir hedefin altinda" bir tutar tasimaz ama
      // korunan alanin varligini ele verir.
      rejectionReason: maskFreeText(row.rejectionReason, role),
      decisionNote: maskFreeText(row.decisionNote, role),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      route: {
        status: row.routeStatus,
        failureClass: row.routeFailureClass,
        totalDistanceKm: toNumber(row.totalDistanceKm),
        totalDurationMin: row.totalDurationMin,
        plannedStops: await this.projectStops(row.plannedStops),
      },
      orders: row.orders.map((order) => ({
        transportOrderId: order.transportOrder.id,
        orderNumber: order.transportOrder.orderNumber,
        status: order.transportOrder.status,
        companyId: order.transportOrder.companyId,
        companyName: order.transportOrder.company?.name ?? null,
        sourceRevision: order.sourceRevision,
        currentRevision: order.transportOrder.currentRevision,
        stale: order.sourceRevision !== order.transportOrder.currentRevision,
        consignmentCount: order.transportOrder._count.consignments,
        // FINANS: alan SILINMIYOR, `null` yaziliyor — "yetkim yok" ile
        // "girilmemis" arayuzde ayni sey degil.
        currency: financials ? order.transportOrder.currency : null,
        contractedRevenue: financials ? toNumber(order.transportOrder.contractedRevenue) : null,
        billingMode: financials ? order.transportOrder.billingMode : null,
      })),
      agent: this.projectAgent(row.proposal),
      financialFieldsMasked: !financials,
    };

    return maskDispatchFinancials(detail, role);
  }

  // -------------------------------------------------------------------------
  // Adaylar
  // -------------------------------------------------------------------------

  async candidates(id: string, role: string | null | undefined): Promise<DispatchCandidateView[]> {
    await this.assertProposalVisible(id);

    const rows = await this.prisma.dispatchCandidate.findMany({
      where: { dispatchProposalId: id },
      orderBy: [{ rank: 'asc' }],
      take: 50,
      select: {
        id: true,
        rank: true,
        vehicleId: true,
        driverId: true,
        overallStatus: true,
        selected: true,
        checks: true,
        vehicle: { select: { plateNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
      },
    });

    return maskDispatchFinancials(
      rows.map((row) => ({
        id: row.id,
        rank: row.rank,
        vehicleId: row.vehicleId,
        vehiclePlate: row.vehicle?.plateNumber ?? null,
        driverId: row.driverId,
        driverName: row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : null,
        overallStatus: row.overallStatus,
        decision: decisionOf(row.overallStatus),
        selected: row.selected,
        checks: this.projectChecks(row.checks, role),
      })),
      role,
    );
  }

  // -------------------------------------------------------------------------
  // Beyanlar
  // -------------------------------------------------------------------------

  async overrides(id: string, role: string | null | undefined): Promise<DispatchOverrideView[]> {
    await this.assertProposalVisible(id);

    const rows = await this.prisma.dispatchOverrideDeclaration.findMany({
      where: { dispatchProposalId: id },
      orderBy: [{ declaredAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        checkCode: true,
        vehicleId: true,
        driverId: true,
        workDate: true,
        proposalRevision: true,
        answer: true,
        note: true,
        declaredById: true,
        declaredAt: true,
      },
    });

    return maskDispatchFinancials(
      rows.map((row) => ({
        id: row.id,
        checkCode: row.checkCode,
        vehicleId: row.vehicleId,
        driverId: row.driverId,
        workDate: row.workDate.toISOString().slice(0, 10),
        proposalRevision: row.proposalRevision,
        answer: row.answer,
        // Beyan notu SERBEST METIN: tutar yazilmis olabilir.
        note: maskFreeText(row.note, role) ?? '',
        declaredById: row.declaredById,
        declaredAt: row.declaredAt.toISOString(),
      })),
      role,
    );
  }

  // -------------------------------------------------------------------------
  // Uygulanmis sonuc
  // -------------------------------------------------------------------------

  /**
   * Onaydan cikan `Tour`.
   *
   * PARALEL BIR TUR MODELI YOK: donen sey repodaki canonical `Tour` kaydinin
   * projeksiyonu. Oneri henuz uygulanmadiysa 404 — "bos tur" gibi bir sey
   * uydurmak, dispatcher'a plan uygulanmis izlenimi verirdi.
   */
  async resultTour(id: string, role: string | null | undefined): Promise<DispatchTourView> {
    const financials = canSeeDispatchFinancials(role);
    const proposal = await this.prisma.dispatchProposal.findFirst({
      where: { id },
      select: { resultTourId: true },
    });
    if (!proposal) {
      throw new NotFoundException({ code: 'dispatch_proposal_not_found' });
    }
    if (!proposal.resultTourId) {
      throw new NotFoundException({ code: 'dispatch_result_not_applied' });
    }

    const tour = await this.prisma.tour.findFirst({
      where: { id: proposal.resultTourId },
      select: {
        id: true,
        status: true,
        workDate: true,
        vehicleId: true,
        driverId: true,
        plannedStartAt: true,
        plannedEndAt: true,
        plannedDistanceKm: true,
        plannedDurationMin: true,
        plannedTollCents: true,
        stops: {
          orderBy: { sequence: 'asc' },
          take: 200,
          select: {
            sequence: true,
            kind: true,
            status: true,
            locationId: true,
            plannedArrivalAt: true,
            assignmentId: true,
          },
        },
      },
    });
    if (!tour) {
      throw new NotFoundException({ code: 'dispatch_result_not_applied' });
    }

    const view: DispatchTourView = {
      tourId: tour.id,
      status: tour.status,
      workDate: tour.workDate.toISOString().slice(0, 10),
      vehicleId: tour.vehicleId,
      driverId: tour.driverId,
      plannedStartAt: toIso(tour.plannedStartAt),
      plannedEndAt: toIso(tour.plannedEndAt),
      plannedDistanceKm: toNumber(tour.plannedDistanceKm),
      plannedDurationMin: tour.plannedDurationMin,
      // GECIS UCRETI BIR MALIYETTIR.
      plannedTollCents: financials ? tour.plannedTollCents : null,
      stops: tour.stops.map((stop) => ({
        sequence: stop.sequence,
        kind: stop.kind,
        status: stop.status,
        locationId: stop.locationId,
        plannedArrivalAt: toIso(stop.plannedArrivalAt),
      })),
      assignmentIds: [
        ...new Set(
          tour.stops
            .map((stop) => stop.assignmentId)
            .filter((value): value is string => typeof value === 'string'),
        ),
      ],
    };

    return maskDispatchFinancials(view, role);
  }

  // -------------------------------------------------------------------------
  // Yardimcilar
  // -------------------------------------------------------------------------

  /** Oneri bu kiraciya gorunur mu — degilse 404. */
  private async assertProposalVisible(id: string): Promise<void> {
    const found = await this.prisma.dispatchProposal.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({ code: 'dispatch_proposal_not_found' });
    }
  }

  /**
   * `checks` JSON'u projeksiyona cevirir.
   *
   * BILINMEYEN ALANLAR DUSER: JSON sutunu serbesttir ve ileride bir alan
   * eklenirse bu uctan sessizce cikmamali.
   */
  private projectChecks(value: Prisma.JsonValue, role: string | null | undefined): DispatchCheckView[] {
    if (!Array.isArray(value)) return [];
    const checks = value as unknown as DispatchCheck[];
    return checks
      .filter((check) => check && typeof check.code === 'string')
      .map((check) => ({
        code: check.code,
        status: check.status,
        reasonKey: maskReasonKey(check.reasonKey ?? '', role),
        evidence: maskEvidenceRecord(check.evidence, role),
        /**
         * POLITIKANIN KENDISI DEGIL, YALNIZCA ASILABILIRLIK.
         *
         * `override` UC DEGERLI bir dize: `'none'` | `'external_verification'`
         * | `'explicit_choice'`. `Boolean(check.override)` yazmak `'none'`u da
         * DOGRU sayardi — yani veri eksikligi yuzunden asilamayan bir kontrol
         * arayuzde "beyanla gecilebilir" gorunur, kullanici beyani doldurur ve
         * sunucu 409 ile reddederdi. Kural `resolveApplyGate` ile AYNI.
         */
        overridable: check.status === 'unknown' && (check.override ?? 'none') !== 'none',
      }));
  }

  private async projectStops(value: Prisma.JsonValue): Promise<DispatchPlannedStopView[]> {
    if (!Array.isArray(value)) return [];
    const stops = (value as unknown[])
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        sequence: typeof entry.sequence === 'number' ? entry.sequence : 0,
        kind: typeof entry.kind === 'string' ? entry.kind : 'unknown',
        locationId: typeof entry.locationId === 'string' ? entry.locationId : null,
        etaAt: typeof entry.etaAt === 'string' ? entry.etaAt : null,
      }));

    const locationIds = [
      ...new Set(stops.map((stop) => stop.locationId).filter((id): id is string => Boolean(id))),
    ];
    if (locationIds.length === 0) {
      return stops.map((stop) => ({ ...stop, latitude: null, longitude: null, locationLabel: null }));
    }

    /**
     * TEK TOPLU SORGU — durak basina sorgu DEGIL.
     *
     * Kiraci kapsamli: baska kiracinin konumu bulunamaz ve koordinat `null`
     * kalir. Harita o duragi cizmez; yanlis bir yere isaret koymaktansa
     * hicbir sey cizmemek dogru.
     */
    const locations = await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, latitude: true, longitude: true, label: true, city: true },
    });
    const byId = new Map(locations.map((location) => [location.id, location]));

    return stops.map((stop) => {
      const location = stop.locationId ? byId.get(stop.locationId) : undefined;
      return {
        ...stop,
        latitude: toNumber(location?.latitude ?? null),
        longitude: toNumber(location?.longitude ?? null),
        locationLabel: location?.label || location?.city || null,
      };
    });
  }

  /**
   * Ajan ciktisini YENIDEN INSA eder — ham `payload` DONMEZ.
   *
   * Bilinen alanlar tek tek okunuyor. Sozlesmenin bir sonraki surumunde
   * eklenecek bir alan bu uctan kendiliginden cikamaz; cikmasi icin BURAYA
   * yazilmasi gerekir ve o an bir insan karar vermis olur.
   */
  private projectAgent(
    proposal: { proposalType: string; schemaVersion: number; payload: Prisma.JsonValue } | null,
  ): DispatchAgentView | null {
    if (!proposal) return null;
    const payload =
      proposal.payload && typeof proposal.payload === 'object' && !Array.isArray(proposal.payload)
        ? (proposal.payload as Record<string, unknown>)
        : {};

    const ranked = Array.isArray(payload.rankedCandidates) ? payload.rankedCandidates : [];
    const consolidation = Array.isArray(payload.consolidationRefs) ? payload.consolidationRefs : [];
    const stops = Array.isArray(payload.stopOrderRefs) ? payload.stopOrderRefs : [];

    return {
      proposalType: proposal.proposalType,
      schemaVersion: proposal.schemaVersion,
      rankedCandidates: ranked
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          candidateRef: String(entry.candidateRef ?? ''),
          rank: typeof entry.rank === 'number' ? entry.rank : 0,
          rationaleKey: String(entry.rationaleKey ?? ''),
        })),
      consolidationRefs: consolidation
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => String(entry.orderRef ?? ''))
        .filter(Boolean),
      stopOrderRefs: stops
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => String(entry.stopRef ?? ''))
        .filter(Boolean),
    };
  }
}
