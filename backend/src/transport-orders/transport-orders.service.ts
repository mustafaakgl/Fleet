import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdrStatus,
  Prisma,
  TransportOrderBillingMode,
  TransportOrderCancellationCategory,
  TransportOrderRevisionStatus,
  TransportOrderSource,
  TransportOrderStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessCancellationImpact,
  canCancel,
  canTransition,
  cancellationNoteRequired,
  isKnownCancellationCategory,
  requiresAmendment,
  type CancellationImpact,
} from './core/order-lifecycle';
import {
  allocateRevenue,
  assessBilling,
  deriveFulfillment,
  isStaleAgainstOrder,
  type FulfillmentStatus,
} from './core/order-fulfillment';
import {
  assertAgentCannotApplyDirectly,
  diffSnapshots,
  hasMeaningfulChange,
  nextRevisionNumber,
  revisionStatusFor,
  type ConsignmentSnapshot,
  type FieldChange,
  type OrderSnapshot,
} from './core/order-revision';

/**
 * TICARI SIPARIS SERVISI (Faz 15).
 *
 * BU FAZDA FATURA URETILMEZ ve paralel bir invoice modeli KURULMAZ. Servis
 * yalnizca siparisi, kalemlerini ve revizyon gecmisini yonetir; operasyon
 * tarafina `Assignment` uzerinden baglanir.
 *
 * ESKI REVIZYON YENIDEN YAZILMAZ. Onaylanmis sipariste yapilan degisiklik once
 * `pending_review` bir revizyon olur ve ana kayit DEGISMEZ.
 */

