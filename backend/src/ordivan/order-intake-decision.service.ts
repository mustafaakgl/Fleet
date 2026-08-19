import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalDecision,
  ApprovalTaskStatus,
  AutomationProposalStatus,
  OrderIntakeIntent,
  OrderIntakeMessageStatus,
  OrderIntakeReviewStatus,
  TransportOrderSource,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransportOrdersService, type ConsignmentInput } from '../transport-orders/transport-orders.service';
import {
  FINANCIAL_REVIEW_SEQUENCE,
  OPERATIONAL_REVIEW_SEQUENCE,
  assessApproval,
  diffCorrections,
} from './core/order-intake-approval';

/**
 * ONAY VE DOMAIN SONUCU (Faz 16, bolum 6).
 *
 * BU SERVIS HICBIR SEYI KENDISI YAZMIYOR. Canonical kayitlarin tamami Faz 15
 * `TransportOrdersService` uzerinden olusuyor:
 *
 *   - Yeni siparis  -> `createDraft(..., source: email_agent)`. YALNIZCA
 *     TASLAK; otomatik `confirm` YOK, `Assignment`/`Tour`/`TourStop` YOK.
 *   - Degisiklik    -> `amend(..., source: email_agent)`. Kaynak manuel
 *     olmadigi icin sonuc DAIMA `pending_review`; ana kayit DEGISMEZ.
 *   - Iptal         -> `cancellationImpact(...)`. YALNIZCA ONIZLEME.
 *     `cancel()` BURADAN CAGRILMIYOR — iptali insan Faz 15 ekraninda,
 *     etkisini gordukten sonra uygular.
 *
 * Paralel bir siparis/revizyon yazma yolu ACILMADI: acilsaydi Faz 15'in
 * duplicate kisiti, revizyon numaralandirmasi ve iptal etkisi kontrolu
 * atlanabilirdi.
 */

export interface ApproveReviewInput {
  intent: 'new_order' | 'amendment' | 'cancellation';
  companyId?: string | null;
  orderId?: string | null;
  /** Amendment icin Faz 15'in iyimser eszamanlilik damgasi. */
  expectedUpdatedAt?: string | null;
  /** Insanin SON hali — ajanin onerisi degil. */
  values?: Record<string, unknown>;
  consignments?: ConsignmentInput[];
  /** Duplicate uyarisini bilerek gecmek — kullanicinin ACIK karari. */
  acknowledgeDuplicate?: boolean;
}

export interface ApproveReviewResult {
  reviewId: string;
  intent: string;
  transportOrderId: string | null;
  revisionId: string | null;
  /** Iptal niyetinde: uygulanmadan once gosterilen etki. */
  cancellationImpact: Record<string, unknown> | null;
}

/**
 * Musteri/siparis secimini hangi roller yapabilir.
 *
 * `OPERATIONAL_WRITE_ROLES` ile AYNI: muhasebe fiyati inceler ama hangi
 * musteriye siparis yazilacagina karar veremez.
 */
const SELECTION_ROLES: readonly string[] = ['admin', 'boss', 'office'];

/** Faz 16 gorevlerini hangi rol karara baglayabilir. */
const TASK_ROLES: Record<number, readonly string[]> = {
  [OPERATIONAL_REVIEW_SEQUENCE]: ['admin', 'boss', 'office'],
  [FINANCIAL_REVIEW_SEQUENCE]: ['admin', 'boss', 'accounting'],
};

