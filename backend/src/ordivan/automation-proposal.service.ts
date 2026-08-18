import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import {
  ApprovalDecision,
  ApprovalTaskStatus,
  AutomationCorrectionCategory,
  AutomationProposalStatus,
  AutomationRejectionCategory,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { summarizeChecks, type AutomationCheckResult } from './core/automation-check.contract';
import {
  isNoteAcceptable,
  resolveNoteRequirement,
  type ReviewFieldState,
} from './core/review-policy';
import type { ServiceInvoiceDraft } from './core/service-invoice';
import {
  buildServiceRecordData,
  type ServiceInvoiceFinalization,
} from './service-invoice-approval';

/** Bu esigin altindaki guven "dusuk" sayilir. */
export const LOW_CONFIDENCE = 0.7;

/**
 * Karar bu sureden hizli verildiyse insan onerinin icerigini okumamis
 * olabilir. Bir HUKUM DEGIL, bir SINYAL: ekranda isaretlenir, engellenmez.
 */
export const RUBBER_STAMP_THRESHOLD_MS = 3_000;

/**
 * 1:n onay zincirinde GUNCEL adim.
 *
 * Faz 12'de tek adim var; fonksiyon yine de zinciri dogru okuyor ki ileride
 * adim eklendiginde cagiran taraf degismesin.
 */
export function currentTask<
  T extends { status: string; sequence: number; decidedAt?: Date | null },
>(tasks: T[]): T | null {
  const open = tasks
    .filter((task) => task.status === 'open')
    .sort((left, right) => left.sequence - right.sequence);
  if (open.length > 0) {
    return open[0]!;
  }
  return [...tasks].sort((left, right) => right.sequence - left.sequence)[0] ?? null;
}

export interface CorrectionInput {
  fieldName: string;
  fieldType: string;
  changed: boolean;
  category: AutomationCorrectionCategory;
  criticalLowConfidence?: boolean;
  verifiedByReviewer?: boolean;
}

/**
 * Oneri incelemesi (Faz 12).
 *
 * ONAY HICBIR DOMAIN KAYDI URETMEZ. Ne Assignment, ne Tour, ne belge, ne
 * fatura. Yalnizca onerinin durumu degisir ve insanin ne yaptigi
 * `AutomationCorrectionEvent` olarak yazilir.
 *
 * OLCUM AMACI RUBBER-STAMPING RISKI: kac alan degistirildi, karar ne kadar
 * surdu, kritik ve dusuk guvenli alanlar dogrulandi mi. Gizli fare/klavye
 * takibi YOK.
 */
@Injectable()
export class AutomationProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private lowConfidenceFields(confidence: Prisma.JsonValue | null): string[] {
    if (!confidence || typeof confidence !== 'object' || Array.isArray(confidence)) {
      return [];
    }
    return Object.entries(confidence as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'number' && value < LOW_CONFIDENCE)
      .map(([key]) => key);
  }

  async list(query: {
    status?: AutomationProposalStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: unknown[]; page: number; pageSize: number; total: number; totalPages: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const where: Prisma.AutomationProposalWhereInput = {};
    if (query.status) where.status = query.status;

    const [total, rows] = await Promise.all([
      this.prisma.automationProposal.count({ where }),
      this.prisma.automationProposal.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          proposalType: true,
          status: true,
          confidence: true,
          checks: true,
          createdAt: true,
          updatedAt: true,
          job: { select: { id: true, jobType: true } },
          approvalTasks: {
            orderBy: { sequence: 'asc' },
            select: { id: true, sequence: true, status: true, openedAt: true, decidedAt: true, decision: true },
          },
        },
      }),
    ]);

    return {
      rows: rows.map((row) => {
        const checks = (Array.isArray(row.checks) ? row.checks : []) as unknown as AutomationCheckResult[];
        return {
          id: row.id,
          proposalType: row.proposalType,
          status: row.status,
          jobId: row.job.id,
          jobType: row.job.jobType,
          lowConfidenceFields: this.lowConfidenceFields(row.confidence),
          checkSummary: summarizeChecks(checks),
          // Faz 12'de tek adim var; 1:n iliskide "guncel adim" ilk ACIK
          // gorevdir, yoksa son karar verilmis gorev.
          decision: currentTask(row.approvalTasks)?.decision ?? null,
          decidedAt: currentTask(row.approvalTasks)?.decidedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Detay. Ilk acilista `openedAt` isaretlenir — karar suresinin baslangici.
   *
   * Kosullu `updateMany`: yalnizca HENIZ ACILMAMIS gorev isaretlenir, ikinci
   * acilis zamani geri almaz.
   */
  async detail(proposalId: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.automationProposal.findFirst({
      where: { id: proposalId },
      select: {
        id: true,
        proposalType: true,
        schemaVersion: true,
        status: true,
        payload: true,
        confidence: true,
        evidence: true,
        checks: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        resultServiceRecordId: true,
        resultServiceRecord: {
          select: { id: true, vehicleId: true, date: true, costAmount: true, currency: true },
        },
        job: {
          select: {
            id: true,
            jobType: true,
            schemaVersion: true,
            // Belgenin KIMLIGI ve adi; depolama yolu YOK.
            document: { select: { id: true, originalName: true, mimeType: true, fileSize: true } },
          },
        },
        agentRun: {
          select: {
            id: true,
            attempt: true,
            toolset: true,
            capabilities: true,
            credentialScope: true,
            connectorVersion: true,
            protocolVersion: true,
            modelVersion: true,
            promptVersion: true,
            connector: { select: { id: true, displayName: true } },
          },
        },
        approvalTasks: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            status: true,
            assignedRole: true,
            assignedUserId: true,
            openedAt: true,
            decision: true,
            rejectionCategory: true,
            decidedAt: true,
            decisionNote: true,
            reviewDurationMs: true,
            changedFieldCount: true,
            criticalLowConfidenceVerified: true,
            decidedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException({ code: 'ordivan_proposal_not_found' });
    }

    const active = currentTask(row.approvalTasks);
    if (active && !active.openedAt) {
      // Kosullu: ikinci acilis karar suresinin baslangicini GERI ALMAZ.
      await this.prisma.approvalTask.updateMany({
        where: { id: active.id, openedAt: null },
        data: { openedAt: new Date() },
      });
    }

    const checks = (Array.isArray(row.checks) ? row.checks : []) as unknown as AutomationCheckResult[];

    return {
      id: row.id,
      proposalType: row.proposalType,
      schemaVersion: row.schemaVersion,
      status: row.status,
      payload: row.payload,
      confidence: row.confidence,
      evidence: row.evidence,
      checks,
      checkSummary: summarizeChecks(checks),
      lowConfidenceFields: this.lowConfidenceFields(row.confidence),
      lowConfidenceThreshold: LOW_CONFIDENCE,
      job: { id: row.job.id, jobType: row.job.jobType, schemaVersion: row.job.schemaVersion },
      // Yetkili onizleme yolu; ham depolama yolu istemciye ASLA verilmiyor.
      document: row.job.document
        ? {
            id: row.job.document.id,
            originalName: row.job.document.originalName,
            mimeType: row.job.document.mimeType,
            fileSize: row.job.document.fileSize,
            fileDownloadPath: `/ordivan/automation/documents/${row.job.document.id}/file`,
          }
        : null,
      /** Onay sonucu olusan CANONICAL kayit — izlenebilirlik bagi. */
      serviceRecord: row.resultServiceRecord
        ? {
            id: row.resultServiceRecord.id,
            vehicleId: row.resultServiceRecord.vehicleId,
            date: row.resultServiceRecord.date.toISOString(),
            costAmount: Number(row.resultServiceRecord.costAmount),
            currency: row.resultServiceRecord.currency,
          }
        : null,
      // Denetlenebilir yetki izi — hangi connector, hangi arac setiyle.
      agentRun: row.agentRun,
      // 1:n — arayuz adim listesini de gorebiliyor; Faz 12'de tek eleman.
      approvalTasks: row.approvalTasks.map((task) => ({
        ...task,
        openedAt: task.openedAt?.toISOString() ?? null,
        decidedAt: task.decidedAt?.toISOString() ?? null,
      })),
      approvalTask: active
        ? {
            ...active,
            openedAt: active.openedAt?.toISOString() ?? new Date().toISOString(),
            decidedAt: active.decidedAt?.toISOString() ?? null,
          }
        : null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Karar — ATOMIK ve DOMAIN'E DOKUNMAZ.
   *
   * Aciklama ZORUNLU: gerekcesiz bir onay, alti ay sonra hicbir seye cevap
   * veremez. Mevcut `updatedAt + updateMany` deseni iki incelemecinin ayni
   * oneriyi farkli sonuclarla kapatmasini engelliyor.
   */
  async decide(
    userId: string,
    proposalId: string,
    input: {
      expectedUpdatedAt: string;
      decision: ApprovalDecision;
      note?: string;
      rejectionCategory?: AutomationRejectionCategory;
      corrections?: CorrectionInput[];
      /** Faz 13 — servis faturasi onayinda INSANIN onayladigi degerler. */
      serviceInvoice?: ServiceInvoiceFinalization;
    },
  ): Promise<{ proposal: Record<string, unknown>; changed: boolean }> {
    const note = input.note?.trim() ?? '';

    const before = await this.prisma.automationProposal.findFirst({
      where: { id: proposalId },
      select: {
        id: true,
        status: true,
        proposalType: true,
        confidence: true,
        expiresAt: true,
        payload: true,
        resultServiceRecordId: true,
        approvalTasks: {
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, status: true, openedAt: true, decision: true },
        },
      },
    });
    const task = before ? currentTask(before.approvalTasks) : null;
    if (!before || !task) {
      throw new NotFoundException({ code: 'ordivan_proposal_not_found' });
    }

    // RED SEBEBI ZORUNLU: "neden reddedildi" sorusu serbest metinden degil
    // sayilabilir bir kategoriden cevaplanmali.
    if (input.decision === ApprovalDecision.rejected && !input.rejectionCategory) {
      throw new BadRequestException({ code: 'ordivan_rejection_category_required' });
    }

    const corrections = input.corrections ?? [];
    const fieldStates: ReviewFieldState[] = corrections.map((item) => ({
      fieldName: item.fieldName,
      changed: item.changed,
      criticalLowConfidence: item.criticalLowConfidence ?? false,
    }));

    const noteRequirement = resolveNoteRequirement({
      decision: input.decision === ApprovalDecision.approved ? 'approved' : 'rejected',
      proposalType: before.proposalType,
      rejectionCategory: input.rejectionCategory ?? null,
      fields: fieldStates,
    });
    if (!isNoteAcceptable(noteRequirement, note)) {
      throw new BadRequestException({
        code: 'ordivan_decision_note_required',
        reason: noteRequirement.required ? noteRequirement.reason : 'unknown',
      });
    }

    const target =
      input.decision === ApprovalDecision.approved
        ? AutomationProposalStatus.approved
        : AutomationProposalStatus.rejected;

    // Tekrar gonderilen AYNI karar: cakisma degil, ikinci kayit da uretilmez.
    if (before.status === target && task.decision === input.decision) {
      return { proposal: await this.detail(proposalId), changed: false };
    }

    // SURESI DOLMUS ONERIYE KARAR VERILEMEZ. Durum heniz `expired` yazilmamis
    // olsa bile: scheduler dakikalar sonra calisabilir, karar simdi geliyor.
    if (before.expiresAt && before.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'ordivan_proposal_expired',
        status: AutomationProposalStatus.expired,
      });
    }

    if (before.status !== AutomationProposalStatus.pending_review) {
      throw new ConflictException({
        code: 'ordivan_proposal_not_reviewable',
        status: before.status,
      });
    }

    const expected = new Date(input.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ConflictException({ code: 'ordivan_proposal_review_conflict' });
    }

    /**
     * SERVIS FATURASI ONAYI (Faz 13).
     *
     * Kayit, durum degisikligiyle AYNI TRANSACTION'da olusuyor. Ayri olsaydi
     * onay yazilip kayit yazilmadan surec olebilir ve elimizde "onaylandi ama
     * maliyeti yok" bir oneri kalirdi.
     */
    const isServiceInvoice =
      before.proposalType === 'service_invoice.draft' &&
      input.decision === ApprovalDecision.approved;

    let finalization: ReturnType<typeof buildServiceRecordData> | null = null;
    if (isServiceInvoice) {
      if (!input.serviceInvoice) {
        throw new BadRequestException({ code: 'service_invoice_confirmation_required' });
      }
      // ARAC KIRACI ICINDE COZULMEK ZORUNDA: istemcinin gonderdigi kimlik
      // baska bir filonun araci olamaz.
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.serviceInvoice.vehicleId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) {
        throw new BadRequestException({ code: 'service_invoice_vehicle_required' });
      }
      finalization = buildServiceRecordData(
        input.serviceInvoice,
        (before.payload ?? {}) as ServiceInvoiceDraft,
      );
    }

    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.automationProposal.updateMany({
        where: {
          id: proposalId,
          status: AutomationProposalStatus.pending_review,
          updatedAt: expected,
        },
        data: { status: target },
      });

      if (claimed.count === 0) {
        return { claimed: 0, serviceRecordId: null as string | null };
      }

      if (!finalization) {
        return { claimed: 1, serviceRecordId: null as string | null };
      }

      const record = await tx.serviceRecord.create({
        data: finalization.data,
        select: { id: true },
      });

      // `resultServiceRecordId` TEKIL: ikinci bir kayit baglanamaz. Kosul
      // ayrica `null` — yaris durumunda ikinci yazim sessizce duser.
      await tx.automationProposal.updateMany({
        where: { id: proposalId, resultServiceRecordId: null },
        data: { resultServiceRecordId: record.id },
      });

      return { claimed: 1, serviceRecordId: record.id };
    });

    if (outcome.claimed === 0) {
      throw new ConflictException({ code: 'ordivan_proposal_review_conflict' });
    }

    const changedFieldCount = corrections.filter((item) => item.changed).length;
    const lowConfidence = this.lowConfidenceFields(before.confidence);
    // Kritik + dusuk guvenli alanlarin HEPSI dogrulandi mi.
    const criticalFields = corrections.filter((item) => item.criticalLowConfidence);
    const criticalVerified =
      criticalFields.length > 0 && criticalFields.every((item) => item.verifiedByReviewer);

    const openedAt = task.openedAt ?? now;
    const reviewDurationMs = Math.max(0, now.getTime() - openedAt.getTime());

    await this.prisma.approvalTask.updateMany({
      where: { id: task.id },
      data: {
        status: ApprovalTaskStatus.decided,
        decision: input.decision,
        rejectionCategory: input.rejectionCategory ?? null,
        decidedById: userId,
        decidedAt: now,
        decisionNote: note,
        reviewDurationMs,
        changedFieldCount,
        criticalLowConfidenceVerified: criticalVerified,
      },
    });

    const events = corrections.map((item) => ({
      proposalId,
      approvalTaskId: task.id,
      // ALAN ADI VE TURU — DEGERI DEGIL.
      fieldName: item.fieldName.slice(0, 120),
      fieldType: item.fieldType.slice(0, 60),
      changed: item.changed,
      category: item.category,
      rejectionCategory: input.rejectionCategory ?? null,
      previousConfidence: this.confidenceOf(before.confidence, item.fieldName),
      criticalLowConfidence: item.criticalLowConfidence ?? false,
      verifiedByReviewer: item.verifiedByReviewer ?? false,
      reviewDurationMs,
    }));

    // HER RED BIR KALITE SINYALI URETIR. Alan bazli duzeltme gelmese bile
    // onerinin butunuyle reddedildigi kaydediliyor — aksi halde "hangi hata
    // turu yogunlasiyor" sorusu reddedilen onerileri hic gormezdi.
    if (input.decision === ApprovalDecision.rejected && events.length === 0) {
      events.push({
        proposalId,
        approvalTaskId: task.id,
        fieldName: '__proposal__',
        fieldType: 'proposal',
        changed: false,
        category: AutomationCorrectionCategory.rejected_entirely,
        rejectionCategory: input.rejectionCategory ?? null,
        previousConfidence: null,
        criticalLowConfidence: false,
        verifiedByReviewer: false,
        reviewDurationMs,
      });
    }

    if (events.length > 0) {
      await this.prisma.automationCorrectionEvent.createMany({ data: events });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action:
        input.decision === ApprovalDecision.approved
          ? 'automation_proposal.approved'
          : 'automation_proposal.rejected',
      entityType: 'AutomationProposal',
      entityId: proposalId,
      summary: `Automationsvorschlag ${input.decision} (${before.proposalType})`,
      // ONERI GOVDESI VE ACIKLAMA METNI DENETIME GIRMEZ.
      metadata: {
        proposalId,
        proposalType: before.proposalType,
        decision: input.decision,
        rejectionCategory: input.rejectionCategory ?? null,
        noteRequired: noteRequirement.required,
        changedFieldCount,
        reviewDurationMs,
        lowConfidenceFieldCount: lowConfidence.length,
        criticalLowConfidenceVerified: criticalVerified,
        // Faz 13: hangi tutar tabani secildi ve kayit olustu mu — DEGERIN
        // KENDISI degil, kararin kaydi.
        ...(finalization
          ? {
              serviceRecordId: outcome.serviceRecordId,
              costBasis: input.serviceInvoice?.costBasis ?? null,
              amountDiffersFromExtraction: finalization.amountDiffersFromExtraction,
            }
          : {}),
        // Rubber-stamping SINYALI — hukum degil.
        fastDecision: reviewDurationMs < RUBBER_STAMP_THRESHOLD_MS,
      },
    });

    return { proposal: await this.detail(proposalId), changed: true };
  }

  private confidenceOf(
    confidence: Prisma.JsonValue | null,
    fieldName: string,
  ): Prisma.Decimal | null {
    if (!confidence || typeof confidence !== 'object' || Array.isArray(confidence)) {
      return null;
    }
    const value = (confidence as Record<string, unknown>)[fieldName];
    return typeof value === 'number' ? new Prisma.Decimal(value.toFixed(3)) : null;
  }

  /**
   * Suresi dolmus onerileri kapatir.
   *
   * SESSIZCE ONAYLANMIS SAYILMAZ: durum `expired` olur, ACIK onay gorevleri
   * `closed_expired` ile kapanir ve denetime yazilir. "Kimse bakmadi" ile
   * "bakildi ve onaylandi" birbirinden ayrilmali — bu ayrim kaybolursa,
   * kimsenin bakmadigi bir oneri raporda onaylanmis gorunur.
   *
   * KARAR YALNIZ SUNUCU SAATINE gore: `expiresAt` sunucuda yazildi, burada da
   * sunucu saatiyle karsilastiriliyor. Connector zamani bu karara girmiyor.
   */
  async expireOverdueProposals(limit = 200): Promise<{ expired: number }> {
    const now = new Date();
    const overdue = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.automationProposal.findMany({
        where: {
          status: AutomationProposalStatus.pending_review,
          expiresAt: { lt: now },
        },
        take: limit,
        select: { id: true, tenantId: true, proposalType: true },
      }),
    );

    let expired = 0;

    for (const proposal of overdue) {
      const claimed = await TenantContext.runUnscoped(() =>
        this.prisma.unscoped.automationProposal.updateMany({
          // Kosullu: arada insan karar verdiyse bu gecis UYGULANMAZ.
          where: { id: proposal.id, status: AutomationProposalStatus.pending_review },
          data: { status: AutomationProposalStatus.expired },
        }),
      );
      if (claimed.count === 0) {
        continue;
      }

      await TenantContext.runUnscoped(() =>
        this.prisma.unscoped.approvalTask.updateMany({
          where: { proposalId: proposal.id, status: ApprovalTaskStatus.open },
          data: { status: ApprovalTaskStatus.closed_expired },
        }),
      );

      await TenantContext.run(proposal.tenantId, () =>
        this.audit.logAction({
          action: 'automation_proposal.expired',
          entityType: 'AutomationProposal',
          entityId: proposal.id,
          summary: `Automationsvorschlag abgelaufen (${proposal.proposalType})`,
          metadata: {
            proposalId: proposal.id,
            proposalType: proposal.proposalType,
            // Karar VERILMEDI — denetimde bu acikca duruyor.
            decided: false,
            expiredAt: now.toISOString(),
          },
        }),
      );

      expired += 1;
    }

    return { expired };
  }

  /** Inceleme metrikleri — rubber-stamping riskini gorunur kilar. */
  async reviewMetrics(): Promise<Record<string, number>> {
    const [decided, fast, withChanges, criticalVerified] = await Promise.all([
      this.prisma.approvalTask.count({ where: { decidedAt: { not: null } } }),
      this.prisma.approvalTask.count({
        where: { reviewDurationMs: { lt: RUBBER_STAMP_THRESHOLD_MS, not: null } },
      }),
      this.prisma.approvalTask.count({ where: { changedFieldCount: { gt: 0 } } }),
      this.prisma.approvalTask.count({ where: { criticalLowConfidenceVerified: true } }),
    ]);

    return { decided, fastDecisions: fast, withChanges, criticalVerified };
  }
}