/** Decimal API'de STRING doner — float yuvarlamasi sozlesme tutarini degistirmemeli. */
function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function isoDate(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

export interface ConsignmentInput {
  pickupAddress: string;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  deliveryAddress: string;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  cargoDescription: string;
  quantity?: number | null;
  unit?: string | null;
  weightKg?: number | null;
  volumeM3?: number | null;
  palletCount?: number | null;
  adrStatus?: AdrStatus;
  temperatureMinC?: number | null;
  temperatureMaxC?: number | null;
  shipperReference?: string | null;
  consigneeReference?: string | null;
}

export interface CreateOrderInput {
  companyId: string;
  orderNumber: string;
  externalReference?: string | null;
  orderDate: string;
  currency: string;
  contractedRevenue?: number | null;
  billingMode?: TransportOrderBillingMode;
  notes?: string | null;
  consignments?: ConsignmentInput[];
  /** Duplicate uyarisini bilerek gecmek icin — kullanicinin ACIK karari. */
  acknowledgeDuplicateReference?: boolean;
}

/** Bir siparisin degistirilebilir govdesi. Turetilmis alanlar YOK. */
export interface OrderPatch {
  companyId?: string;
  externalReference?: string | null;
  orderDate?: string;
  currency?: string;
  contractedRevenue?: number | null;
  billingMode?: TransportOrderBillingMode;
  notes?: string | null;
  consignments?: ConsignmentInput[];
}

const ORDER_INCLUDE = {
  consignments: { orderBy: { sequence: 'asc' } },
  assignments: {
    select: {
      id: true,
      status: true,
      consignmentId: true,
      sourceRevision: true,
      expectedDailyRevenue: true,
      workDate: true,
      driverId: true,
      vehicleId: true,
    },
  },
} as const;

@Injectable()
export class TransportOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Anlik goruntu ve fark
  // -------------------------------------------------------------------------

  private snapshotOf(order: {
    companyId: string;
    orderNumber: string;
    externalReference: string | null;
    orderDate: Date;
    currency: string;
    contractedRevenue: Prisma.Decimal | null;
    billingMode: string;
    notes: string | null;
    consignments: Array<{
      sequence: number;
      pickupAddress: string;
      pickupWindowStart: Date | null;
      pickupWindowEnd: Date | null;
      deliveryAddress: string;
      deliveryWindowStart: Date | null;
      deliveryWindowEnd: Date | null;
      cargoDescription: string;
      quantity: Prisma.Decimal | null;
      unit: string | null;
      weightKg: Prisma.Decimal | null;
      volumeM3: Prisma.Decimal | null;
      palletCount: number | null;
      adrStatus: string;
      temperatureMinC: Prisma.Decimal | null;
      temperatureMaxC: Prisma.Decimal | null;
      shipperReference: string | null;
      consigneeReference: string | null;
    }>;
  }): OrderSnapshot {
    return {
      companyId: order.companyId,
      orderNumber: order.orderNumber,
      externalReference: order.externalReference,
      orderDate: order.orderDate.toISOString(),
      currency: order.currency,
      contractedRevenue: decimalToString(order.contractedRevenue),
      billingMode: order.billingMode,
      notes: order.notes,
      consignments: order.consignments.map(
        (item): ConsignmentSnapshot => ({
          sequence: item.sequence,
          pickupAddress: item.pickupAddress,
          pickupWindowStart: isoDate(item.pickupWindowStart),
          pickupWindowEnd: isoDate(item.pickupWindowEnd),
          deliveryAddress: item.deliveryAddress,
          deliveryWindowStart: isoDate(item.deliveryWindowStart),
          deliveryWindowEnd: isoDate(item.deliveryWindowEnd),
          cargoDescription: item.cargoDescription,
          quantity: item.quantity === null ? null : item.quantity.toString(),
          unit: item.unit,
          weightKg: decimalToString(item.weightKg),
          volumeM3: item.volumeM3 === null ? null : item.volumeM3.toString(),
          palletCount: item.palletCount,
          adrStatus: item.adrStatus,
          temperatureMinC: decimalToString(item.temperatureMinC),
          temperatureMaxC: decimalToString(item.temperatureMaxC),
          shipperReference: item.shipperReference,
          consigneeReference: item.consigneeReference,
        }),
      ),
    };
  }

  /** Yamanin uygulanmis halini — YAZMADAN — hesaplar. Fark bunun uzerinden. */
  private projectPatch(current: OrderSnapshot, patch: OrderPatch): OrderSnapshot {
    return {
      ...current,
      companyId: patch.companyId ?? current.companyId,
      externalReference:
        patch.externalReference === undefined ? current.externalReference : patch.externalReference,
      orderDate: patch.orderDate ? new Date(patch.orderDate).toISOString() : current.orderDate,
      currency: patch.currency ?? current.currency,
      contractedRevenue:
        patch.contractedRevenue === undefined
          ? current.contractedRevenue
          : patch.contractedRevenue === null
            ? null
            : patch.contractedRevenue.toFixed(2),
      billingMode: patch.billingMode ?? current.billingMode,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      consignments: patch.consignments
        ? patch.consignments.map((item, index) => this.consignmentSnapshotOf(item, index + 1))
        : current.consignments,
    };
  }

  private consignmentSnapshotOf(input: ConsignmentInput, sequence: number): ConsignmentSnapshot {
    const decimal = (value: number | null | undefined, places: number): string | null =>
      value === null || value === undefined ? null : value.toFixed(places);
    return {
      sequence,
      pickupAddress: input.pickupAddress,
      pickupWindowStart: input.pickupWindowStart ? new Date(input.pickupWindowStart).toISOString() : null,
      pickupWindowEnd: input.pickupWindowEnd ? new Date(input.pickupWindowEnd).toISOString() : null,
      deliveryAddress: input.deliveryAddress,
      deliveryWindowStart: input.deliveryWindowStart
        ? new Date(input.deliveryWindowStart).toISOString()
        : null,
      deliveryWindowEnd: input.deliveryWindowEnd
        ? new Date(input.deliveryWindowEnd).toISOString()
        : null,
      cargoDescription: input.cargoDescription,
      quantity: decimal(input.quantity, 3),
      unit: input.unit ?? null,
      weightKg: decimal(input.weightKg, 2),
      volumeM3: decimal(input.volumeM3, 3),
      palletCount: input.palletCount ?? null,
      adrStatus: input.adrStatus ?? AdrStatus.unknown,
      temperatureMinC: decimal(input.temperatureMinC, 2),
      temperatureMaxC: decimal(input.temperatureMaxC, 2),
      shipperReference: input.shipperReference ?? null,
      consigneeReference: input.consigneeReference ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Olusturma
  // -------------------------------------------------------------------------

  /**
   * Duplicate tasiyicisi.
   *
   * Yalnizca referans doluysa ve siparis IPTAL EDILMEMISSE yazilir. Iptal
   * referansi SERBEST BIRAKIR: musteri ayni referansla yeniden siparis
   * verebilmeli.
   */
  private duplicateKeyFor(
    companyId: string,
    externalReference: string | null,
    status: TransportOrderStatus,
  ): string | null {
    if (!externalReference || status === TransportOrderStatus.cancelled) {
      return null;
    }
    return `${companyId}:${externalReference}`;
  }

  async createDraft(userId: string, input: CreateOrderInput): Promise<Record<string, unknown>> {
    const orderDate = new Date(input.orderDate);
    if (Number.isNaN(orderDate.getTime())) {
      throw new BadRequestException({ code: 'transport_order_order_date_invalid' });
    }
    const currency = input.currency.trim().toUpperCase();
    if (currency.length !== 3) {
      // EUR VARSAYILMIYOR.
      throw new BadRequestException({ code: 'transport_order_currency_required' });
    }

    // MUSTERI KIRACI ICINDE COZULMEK ZORUNDA: istemcinin gonderdigi kimlik
    // baska bir kiracinin musterisi olamaz.
    const company = await this.prisma.company.findFirst({
      where: { id: input.companyId },
      select: { id: true },
    });
    if (!company) {
      throw new BadRequestException({ code: 'transport_order_company_not_found' });
    }

    const externalReference = input.externalReference?.trim() || null;

    // DUPLICATE KONTROLU: ayni musteri + ayni referans.
    if (externalReference && !input.acknowledgeDuplicateReference) {
      const existing = await this.prisma.transportOrder.findFirst({
        where: {
          companyId: input.companyId,
          externalReference,
          status: { not: TransportOrderStatus.cancelled },
        },
        select: { id: true, orderNumber: true },
      });
      if (existing) {
        throw new ConflictException({
          code: 'transport_order_duplicate_reference',
          existingOrderId: existing.id,
          existingOrderNumber: existing.orderNumber,
        });
      }
    }

    const consignments = input.consignments ?? [];

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.transportOrder.create({
          data: {
            companyId: input.companyId,
            orderNumber: input.orderNumber.trim(),
            externalReference,
            duplicateKey: this.duplicateKeyFor(
              input.companyId,
              externalReference,
              TransportOrderStatus.draft,
            ),
            orderDate,
            currency,
            contractedRevenue:
              input.contractedRevenue === null || input.contractedRevenue === undefined
                ? null
                : new Prisma.Decimal(input.contractedRevenue.toFixed(2)),
            billingMode: input.billingMode ?? TransportOrderBillingMode.on_order_completion,
            status: TransportOrderStatus.draft,
            source: TransportOrderSource.manual,
            currentRevision: 1,
            notes: input.notes?.trim() || null,
            createdById: userId,
          },
          select: { id: true },
        });

        if (consignments.length > 0) {
          await tx.consignment.createMany({
            data: consignments.map((item, index) => this.consignmentData(created.id, item, index + 1)),
          });
        }

        const full = await tx.transportOrder.findFirstOrThrow({
          where: { id: created.id },
          include: ORDER_INCLUDE,
        });

        // ILK REVIZYON: siparisin dogdugu andaki hali.
        await tx.transportOrderRevision.create({
          data: {
            transportOrderId: created.id,
            revisionNumber: 1,
            status: TransportOrderRevisionStatus.applied,
            snapshot: this.snapshotOf(full) as unknown as Prisma.InputJsonValue,
            changedFields: [] as unknown as Prisma.InputJsonValue,
            source: TransportOrderSource.manual,
            createdById: userId,
          },
        });

        return created;
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'transport_order.created',
        entityType: 'TransportOrder',
        entityId: order.id,
        summary: `Transportauftrag angelegt (${input.orderNumber})`,
        // SOZLESME TUTARI DENETIME GIRMEZ — kararin kaydi, degerin degil.
        metadata: {
          transportOrderId: order.id,
          companyId: input.companyId,
          consignmentCount: consignments.length,
          billingMode: input.billingMode ?? 'on_order_completion',
          duplicateAcknowledged: input.acknowledgeDuplicateReference === true,
        },
      });

      return this.detail(order.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String((error.meta as { target?: string })?.target ?? '');
        // Tekillik ihlali: siparis numarasi ya da duplicate anahtari.
        throw new ConflictException({
          code: target.includes('duplicateKey')
            ? 'transport_order_duplicate_reference'
            : 'transport_order_number_taken',
        });
      }
      throw error;
    }
  }

  private consignmentData(
    transportOrderId: string,
    input: ConsignmentInput,
    sequence: number,
  ): Prisma.ConsignmentCreateManyInput {
    const decimal = (value: number | null | undefined, places: number): Prisma.Decimal | null =>
      value === null || value === undefined ? null : new Prisma.Decimal(value.toFixed(places));
    return {
      transportOrderId,
      sequence,
      pickupAddress: input.pickupAddress.trim(),
      pickupWindowStart: input.pickupWindowStart ? new Date(input.pickupWindowStart) : null,
      pickupWindowEnd: input.pickupWindowEnd ? new Date(input.pickupWindowEnd) : null,
      deliveryAddress: input.deliveryAddress.trim(),
      deliveryWindowStart: input.deliveryWindowStart ? new Date(input.deliveryWindowStart) : null,
      deliveryWindowEnd: input.deliveryWindowEnd ? new Date(input.deliveryWindowEnd) : null,
      cargoDescription: input.cargoDescription.trim(),
      quantity: decimal(input.quantity, 3),
      unit: input.unit?.trim() || null,
      weightKg: decimal(input.weightKg, 2),
      volumeM3: decimal(input.volumeM3, 3),
      palletCount: input.palletCount ?? null,
      // VARSAYILAN `unknown`: "hayir" varsaymak, ADR sevkiyatini normal arac
      // ile yollamanin en sessiz yolu olurdu.
      adrStatus: input.adrStatus ?? AdrStatus.unknown,
      temperatureMinC: decimal(input.temperatureMinC, 2),
      temperatureMaxC: decimal(input.temperatureMaxC, 2),
      shipperReference: input.shipperReference?.trim() || null,
      consigneeReference: input.consigneeReference?.trim() || null,
    };
  }

  // -------------------------------------------------------------------------
  // Okuma
  // -------------------------------------------------------------------------

  async detail(orderId: string): Promise<Record<string, unknown>> {
    const order = await this.prisma.transportOrder.findFirst({
      where: { id: orderId },
      include: {
        ...ORDER_INCLUDE,
        company: { select: { id: true, name: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          select: {
            id: true,
            revisionNumber: true,
            status: true,
            changedFields: true,
            source: true,
            createdAt: true,
            decidedAt: true,
            rejectionReason: true,
          },
        },
      },
    });
    if (!order) {
      // Baska kiracinin siparisi de 404 doner: VARLIGI sizdirilmaz.
      throw new NotFoundException({ code: 'transport_order_not_found' });
    }

    const assignments = order.assignments.map((item) => ({
      id: item.id,
      status: item.status,
      consignmentId: item.consignmentId,
      sourceRevision: item.sourceRevision,
      workDate: item.workDate.toISOString(),
      driverId: item.driverId,
      vehicleId: item.vehicleId,
      expectedDailyRevenue: decimalToString(item.expectedDailyRevenue),
      // ESKI REVIZYONDAN URETILMIS gorev — otomatik duzeltilmez, ISARETLENIR.
      staleAgainstOrder: isStaleAgainstOrder(item, order.currentRevision),
    }));

    const fulfillment: FulfillmentStatus = deriveFulfillment({
      consignmentCount: order.consignments.length,
      assignments: order.assignments.map((item) => ({
        id: item.id,
        status: item.status,
        consignmentId: item.consignmentId,
      })),
    });

    const billing = assessBilling({
      status: order.status,
      billingMode: order.billingMode,
      fulfillment,
      assignments: order.assignments.map((item) => ({
        id: item.id,
        status: item.status,
        consignmentId: item.consignmentId,
      })),
    });

    const revenue = allocateRevenue({
      contractedRevenue: decimalToNumber(order.contractedRevenue),
      assignments: order.assignments.map((item) => ({
        status: item.status,
        expectedDailyRevenue: decimalToNumber(item.expectedDailyRevenue),
      })),
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      externalReference: order.externalReference,
      company: order.company,
      orderDate: order.orderDate.toISOString(),
      status: order.status,
      billingMode: order.billingMode,
      source: order.source,
      currentRevision: order.currentRevision,
      notes: order.notes,
      // --- FINANSAL ALANLAR: controller rol bazli maskeler ---
      currency: order.currency,
      contractedRevenue: decimalToString(order.contractedRevenue),
      revenueAllocation: revenue,
      // --- Turetilmis ---
      fulfillment,
      billing,
      consignments: order.consignments.map((item) => ({
        id: item.id,
        sequence: item.sequence,
        pickupAddress: item.pickupAddress,
        pickupWindowStart: isoDate(item.pickupWindowStart),
        pickupWindowEnd: isoDate(item.pickupWindowEnd),
        deliveryAddress: item.deliveryAddress,
        deliveryWindowStart: isoDate(item.deliveryWindowStart),
        deliveryWindowEnd: isoDate(item.deliveryWindowEnd),
        cargoDescription: item.cargoDescription,
        quantity: item.quantity === null ? null : item.quantity.toString(),
        unit: item.unit,
        weightKg: decimalToString(item.weightKg),
        volumeM3: item.volumeM3 === null ? null : item.volumeM3.toString(),
        palletCount: item.palletCount,
        adrStatus: item.adrStatus,
        temperatureMinC: decimalToString(item.temperatureMinC),
        temperatureMaxC: decimalToString(item.temperatureMaxC),
        shipperReference: item.shipperReference,
        consigneeReference: item.consigneeReference,
      })),
      assignments,
      revisions: order.revisions.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        decidedAt: isoDate(item.decidedAt),
      })),
      cancellation:
        order.status === TransportOrderStatus.cancelled
          ? {
              category: order.cancellationCategory,
              note: order.cancellationNote,
              cancelledAt: isoDate(order.cancelledAt),
              cancelledById: order.cancelledById,
            }
          : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async list(query: {
    status?: TransportOrderStatus;
    companyId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: unknown[]; page: number; pageSize: number; total: number; totalPages: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);

    const where: Prisma.TransportOrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.companyId) where.companyId = query.companyId;
    if (query.from || query.to) {
      where.orderDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.transportOrder.count({ where }),
      this.prisma.transportOrder.findMany({
        where,
        orderBy: [{ orderDate: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...ORDER_INCLUDE,
          company: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      rows: rows.map((order) => {
        const facts = order.assignments.map((item) => ({
          id: item.id,
          status: item.status,
          consignmentId: item.consignmentId,
        }));
        const fulfillment = deriveFulfillment({
          consignmentCount: order.consignments.length,
          assignments: facts,
        });
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          externalReference: order.externalReference,
          company: order.company,
          orderDate: order.orderDate.toISOString(),
          status: order.status,
          billingMode: order.billingMode,
          currentRevision: order.currentRevision,
          currency: order.currency,
          contractedRevenue: decimalToString(order.contractedRevenue),
          consignmentCount: order.consignments.length,
          assignmentCount: facts.filter((item) => item.status !== 'cancelled').length,
          fulfillment,
          billing: assessBilling({
            status: order.status,
            billingMode: order.billingMode,
            fulfillment,
            assignments: facts,
          }),
          hasPendingAmendment: false,
          staleAssignmentCount: order.assignments.filter((item) =>
            isStaleAgainstOrder(item, order.currentRevision),
          ).length,
          updatedAt: order.updatedAt.toISOString(),
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // -------------------------------------------------------------------------
  // Onay
  // -------------------------------------------------------------------------

  /** Draft'i onaylar. `expectedUpdatedAt` cakismayi engeller. */
  async confirm(
    userId: string,
    orderId: string,
    expectedUpdatedAt: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadForWrite(orderId);

    if (order.status === TransportOrderStatus.confirmed) {
      // IDEMPOTENT: ayni onay yeniden gelirse cakisma degil.
      return this.detail(orderId);
    }
    if (!canTransition(order.status, TransportOrderStatus.confirmed)) {
      throw new ConflictException({
        code: 'transport_order_not_confirmable',
        status: order.status,
      });
    }

    const expected = this.parseExpected(expectedUpdatedAt);
    const claimed = await this.prisma.transportOrder.updateMany({
      where: { id: orderId, status: TransportOrderStatus.draft, updatedAt: expected },
      data: {
        status: TransportOrderStatus.confirmed,
        confirmedAt: new Date(),
        confirmedById: userId,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'transport_order_conflict' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'transport_order.confirmed',
      entityType: 'TransportOrder',
      entityId: orderId,
      summary: `Transportauftrag bestätigt (${order.orderNumber})`,
      metadata: { transportOrderId: orderId, revision: order.currentRevision },
    });

    return this.detail(orderId);
  }

  // -------------------------------------------------------------------------
  // Revizyon / amendment
  // -------------------------------------------------------------------------

  /**
   * Degisiklik onerisi.
   *
   * Draft'ta DOGRUDAN uygulanir; onaylanmis sipariste `pending_review` bir
   * revizyon acar ve ANA KAYIT DEGISMEZ.
   */
  async amend(
    userId: string,
    orderId: string,
    expectedUpdatedAt: string,
    patch: OrderPatch,
    source: TransportOrderSource = TransportOrderSource.manual,
  ): Promise<Record<string, unknown>> {
    const order = await this.loadForWrite(orderId);
    if (order.status === TransportOrderStatus.cancelled) {
      throw new ConflictException({ code: 'transport_order_cancelled' });
    }

    const before = this.snapshotOf(order);
    const after = this.projectPatch(before, patch);
    const changes = diffSnapshots(before, after);

    if (!hasMeaningfulChange(changes)) {
      // BOS REVIZYON YAZILMAZ: gecmisi anlamsiz satirlarla doldurmak, gercek
      // degisiklikleri gorunmez kilar.
      throw new BadRequestException({ code: 'transport_order_no_changes' });
    }

    const status = revisionStatusFor(order.status);
    // AJAN KAPISI: manuel olmayan kaynak dogrudan UYGULAYAMAZ.
    assertAgentCannotApplyDirectly(source, status);

    const expected = this.parseExpected(expectedUpdatedAt);
    const revisionNumber = nextRevisionNumber(order.currentRevision);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (status === TransportOrderRevisionStatus.applied) {
          const claimed = await tx.transportOrder.updateMany({
            where: { id: orderId, updatedAt: expected },
            data: {
              ...this.patchData(order, patch, after),
              currentRevision: revisionNumber,
            },
          });
          if (claimed.count === 0) {
            throw new ConflictException({ code: 'transport_order_conflict' });
          }
          await this.replaceConsignments(tx, orderId, patch.consignments);
        }

        await tx.transportOrderRevision.create({
          data: {
            transportOrderId: orderId,
            revisionNumber,
            status,
            // DEGISMEZ: yazildiktan sonra hicbir akista guncellenmez.
            snapshot: after as unknown as Prisma.InputJsonValue,
            changedFields: changes as unknown as Prisma.InputJsonValue,
            source,
            createdById: userId,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Eszamanli ikinci revizyon ayni numarayi ALAMAZ.
        throw new ConflictException({ code: 'transport_order_revision_conflict' });
      }
      throw error;
    }

    await this.audit.logAction({
      actorUserId: userId,
      action:
        status === TransportOrderRevisionStatus.applied
          ? 'transport_order.revised'
          : 'transport_order.amendment_proposed',
      entityType: 'TransportOrder',
      entityId: orderId,
      summary: `Transportauftrag geändert (${order.orderNumber}, Rev. ${revisionNumber})`,
      // HANGI ALANLAR degisti — DEGERLERI degil.
      metadata: {
        transportOrderId: orderId,
        revisionNumber,
        revisionStatus: status,
        changedFieldCount: changes.length,
        changedFields: changes.map((item) => item.field).join(','),
        source,
      },
    });

    return this.detail(orderId);
  }

  /** Bekleyen revizyonu ANA KAYDA uygular. */
  async approveAmendment(
    userId: string,
    orderId: string,
    revisionId: string,
    expectedUpdatedAt: string,
  ): Promise<Record<string, unknown>> {
    const revision = await this.prisma.transportOrderRevision.findFirst({
      where: { id: revisionId, transportOrderId: orderId },
      select: { id: true, revisionNumber: true, status: true, snapshot: true },
    });
    if (!revision) {
      throw new NotFoundException({ code: 'transport_order_revision_not_found' });
    }
    if (revision.status !== TransportOrderRevisionStatus.pending_review) {
      throw new ConflictException({
        code: 'transport_order_revision_not_pending',
        status: revision.status,
      });
    }

    const order = await this.loadForWrite(orderId);
    const expected = this.parseExpected(expectedUpdatedAt);
    const snapshot = revision.snapshot as unknown as OrderSnapshot;

    const outcome = await this.prisma.$transaction(async (tx) => {
      // KOSULLU: yalnizca HENUZ BEKLEYEN revizyon karara baglanir. Iki
      // incelemeci ayni anda onaylarsa yalnizca BIRI kazanir.
      const claimedRevision = await tx.transportOrderRevision.updateMany({
        where: { id: revisionId, status: TransportOrderRevisionStatus.pending_review },
        data: {
          status: TransportOrderRevisionStatus.applied,
          decidedById: userId,
          decidedAt: new Date(),
        },
      });
      if (claimedRevision.count === 0) {
        return { applied: false };
      }

      const claimedOrder = await tx.transportOrder.updateMany({
        where: { id: orderId, updatedAt: expected },
        data: {
          companyId: snapshot.companyId,
          externalReference: snapshot.externalReference,
          duplicateKey: this.duplicateKeyFor(
            snapshot.companyId,
            snapshot.externalReference,
            order.status,
          ),
          orderDate: new Date(snapshot.orderDate),
          currency: snapshot.currency,
          contractedRevenue:
            snapshot.contractedRevenue === null
              ? null
              : new Prisma.Decimal(snapshot.contractedRevenue),
          billingMode: snapshot.billingMode as TransportOrderBillingMode,
          notes: snapshot.notes,
          currentRevision: revision.revisionNumber,
        },
      });
      if (claimedOrder.count === 0) {
        throw new ConflictException({ code: 'transport_order_conflict' });
      }

      await tx.consignment.deleteMany({ where: { transportOrderId: orderId } });
      if (snapshot.consignments.length > 0) {
        await tx.consignment.createMany({
          data: snapshot.consignments.map((item) => ({
            transportOrderId: orderId,
            sequence: item.sequence,
            pickupAddress: item.pickupAddress,
            pickupWindowStart: item.pickupWindowStart ? new Date(item.pickupWindowStart) : null,
            pickupWindowEnd: item.pickupWindowEnd ? new Date(item.pickupWindowEnd) : null,
            deliveryAddress: item.deliveryAddress,
            deliveryWindowStart: item.deliveryWindowStart
              ? new Date(item.deliveryWindowStart)
              : null,
            deliveryWindowEnd: item.deliveryWindowEnd ? new Date(item.deliveryWindowEnd) : null,
            cargoDescription: item.cargoDescription,
            quantity: item.quantity === null ? null : new Prisma.Decimal(item.quantity),
            unit: item.unit,
            weightKg: item.weightKg === null ? null : new Prisma.Decimal(item.weightKg),
            volumeM3: item.volumeM3 === null ? null : new Prisma.Decimal(item.volumeM3),
            palletCount: item.palletCount,
            adrStatus: item.adrStatus as AdrStatus,
            temperatureMinC:
              item.temperatureMinC === null ? null : new Prisma.Decimal(item.temperatureMinC),
            temperatureMaxC:
              item.temperatureMaxC === null ? null : new Prisma.Decimal(item.temperatureMaxC),
            shipperReference: item.shipperReference,
            consigneeReference: item.consigneeReference,
          })),
        });
      }

      return { applied: true };
    });

    if (!outcome.applied) {
      throw new ConflictException({ code: 'transport_order_revision_already_decided' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'transport_order.amendment_approved',
      entityType: 'TransportOrder',
      entityId: orderId,
      summary: `Änderung übernommen (Rev. ${revision.revisionNumber})`,
      metadata: { transportOrderId: orderId, revisionId, revisionNumber: revision.revisionNumber },
    });

    return this.detail(orderId);
  }

  /** Reddeder. ANA KAYIT DEGISMEZ ve oneri gecmiste kalir. */
  async rejectAmendment(
    userId: string,
    orderId: string,
    revisionId: string,
    reason: string,
  ): Promise<Record<string, unknown>> {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException({ code: 'transport_order_rejection_reason_required' });
    }

    const claimed = await this.prisma.transportOrderRevision.updateMany({
      where: {
        id: revisionId,
        transportOrderId: orderId,
        status: TransportOrderRevisionStatus.pending_review,
      },
      data: {
        status: TransportOrderRevisionStatus.rejected,
        decidedById: userId,
        decidedAt: new Date(),
        rejectionReason: trimmed.slice(0, 500),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'transport_order_revision_not_pending' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'transport_order.amendment_rejected',
      entityType: 'TransportOrder',
      entityId: orderId,
      summary: 'Änderung abgelehnt',
      metadata: { transportOrderId: orderId, revisionId, reasonLength: trimmed.length },
    });

    return this.detail(orderId);
  }

  // -------------------------------------------------------------------------
  // Iptal
  // -------------------------------------------------------------------------

  /** Iptalin operasyona etkisi — YAZMADAN once gosterilir. */
  async cancellationImpact(orderId: string): Promise<CancellationImpact & { fulfillment: string }> {
    const order = await this.prisma.transportOrder.findFirst({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException({ code: 'transport_order_not_found' });
    }

    const assignmentIds = order.assignments.map((item) => item.id);
    const tours = assignmentIds.length
      ? await this.prisma.tour.findMany({
          where: { stops: { some: { assignmentId: { in: assignmentIds } } } },
          select: { id: true, status: true },
        })
      : [];

    return {
      ...assessCancellationImpact({
        assignments: order.assignments.map((item) => ({ id: item.id, status: item.status })),
        tours,
      }),
      fulfillment: deriveFulfillment({
        consignmentCount: order.consignments.length,
        assignments: order.assignments.map((item) => ({
          id: item.id,
          status: item.status,
          consignmentId: item.consignmentId,
        })),
      }),
    };
  }

  /**
   * Iptal — KAYIT SILINMEZ.
   *
   * `Assignment`, `Tour` ve `TourStop` kayitlarina DOKUNULMAZ: yola cikmis bir
   * aracin gorevini sistemden yok etmek, sofor ekraninda isin bir anda
   * kaybolmasi demektir.
   */
  async cancel(
    userId: string,
    orderId: string,
    input: {
      expectedUpdatedAt: string;
      category: string;
      note?: string;
      acknowledgeImpact?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    if (!isKnownCancellationCategory(input.category)) {
      throw new BadRequestException({ code: 'transport_order_cancellation_category_invalid' });
    }
    const note = input.note?.trim() ?? '';
    if (cancellationNoteRequired(input.category) && note.length < 5) {
      throw new BadRequestException({ code: 'transport_order_cancellation_note_required' });
    }

    const impact = await this.cancellationImpact(orderId);
    const order = await this.loadForWrite(orderId);

    const gate = canCancel(order.status, impact.fulfillment);
    if (!gate.allowed) {
      throw new ConflictException({ code: gate.code });
    }

    // ETKILENEN KAYIT VARSA ACIK ONAY: kullanici neyin etkilenecegini GORMEDEN
    // iptal edemez.
    if (impact.requiresConfirmation && input.acknowledgeImpact !== true) {
      throw new ConflictException({
        code: 'transport_order_cancellation_needs_acknowledgement',
        impact,
      });
    }

    const expected = this.parseExpected(input.expectedUpdatedAt);
    const claimed = await this.prisma.transportOrder.updateMany({
      where: {
        id: orderId,
        status: { not: TransportOrderStatus.cancelled },
        updatedAt: expected,
      },
      data: {
        status: TransportOrderStatus.cancelled,
        cancelledAt: new Date(),
        cancelledById: userId,
        cancellationCategory: input.category as TransportOrderCancellationCategory,
        cancellationNote: note || null,
        // Iptal referansi SERBEST BIRAKIR.
        duplicateKey: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'transport_order_conflict' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'transport_order.cancelled',
      entityType: 'TransportOrder',
      entityId: orderId,
      summary: `Transportauftrag storniert (${order.orderNumber})`,
      // ETKILENEN KAYITLAR denetime giriyor: sonradan "neyi etkiledi" sorusu
      // sorulacak.
      metadata: {
        transportOrderId: orderId,
        category: input.category,
        assignmentCount: impact.assignmentCount,
        activeAssignmentCount: impact.activeAssignmentCount,
        releasedTourCount: impact.releasedTourCount,
        acknowledged: input.acknowledgeImpact === true,
      },
    });

    return this.detail(orderId);
  }

  // -------------------------------------------------------------------------
  // Yardimcilar
  // -------------------------------------------------------------------------

  private parseExpected(value: string): Date {
    const expected = new Date(value);
    if (Number.isNaN(expected.getTime())) {
      throw new ConflictException({ code: 'transport_order_conflict' });
    }
    return expected;
  }

  private async loadForWrite(orderId: string) {
    const order = await this.prisma.transportOrder.findFirst({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException({ code: 'transport_order_not_found' });
    }
    return order;
  }

  private patchData(
    order: { companyId: string },
    patch: OrderPatch,
    after: OrderSnapshot,
  ): Prisma.TransportOrderUncheckedUpdateInput {
    return {
      companyId: after.companyId,
      externalReference: after.externalReference,
      duplicateKey: this.duplicateKeyFor(
        after.companyId,
        after.externalReference,
        TransportOrderStatus.draft,
      ),
      orderDate: new Date(after.orderDate),
      currency: after.currency,
      contractedRevenue:
        after.contractedRevenue === null ? null : new Prisma.Decimal(after.contractedRevenue),
      billingMode: after.billingMode as TransportOrderBillingMode,
      notes: after.notes,
    };
  }

  // -------------------------------------------------------------------------
  // Operasyon bagi
  // -------------------------------------------------------------------------

  /**
   * Kiracinin taban para birimi.
   *
   * EUR SABIT DEGIL: finansal yetkisi olmayan bir kullanici siparis actiginda
   * para birimini SECEMEZ (bkz. order-field-security) ve sunucu kiracinin
   * yapilandirilmis tabanini kullanir. Kodda sabit `EUR` yazmak, tek bir
   * kiraciyi butun kuruluma dayatmak olurdu.
   */
  async tenantBaseCurrency(): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({ select: { baseCurrency: true } });
    return tenant?.baseCurrency ?? 'EUR';
  }

  /**
   * Siparisten gorev DILIMI olusturur.
   *
   * GOREV MEVCUT SERVISTEN GECER: bu metot `Assignment` kaydini kendisi
   * YAZMAZ, cagiran taraf `AssignmentsService.create`i kullanir ve burada
   * yalnizca siparis bagi kurulur. Ikinci bir gorev olusturma yolu acmak,
   * ehliyet/arac uygunluk kapilarini atlamanin yolu olurdu.
   *
   * IDEMPOTENT — DOGAL ANAHTAR: ayni (siparis, kalem, surucu, arac, gun)
   * icin ZATEN bir gorev varsa yenisi acilmaz, var olan doner.
   */
  async findExistingSlice(input: {
    transportOrderId: string;
    consignmentId: string | null;
    driverId: string;
    vehicleId: string;
    workDate: Date;
  }): Promise<{ id: string } | null> {
    const start = new Date(input.workDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.prisma.assignment.findFirst({
      where: {
        transportOrderId: input.transportOrderId,
        consignmentId: input.consignmentId,
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        workDate: { gte: start, lt: end },
        status: { not: 'cancelled' },
      },
      select: { id: true },
    });
  }

  /** Yeni gorevi siparise baglar ve URETILDIGI revizyonu isaretler. */
  async attachAssignment(
    userId: string,
    orderId: string,
    assignmentId: string,
    consignmentId: string | null,
  ): Promise<void> {
    const order = await this.prisma.transportOrder.findFirst({
      where: { id: orderId },
      select: { id: true, currentRevision: true, companyId: true },
    });
    if (!order) {
      throw new NotFoundException({ code: 'transport_order_not_found' });
    }

    if (consignmentId) {
      const consignment = await this.prisma.consignment.findFirst({
        where: { id: consignmentId, transportOrderId: orderId },
        select: { id: true },
      });
      if (!consignment) {
        throw new BadRequestException({ code: 'transport_order_consignment_not_found' });
      }
    }

    // BIR GOREV YALNIZ BIR SIPARISE AIT OLABILIR: baskasina bagliysa
    // sessizce tasinmaz.
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId },
      select: { id: true, transportOrderId: true },
    });
    if (!assignment) {
      throw new BadRequestException({ code: 'transport_order_assignment_not_found' });
    }
    if (assignment.transportOrderId && assignment.transportOrderId !== orderId) {
      throw new ConflictException({
        code: 'transport_order_assignment_already_linked',
        transportOrderId: assignment.transportOrderId,
      });
    }

    await this.prisma.assignment.updateMany({
      where: { id: assignmentId },
      data: {
        transportOrderId: orderId,
        consignmentId,
        // Planin URETILDIGI revizyon. Siparis degisince geride kalir ve
        // arayuz "guncel siparisten farkli" uyarisi gosterir.
        sourceRevision: order.currentRevision,
      },
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'transport_order.assignment_linked',
      entityType: 'TransportOrder',
      entityId: orderId,
      summary: 'Auftrag mit Transportauftrag verknüpft',
      metadata: {
        transportOrderId: orderId,
        assignmentId,
        consignmentId,
        sourceRevision: order.currentRevision,
      },
    });
  }

  /** Siparisin musterisi — gorev taslagi ayni musteriye acilmali. */
  async companyOf(orderId: string): Promise<{ companyId: string; currentRevision: number }> {
    const order = await this.prisma.transportOrder.findFirst({
      where: { id: orderId },
      select: { companyId: true, currentRevision: true, status: true },
    });
    if (!order) {
      throw new NotFoundException({ code: 'transport_order_not_found' });
    }
    if (order.status === TransportOrderStatus.cancelled) {
      throw new ConflictException({ code: 'transport_order_cancelled' });
    }
    return { companyId: order.companyId, currentRevision: order.currentRevision };
  }

  async revisions(orderId: string): Promise<unknown[]> {
    const rows = await this.prisma.transportOrderRevision.findMany({
      where: { transportOrderId: orderId },
      orderBy: { revisionNumber: 'desc' },
      select: {
        id: true,
        revisionNumber: true,
        status: true,
        snapshot: true,
        changedFields: true,
        source: true,
        sourceVersion: true,
        createdAt: true,
        createdById: true,
        decidedAt: true,
        decidedById: true,
        rejectionReason: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      decidedAt: isoDate(row.decidedAt),
    }));
  }

  private async replaceConsignments(
    tx: Prisma.TransactionClient,
    orderId: string,
    consignments: ConsignmentInput[] | undefined,
  ): Promise<void> {
    if (!consignments) return;
    await tx.consignment.deleteMany({ where: { transportOrderId: orderId } });
    if (consignments.length > 0) {
      await tx.consignment.createMany({
        data: consignments.map((item, index) => this.consignmentData(orderId, item, index + 1)),
      });
    }
  }
}