@Injectable()
export class OrderIntakeDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orders: TransportOrdersService,
  ) {}

  // -------------------------------------------------------------------------
  // Inceleme gorevleri
  // -------------------------------------------------------------------------

  /**
   * Bir inceleme gorevini karara baglar.
   *
   * ROL SINIRI SUNUCUDA: muhasebe operasyonel gorevi, ofis finansal gorevi
   * KAPATAMAZ. Ekranda dugmeyi gizlemek, ayni ucu `curl` ile cagiran birine
   * hicbir sey yapmaz.
   */
  async decideTask(
    userId: string,
    role: string | null | undefined,
    reviewId: string,
    sequence: number,
    decision: 'approved' | 'rejected',
    note?: string | null,
  ): Promise<{ sequence: number; decision: string }> {
    const allowed = TASK_ROLES[sequence];
    if (!allowed) {
      throw new BadRequestException({ code: 'order_intake_task_unknown' });
    }
    if (!allowed.includes(role ?? '')) {
      throw new ForbiddenException({ code: 'order_intake_task_role_forbidden' });
    }

    const review = await this.loadReview(reviewId);
    const task = await this.prisma.approvalTask.findFirst({
      where: { proposalId: review.proposalId, sequence },
      select: { id: true, status: true },
    });
    if (!task) {
      throw new NotFoundException({ code: 'order_intake_task_not_found' });
    }

    // KARAR VERILMIS GOREV YENIDEN KARARA BAGLANMAZ.
    const claimed = await this.prisma.approvalTask.updateMany({
      where: { id: task.id, status: ApprovalTaskStatus.open },
      data: {
        status: ApprovalTaskStatus.decided,
        decision: decision === 'approved' ? ApprovalDecision.approved : ApprovalDecision.rejected,
        decidedById: userId,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'order_intake_task_already_decided' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'order_intake.task_decided',
      entityType: 'OrderIntakeReview',
      entityId: reviewId,
      summary: `Auftragseingang geprüft (Schritt ${sequence})`,
      // ALAN DEGERLERI DENETIME GIRMEZ.
      metadata: { reviewId, sequence, decision, role: role ?? null },
    });

    return { sequence, decision };
  }

  // -------------------------------------------------------------------------
  // Musteri / siparis secimi
  // -------------------------------------------------------------------------

  /**
   * Belirsiz eslesmede insanin sectigi musteriyi ve/veya siparisi kaydeder.
   *
   * KIMLIK YENIDEN DOGRULANIYOR. Sunucu adaylari donduruyor ama istemcinin o
   * listeye uymasina GUVENILMIYOR: gelen her kimlik burada KIRACI KAPSAMLI bir
   * sorguyla yeniden cozuluyor. Baska bir kiracinin `companyId`si bu sorgudan
   * BOS doner ve 400 olur — kaydin varligi bile sizmaz.
   *
   * `null` GONDERMEK SECIMI KALDIRIR: kullanici yanlis sectigini fark edip
   * geri alabilmeli. Bos birakmak (alani hic gondermemek) mevcut secimi
   * KORUR; ikisi ayri islem.
   *
   * ROL: yalnizca operasyon YAZMA rolleri. Muhasebe fiyati inceler ama hangi
   * musteriye siparis yazilacagina karar VEREMEZ — `transport-orders`ta zaten
   * boyle.
   */
  async select(
    userId: string,
    role: string | null | undefined,
    reviewId: string,
    input: { companyId?: string | null; orderId?: string | null },
  ): Promise<{ reviewId: string; selectedCompanyId: string | null; selectedOrderId: string | null }> {
    if (!SELECTION_ROLES.includes(role ?? '')) {
      throw new ForbiddenException({ code: 'order_intake_selection_role_forbidden' });
    }

    const review = await this.loadReview(reviewId);
    if (review.status !== OrderIntakeReviewStatus.open) {
      // Karara baglanmis bir inceleme yeniden yonlendirilemez.
      throw new ConflictException({ code: 'order_intake_review_already_decided' });
    }

    const data: {
      selectedCompanyId?: string | null;
      selectedOrderId?: string | null;
    } = {};

    if (input.companyId !== undefined) {
      data.selectedCompanyId = input.companyId === null
        ? null
        : await this.resolveCompanyInTenant(input.companyId);
    }

    if (input.orderId !== undefined) {
      data.selectedOrderId = input.orderId === null
        ? null
        : await this.resolveOrderInTenant(input.orderId);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: 'order_intake_selection_empty' });
    }

    const claimed = await this.prisma.orderIntakeReview.updateMany({
      where: { id: reviewId, status: OrderIntakeReviewStatus.open },
      data,
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'order_intake_review_already_decided' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'order_intake.selection_changed',
      entityType: 'OrderIntakeReview',
      entityId: reviewId,
      summary: 'Auftragseingang: Zuordnung geändert',
      // HANGI alanlarin degistigi — DEGERLERI degil.
      metadata: {
        reviewId,
        companyChanged: input.companyId !== undefined,
        orderChanged: input.orderId !== undefined,
        cleared: input.companyId === null || input.orderId === null,
      },
    });

    const updated = await this.loadReview(reviewId);
    return {
      reviewId,
      selectedCompanyId: updated.selectedCompanyId ?? null,
      selectedOrderId: updated.selectedOrderId ?? null,
    };
  }

  /**
   * KIRACI KAPSAMLI cozum.
   *
   * `this.prisma` kiraci kapsamli istemci: baska kiracinin kaydi bu sorgudan
   * DONMEZ. Hata mesaji "yok" diyor, "baska kiracida" DEMIYOR — varligin
   * kendisi de bir bilgidir.
   */
  private async resolveCompanyInTenant(companyId: string): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new BadRequestException({ code: 'order_intake_company_not_found' });
    }
    return company.id;
  }

  private async resolveOrderInTenant(orderId: string): Promise<string> {
    const order = await this.prisma.transportOrder.findFirst({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new BadRequestException({ code: 'order_intake_order_not_found' });
    }
    if (order.status === 'cancelled') {
      // Iptal edilmis siparis degistirilemez ve iptal edilemez.
      throw new BadRequestException({ code: 'order_intake_order_cancelled' });
    }
    return order.id;
  }

  // -------------------------------------------------------------------------
  // Onay
  // -------------------------------------------------------------------------

  async approve(
    userId: string,
    role: string | null | undefined,
    reviewId: string,
    input: ApproveReviewInput,
  ): Promise<ApproveReviewResult> {
    const review = await this.loadReview(reviewId);

    /**
     * ONAYDA DA YENIDEN COZULUYOR.
     *
     * Secim ucu zaten dogruluyor ama onay ucu ondan BAGIMSIZ cagrilabilir;
     * istemcinin ara adimi atlayip dogrudan buraya bir kimlik dayatmasi
     * mumkun olmamali. Iki kapinin da kilitli olmasi gerekiyor.
     */
    const requestedCompanyId = input.companyId ?? review.selectedCompanyId ?? review.matchedCompanyId;
    const requestedOrderId = input.orderId ?? review.selectedOrderId ?? review.matchedOrderId;

    const companyId = requestedCompanyId
      ? await this.resolveCompanyInTenant(requestedCompanyId)
      : null;
    const orderId = requestedOrderId ? await this.resolveOrderInTenant(requestedOrderId) : null;

    const tasks = await this.prisma.approvalTask.findMany({
      where: { proposalId: review.proposalId },
      select: { sequence: true, status: true, decision: true },
    });
    const decided = (sequence: number): boolean =>
      tasks.some(
        (task) =>
          task.sequence === sequence &&
          task.status === ApprovalTaskStatus.decided &&
          task.decision === ApprovalDecision.approved,
      );
    const financialRequired = tasks.some((task) => task.sequence === FINANCIAL_REVIEW_SEQUENCE);

    const assessment = assessApproval({
      reviewStatus: review.status,
      intent: input.intent,
      companyId,
      orderId,
      operationalDecided: decided(OPERATIONAL_REVIEW_SEQUENCE),
      financialRequired,
      financialDecided: decided(FINANCIAL_REVIEW_SEQUENCE),
      alreadyProduced:
        review.proposal.resultTransportOrderId !== null ||
        review.proposal.resultTransportOrderRevisionId !== null,
    });

    if (!assessment.allowed) {
      throw new ConflictException({
        code: 'order_intake_approval_blocked',
        blockedBy: assessment.blockedBy,
      });
    }

    /**
     * ONCE HAK ISTE, SONRA YAZ.
     *
     * Inceleme `open` -> `approved` gecisi TEK bir kosullu `updateMany` ile
     * aliniyor. Once-oku-sonra-yaz olsaydi iki es zamanli onay da "open"
     * gorup ikisi de siparis olustururdu. Kaybeden taraf 409 aliyor ve
     * HICBIR canonical kayit uretmiyor — repodaki yakit fisi onayiyla
     * ayni desen.
     */
    const claimed = await this.prisma.orderIntakeReview.updateMany({
      where: { id: reviewId, status: OrderIntakeReviewStatus.open },
      data: {
        status: OrderIntakeReviewStatus.approved,
        resolvedIntent: input.intent as OrderIntakeIntent,
        selectedCompanyId: companyId,
        selectedOrderId: orderId,
        decidedById: userId,
        decidedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'order_intake_review_already_decided' });
    }

    try {
      const result = await this.produce(userId, review, input, companyId, orderId);
      await this.recordCorrections(review, input.values ?? {});
      await this.settle(review.messageId, review.proposalId);

      await this.audit.logAction({
        actorUserId: userId,
        action: 'order_intake.approved',
        entityType: 'OrderIntakeReview',
        entityId: reviewId,
        summary: `Auftragseingang freigegeben (${input.intent})`,
        metadata: {
          reviewId,
          intent: input.intent,
          role: role ?? null,
          transportOrderId: result.transportOrderId,
          revisionId: result.revisionId,
        },
      });

      return { reviewId, intent: input.intent, ...result };
    } catch (error) {
      // YAZMA BASARISIZSA HAK GERI VERILIYOR: aksi halde inceleme "onaylandi"
      // gorunur ama ortada hicbir kayit olmazdi.
      await this.prisma.orderIntakeReview.updateMany({
        where: { id: reviewId, status: OrderIntakeReviewStatus.approved },
        data: {
          status: OrderIntakeReviewStatus.open,
          resolvedIntent: null,
          decidedById: null,
          decidedAt: null,
        },
      });
      throw error;
    }
  }

  /** Niyete gore Faz 15'i cagirir. BURADA hicbir dogrudan yazma YOK. */
  private async produce(
    userId: string,
    review: Awaited<ReturnType<OrderIntakeDecisionService['loadReview']>>,
    input: ApproveReviewInput,
    companyId: string | null,
    orderId: string | null,
  ): Promise<Omit<ApproveReviewResult, 'reviewId' | 'intent'>> {
    const values = input.values ?? {};

    if (input.intent === 'new_order') {
      const created = await this.createDraft(userId, companyId!, values, input);
      const transportOrderId = String(created.id);

      // EXACTLY-ONCE: alan `@unique` ve kosul `null`. Es zamanli ikinci onay
      // bu satiri yazamaz; veritabani uygulamadan once durdurur.
      const linked = await this.prisma.automationProposal.updateMany({
        where: { id: review.proposalId, resultTransportOrderId: null },
        data: { resultTransportOrderId: transportOrderId },
      });
      if (linked.count === 0) {
        throw new ConflictException({ code: 'order_intake_result_already_linked' });
      }

      return { transportOrderId, revisionId: null, cancellationImpact: null };
    }

    if (input.intent === 'amendment') {
      /**
       * FAZ 15 AMENDMENT SERVISI. Kaynak `email_agent` oldugu icin sonuc
       * DAIMA `pending_review` — ana kayit DEGISMEZ, taslak siparislerde bile.
       */
      const expected = input.expectedUpdatedAt;
      if (!expected) {
        throw new BadRequestException({ code: 'order_intake_expected_updated_at_required' });
      }
      await this.orders.amend(
        userId,
        orderId!,
        expected,
        {
          externalReference: asText(values.externalReference),
          notes: asText(values.specialInstructions),
          ...(input.consignments ? { consignments: input.consignments } : {}),
        },
        TransportOrderSource.email_agent,
      );

      const revision = await this.prisma.transportOrderRevision.findFirst({
        where: { transportOrderId: orderId!, status: 'pending_review' },
        orderBy: { revisionNumber: 'desc' },
        select: { id: true },
      });

      const linked = await this.prisma.automationProposal.updateMany({
        where: { id: review.proposalId, resultTransportOrderRevisionId: null },
        data: { resultTransportOrderRevisionId: revision?.id ?? null },
      });
      if (linked.count === 0) {
        throw new ConflictException({ code: 'order_intake_result_already_linked' });
      }

      return { transportOrderId: orderId, revisionId: revision?.id ?? null, cancellationImpact: null };
    }

    /**
     * IPTAL — YALNIZCA ONIZLEME.
     *
     * `cancel()` BURADAN CAGRILMIYOR. Hicbir `Assignment` ya da `Tour`
     * silinmiyor/degistirilmiyor. Etkiyi goren insan iptali Faz 15 ekraninda
     * ACIK bir islemle uygular — bir e-posta, yola cikmis bir aracin gorevini
     * tek basina iptal edemez.
     */
    const impact = await this.orders.cancellationImpact(orderId!);
    return {
      transportOrderId: orderId,
      revisionId: null,
      cancellationImpact: impact as unknown as Record<string, unknown>,
    };
  }

  /**
   * Yeni siparis TASLAGI.
   *
   * SIPARIS NUMARASI SUNUCUDA: ajanin ya da gonderenin yazdigi bir numara
   * KABUL EDILMEZ (sema onu zaten reddediyor) — bizim numaramizi disaridan
   * belirletmek, var olan bir siparisi isaret etmesine izin vermek olurdu.
   */
  private async createDraft(
    userId: string,
    companyId: string,
    values: Record<string, unknown>,
    input: ApproveReviewInput,
  ): Promise<Record<string, unknown>> {
    const currency = asText(values.currency);
    if (!currency) {
      // EUR VARSAYILMIYOR: para birimi okunamadiysa insan girmek zorunda.
      throw new BadRequestException({ code: 'order_intake_currency_required' });
    }
    const orderDate = asText(values.orderDate) ?? new Date().toISOString().slice(0, 10);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.orders.createDraft(
          userId,
          {
            companyId,
            orderNumber: await this.nextOrderNumber(attempt),
            externalReference: asText(values.externalReference),
            orderDate,
            currency,
            contractedRevenue: typeof values.revenueAmount === 'number' ? values.revenueAmount : null,
            notes: asText(values.specialInstructions),
            consignments: input.consignments ?? [],
            acknowledgeDuplicateReference: input.acknowledgeDuplicate === true,
          },
          TransportOrderSource.email_agent,
        );
      } catch (error) {
        // Numara CAKISMASI beklenen bir yaris: bir sonrakini dene. Baska her
        // hata OLDUGU GIBI yukari cikar.
        if (!isOrderNumberConflict(error)) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new ConflictException({ code: 'order_intake_order_number_conflict' });
  }

  private async nextOrderNumber(offset: number): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.transportOrder.count();
    return `TA-${year}-${String(count + 1 + offset).padStart(4, '0')}`;
  }

  // -------------------------------------------------------------------------
  // Red
  // -------------------------------------------------------------------------

  async reject(userId: string, reviewId: string, reason: string): Promise<{ reviewId: string }> {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 5) {
      // RED SEBEBI ZORUNLU: sebepsiz red, gonderenin neyi duzeltecegini
      // bilmemesi demektir.
      throw new BadRequestException({ code: 'order_intake_rejection_reason_required' });
    }

    const review = await this.loadReview(reviewId);
    const claimed = await this.prisma.orderIntakeReview.updateMany({
      where: { id: reviewId, status: OrderIntakeReviewStatus.open },
      data: {
        status: OrderIntakeReviewStatus.rejected,
        decidedById: userId,
        decidedAt: new Date(),
        rejectionReason: trimmed.slice(0, 500),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'order_intake_review_already_decided' });
    }

    await this.settle(review.messageId, review.proposalId, AutomationProposalStatus.rejected);
    await this.audit.logAction({
      actorUserId: userId,
      action: 'order_intake.rejected',
      entityType: 'OrderIntakeReview',
      entityId: reviewId,
      summary: 'Auftragseingang abgelehnt',
      metadata: { reviewId },
    });

    return { reviewId };
  }

  /** Iptal etkisi — ONIZLEME. Hicbir sey degismez. */
  async cancellationImpact(reviewId: string): Promise<Record<string, unknown>> {
    const review = await this.loadReview(reviewId);
    const orderId = review.selectedOrderId ?? review.matchedOrderId;
    if (!orderId) {
      throw new BadRequestException({ code: 'order_intake_order_not_selected' });
    }
    return (await this.orders.cancellationImpact(orderId)) as unknown as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // Yardimcilar
  // -------------------------------------------------------------------------

  private async loadReview(reviewId: string) {
    const review = await this.prisma.orderIntakeReview.findFirst({
      where: { id: reviewId },
      select: {
        id: true,
        messageId: true,
        proposalId: true,
        status: true,
        matchedCompanyId: true,
        matchedOrderId: true,
        selectedCompanyId: true,
        selectedOrderId: true,
        proposal: {
          select: {
            id: true,
            payload: true,
            resultTransportOrderId: true,
            resultTransportOrderRevisionId: true,
          },
        },
      },
    });
    if (!review) {
      throw new NotFoundException({ code: 'order_intake_review_not_found' });
    }
    return review;
  }

  /**
   * Insanin degistirdigi alanlari `AutomationCorrectionEvent` olarak yazar.
   *
   * ONERI DEGISMEZ: duzeltmeler ayri satirlara gidiyor. Ikisi ayni yerde
   * dursaydi "model mi yanildi yoksa insan mi degistirdi" sorusunun cevabi
   * olmazdi.
   */
  private async recordCorrections(
    review: Awaited<ReturnType<OrderIntakeDecisionService['loadReview']>>,
    finalValues: Record<string, unknown>,
  ): Promise<void> {
    const task = await this.prisma.approvalTask.findFirst({
      where: { proposalId: review.proposalId, sequence: OPERATIONAL_REVIEW_SEQUENCE },
      select: { id: true },
    });
    if (!task) return;

    const proposed = (review.proposal.payload ?? {}) as Record<string, unknown>;
    const corrections = diffCorrections(proposed, finalValues);
    if (corrections.length === 0) return;

    await this.prisma.automationCorrectionEvent.createMany({
      data: corrections.map((correction) => ({
        proposalId: review.proposalId,
        approvalTaskId: task.id,
        fieldName: correction.fieldName,
        fieldType: correction.fieldType,
        changed: correction.changed,
        category: correction.category,
      })),
    });

    await this.prisma.approvalTask.updateMany({
      where: { id: task.id },
      data: { changedFieldCount: corrections.filter((item) => item.changed).length },
    });
  }

  private async settle(
    messageId: string,
    proposalId: string,
    proposalStatus: AutomationProposalStatus = AutomationProposalStatus.approved,
  ): Promise<void> {
    await this.prisma.orderIntakeMessage.updateMany({
      where: { id: messageId },
      data: { status: OrderIntakeMessageStatus.settled },
    });
    await this.prisma.automationProposal.updateMany({
      where: { id: proposalId, status: AutomationProposalStatus.pending_review },
      data: { status: proposalStatus },
    });
  }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Siparis numarasi cakismasi — beklenen bir yaris, hata degil. */
function isOrderNumberConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  const code =
    typeof response === 'object' && response !== null && 'code' in response
      ? (response as { code: unknown }).code
      : null;
  return code === 'transport_order_number_taken' || code === 'transport_order_conflict';
}
