import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  AgentRunStatus,
  AutomationJobStatus,
  AutomationProposalStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { assertValidChecks, type AutomationCheckResult } from './core/automation-check.contract';
import {
  JOB_TYPE_REGISTRY,
  isKnownJobType,
  toolsetFor,
  validateJobPayload,
  validateProposal,
  type JobType,
} from './core/job-type-registry';
import { SchemaValidationError } from './core/schema-validation';
import {
  buildServiceInvoiceChecks,
  matchVehicle,
  type ServiceInvoiceDraft,
} from './core/service-invoice';
import type { AuthenticatedConnector } from './ordivan-connector.service';
import { CURRENT_PROTOCOL_VERSION, PROPOSAL_REVIEW_TTL_MS } from './ordivan.config';

/** Kiralama suresi. Dolarsa is kontrollu bicimde kuyruga doner. */
const LEASE_TTL_MS = 2 * 60_000;

export interface LeasedJob {
  jobId: string;
  jobType: string;
  schemaVersion: number;
  payload: unknown;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: string;
  /** Bu is icin izin verilen araclar. Connector'in istegine gore DEGISMEZ. */
  toolset: readonly string[];
  allowedProposalTypes: readonly string[];
  protocolVersion: number;
}

/**
 * Is ve kiralama protokolu (Faz 12).
 *
 * KIRALAMA NEDEN: connector baska bir makinede, ag kopabilir, surec olebilir.
 * "Isi aldim" demek yetmez; is BELIRLI BIR SURE icin verilir ve sure dolarsa
 * kuyruga doner. Bu, ayni isin iki kez calismasi ile hic calismamasi
 * arasindaki tek savunma.
 *
 * BAYAT DENEME KORUMASI: her kiralama kendi `leaseToken`ini uretir. Gec gelen
 * eski bir denemenin sonucu, token eslesmedigi icin REDDEDILIR — yenisini
 * ezemez. Bu olmasaydi 3 dakika once olmus bir surecin cevabi, o sirada
 * calisan dogru sonucun uzerine yazabilirdi.
 */
@Injectable()
export class AutomationJobService {
  private readonly logger = new Logger(AutomationJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================================
  // Is olusturma
  // =====================================================================

  async createJob(
    actorUserId: string | null,
    input: {
      jobType: string;
      schemaVersion?: number;
      payload: unknown;
      /** Isin uzerinde calisacagi belge (Faz 13). SUNUCUDAN gelir. */
      documentId?: string;
    },
  ): Promise<{ id: string; jobType: string; status: string }> {
    const schemaVersion = input.schemaVersion ?? 1;

    let payload: Record<string, unknown>;
    try {
      // Registry'de olmayan tur ya da surum BURADA duser; kuyruga hic girmez.
      payload = validateJobPayload(input.jobType, schemaVersion, input.payload);
    } catch (error) {
      throw new BadRequestException({
        code: 'ordivan_job_payload_invalid',
        reason: error instanceof SchemaValidationError ? error.reason : 'invalid',
        field: error instanceof SchemaValidationError ? error.field : undefined,
      });
    }

    const definition = JOB_TYPE_REGISTRY[input.jobType as JobType];

    const job = await this.prisma.automationJob.create({
      data: {
        jobType: definition.jobType,
        schemaVersion,
        payload: payload as Prisma.InputJsonValue,
        requiredCapability: definition.requiredCapability,
        status: AutomationJobStatus.queued,
        createdById: actorUserId,
        documentId: input.documentId ?? null,
      },
      select: { id: true, jobType: true, status: true },
    });

    await this.audit.logAction({
      actorUserId,
      action: 'automation_job.created',
      entityType: 'AutomationJob',
      entityId: job.id,
      summary: `Automationsauftrag angelegt (${job.jobType})`,
      // PAYLOAD DENETIME GIRMEZ: belge adi/icerigi tasiyabilir.
      metadata: { jobId: job.id, jobType: job.jobType, schemaVersion },
    });

    return job;
  }

  // =====================================================================
  // Kiralama
  // =====================================================================

  /**
   * Connector'a bir is kiralar.
   *
   * ATOMIK SAHIPLENME: aday secildikten sonra kosullu `updateMany` ile
   * aliniyor (`status` ve `leaseToken` beklenen degerde mi). Iki connector
   * ayni adayi gorse bile yalnizca biri `count === 1` alir; digeri bos doner.
   * Once-oku-sonra-yaz yapsaydik ikisi de ayni isi calistirirdi.
   */
  async leaseJob(connector: AuthenticatedConnector): Promise<LeasedJob | null> {
    if (connector.capabilities.length === 0) {
      return null;
    }

    const now = new Date();

    // Aday: (a) kuyrukta bekleyen, ya da (b) kiralamasi dolmus is.
    // Kiraci filtresi Prisma uzantisindan geliyor; buraya elle yazilmiyor.
    const candidates = await this.prisma.automationJob.findMany({
      where: {
        requiredCapability: { in: connector.capabilities },
        OR: [
          { status: AutomationJobStatus.queued },
          {
            status: { in: [AutomationJobStatus.leased, AutomationJobStatus.running] },
            leaseExpiresAt: { lt: now },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 10,
      select: {
        id: true,
        jobType: true,
        schemaVersion: true,
        payload: true,
        status: true,
        attempt: true,
        maxAttempts: true,
        leaseToken: true,
      },
    });

    for (const candidate of candidates) {
      if (candidate.attempt >= candidate.maxAttempts) {
        continue;
      }
      if (!isKnownJobType(candidate.jobType)) {
        // Registry'den kaldirilmis bir tur artik calistirilamaz.
        continue;
      }

      const leaseToken = randomBytes(16).toString('hex');
      const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS);
      const attempt = candidate.attempt + 1;

      const claimed = await this.prisma.automationJob.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          // `leaseToken` beklenen degerde mi: arada baskasi kiraladiysa
          // token degismistir ve bu istek kaybeder.
          leaseToken: candidate.leaseToken,
          attempt: candidate.attempt,
        },
        data: {
          status: AutomationJobStatus.leased,
          leasedByConnectorId: connector.connectorId,
          leasedAt: new Date(),
          leaseExpiresAt,
          leaseToken,
          attempt,
        },
      });

      if (claimed.count === 0) {
        continue;
      }

      const definition = JOB_TYPE_REGISTRY[candidate.jobType];

      // Kosu kaydi: hangi connector, hangi kapsam, hangi arac seti.
      await this.prisma.agentRun.create({
        data: {
          jobId: candidate.id,
          connectorId: connector.connectorId,
          attempt,
          status: AgentRunStatus.running,
          credentialScope: connector.capabilities,
          capabilities: connector.capabilities,
          // ARAC SETI SUNUCUDAN: connector ne isterse istesin bu liste gecerli.
          toolset: [...definition.toolset],
          schemaVersion: candidate.schemaVersion,
        },
      });

      return {
        jobId: candidate.id,
        jobType: candidate.jobType,
        schemaVersion: candidate.schemaVersion,
        payload: candidate.payload,
        attempt,
        leaseToken,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        toolset: toolsetFor(candidate.jobType),
        allowedProposalTypes: definition.allowedProposalTypes,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
      };
    }

    return null;
  }

  /** Connector isi gercekten calistirmaya basladi. */
  async markRunning(
    connector: AuthenticatedConnector,
    jobId: string,
    leaseToken: string,
  ): Promise<{ status: string }> {
    const updated = await this.prisma.automationJob.updateMany({
      where: {
        id: jobId,
        leasedByConnectorId: connector.connectorId,
        leaseToken,
        status: AutomationJobStatus.leased,
      },
      data: { status: AutomationJobStatus.running },
    });

    if (updated.count === 0) {
      throw new ConflictException({ code: 'ordivan_lease_not_current' });
    }
    return { status: AutomationJobStatus.running };
  }

  // =====================================================================
  // Tamamlama
  // =====================================================================

  /**
   * Isi tamamlar ve oneriyi yazar.
   *
   * IDEMPOTENT: ayni token ile ikinci kez gelen tamamlama YENI BIR ONERI
   * URETMEZ; var olan oneriyi doner. Ag tekrarlari ve worker'in yeniden
   * denemesi bu yuzden zararsiz.
   *
   * BAYAT DENEME: token guncel degilse istek reddedilir ve mevcut sonuc
   * DEGISMEZ.
   */
  async completeJob(
    connector: AuthenticatedConnector,
    jobId: string,
    input: {
      leaseToken: string;
      proposalType: string;
      proposalSchemaVersion?: number;
      payload: unknown;
      confidence?: Record<string, number>;
      evidence?: Record<string, unknown>;
      checks?: AutomationCheckResult[];
      modelVersion?: string;
      promptVersion?: string;
    },
  ): Promise<{ jobId: string; proposalId: string; repeated: boolean }> {
    const job = await this.prisma.automationJob.findFirst({
      where: { id: jobId },
      select: {
        id: true,
        jobType: true,
        status: true,
        leaseToken: true,
        leasedByConnectorId: true,
        attempt: true,
      },
    });

    if (!job) {
      throw new ConflictException({ code: 'ordivan_job_not_found' });
    }

    // Ayni token ile tekrar: yeni oneri URETILMEZ.
    if (job.status === AutomationJobStatus.completed && job.leaseToken === input.leaseToken) {
      const existing = await this.prisma.automationProposal.findFirst({
        where: { jobId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (existing) {
        return { jobId, proposalId: existing.id, repeated: true };
      }
    }

    if (
      job.leasedByConnectorId !== connector.connectorId ||
      job.leaseToken !== input.leaseToken ||
      (job.status !== AutomationJobStatus.leased && job.status !== AutomationJobStatus.running)
    ) {
      // BAYAT DENEME. Sonuc kabul edilmiyor ve mevcut durum korunuyor.
      throw new ConflictException({ code: 'ordivan_lease_not_current' });
    }

    const proposalSchemaVersion = input.proposalSchemaVersion ?? 1;

    let payload: Record<string, unknown>;
    try {
      // MODEL METNI DOGRUDAN KAYDA DONUSEMEZ: govde whitelist'li tur ve
      // sema ile dogrulaniyor, beklenmeyen alan REDDEDILIYOR.
      payload = validateProposal(
        job.jobType,
        input.proposalType,
        proposalSchemaVersion,
        input.payload,
      );
    } catch (error) {
      const reason = error instanceof SchemaValidationError ? error.reason : 'invalid';
      await this.failJob(connector, jobId, {
        leaseToken: input.leaseToken,
        failureClass: `proposal_${reason}`,
      });
      throw new BadRequestException({
        code: 'ordivan_proposal_invalid',
        reason,
        field: error instanceof SchemaValidationError ? error.field : undefined,
      });
    }

    let checks = input.checks ?? [];
    let evidence: Record<string, unknown> = input.evidence ?? {};

    /**
     * SERVIS FATURASI: arac eslestirmesini ve kontrolleri SUNUCU yapar.
     *
     * Connector'in gonderdigi kontroller bilgi amaclidir; araci SECEN taraf
     * asla ajan olamaz. Ajanin ciktisi yalnizca bir ADAY metnidir (plaka/VIN)
     * ve eslestirme deterministik kurallarla, kiraci kapsaminda burada
     * yapiliyor.
     */
    if (input.proposalType === 'service_invoice.draft') {
      const draft = payload as ServiceInvoiceDraft;
      const vehicles = await this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: { id: true, plateNumber: true, vin: true },
        take: 5_000,
      });
      const vehicleMatch = matchVehicle(vehicles, {
        vin: draft.vin ?? null,
        plateNumber: draft.plateNumber ?? null,
      });
      checks = buildServiceInvoiceChecks({ draft, vehicleMatch });
      evidence = {
        ...evidence,
        vehicleMatch: {
          status: vehicleMatch.status,
          vehicleId: vehicleMatch.vehicleId,
          matchedBy: vehicleMatch.matchedBy,
          reason: vehicleMatch.reason,
          candidateIds: vehicleMatch.candidateIds,
        },
      };
    }

    try {
      // Gerekcesiz `unknown` kabul edilmez.
      assertValidChecks(checks);
    } catch {
      throw new BadRequestException({ code: 'ordivan_check_contract_violation' });
    }

    const run = await this.prisma.agentRun.findFirst({
      where: { jobId, attempt: job.attempt },
      select: { id: true },
    });
    if (!run) {
      throw new ConflictException({ code: 'ordivan_agent_run_missing' });
    }

    const now = new Date();
    const claimed = await this.prisma.automationJob.updateMany({
      where: { id: jobId, leaseToken: input.leaseToken },
      data: {
        status: AutomationJobStatus.completed,
        completedAt: now,
        leaseExpiresAt: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'ordivan_lease_not_current' });
    }

    await this.prisma.agentRun.updateMany({
      where: { id: run.id },
      data: {
        status: AgentRunStatus.completed,
        finishedAt: now,
        modelVersion: input.modelVersion?.slice(0, 80) ?? null,
        promptVersion: input.promptVersion?.slice(0, 80) ?? null,
      },
    });

    const proposal = await this.prisma.automationProposal.create({
      data: {
        jobId,
        agentRunId: run.id,
        proposalType: input.proposalType,
        schemaVersion: proposalSchemaVersion,
        status: AutomationProposalStatus.pending_review,
        payload: payload as Prisma.InputJsonValue,
        confidence: (input.confidence ?? {}) as Prisma.InputJsonValue,
        evidence: evidence as Prisma.InputJsonValue,
        checks: checks as unknown as Prisma.InputJsonValue,
        // SURE SUNUCUDAN: connector ne gonderirse gondersin okunmuyor.
        expiresAt: new Date(now.getTime() + PROPOSAL_REVIEW_TTL_MS),
      },
      select: { id: true },
    });

    // Insan is kalemi oneriyle birlikte aciliyor. Iliski 1:n; Faz 12'de
    // yalnizca ilk adim (sequence 1) olusturuluyor.
    await this.prisma.approvalTask.create({
      data: { proposalId: proposal.id, sequence: 1 },
    });

    await this.audit.logAction({
      action: 'automation_job.completed',
      entityType: 'AutomationJob',
      entityId: jobId,
      summary: `Automationsauftrag abgeschlossen (${job.jobType})`,
      // ONERI GOVDESI DENETIME GIRMEZ.
      metadata: {
        jobId,
        connectorId: connector.connectorId,
        attempt: job.attempt,
        proposalId: proposal.id,
        proposalType: input.proposalType,
        checkStatuses: checks.map((check) => check.status),
      },
    });

    return { jobId, proposalId: proposal.id, repeated: false };
  }

  /**
   * Hata bildirimi.
   *
   * Deneme siniri dolduysa is DEAD-LETTER olur: otomatik tekrar yok, insan
   * bakmali. Sonsuz tekrar, bozuk bir isin butun kuyrugu tuketmesi demektir.
   */
  async failJob(
    connector: AuthenticatedConnector,
    jobId: string,
    input: { leaseToken: string; failureClass: string },
  ): Promise<{ status: string; attempt: number }> {
    const job = await this.prisma.automationJob.findFirst({
      where: { id: jobId },
      select: {
        id: true,
        leaseToken: true,
        leasedByConnectorId: true,
        attempt: true,
        maxAttempts: true,
        status: true,
      },
    });

    if (
      !job ||
      job.leasedByConnectorId !== connector.connectorId ||
      job.leaseToken !== input.leaseToken
    ) {
      throw new ConflictException({ code: 'ordivan_lease_not_current' });
    }

    const exhausted = job.attempt >= job.maxAttempts;
    const now = new Date();

    await this.prisma.automationJob.updateMany({
      where: { id: jobId, leaseToken: input.leaseToken },
      data: exhausted
        ? {
            status: AutomationJobStatus.dead_letter,
            deadLetteredAt: now,
            failedAt: now,
            failureClass: input.failureClass.slice(0, 80),
            leaseExpiresAt: null,
            leaseToken: null,
          }
        : {
            status: AutomationJobStatus.queued,
            failureClass: input.failureClass.slice(0, 80),
            leasedByConnectorId: null,
            leasedAt: null,
            leaseExpiresAt: null,
            leaseToken: null,
          },
    });

    await this.prisma.agentRun.updateMany({
      where: { jobId, attempt: job.attempt },
      data: {
        status: AgentRunStatus.failed,
        finishedAt: now,
        failureClass: input.failureClass.slice(0, 80),
      },
    });

    return {
      status: exhausted ? AutomationJobStatus.dead_letter : AutomationJobStatus.queued,
      attempt: job.attempt,
    };
  }

  /**
   * Suresi dolmus kiralamalari toparlar.
   *
   * Connector cokup hic haber vermezse isi kurtaran tek yol budur. Deneme
   * siniri dolmussa is kuyruga DEGIL dead-letter'a duser.
   */
  async reclaimExpiredLeases(limit = 100): Promise<{ requeued: number; deadLettered: number }> {
    const now = new Date();
    const expired = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.automationJob.findMany({
        where: {
          status: { in: [AutomationJobStatus.leased, AutomationJobStatus.running] },
          leaseExpiresAt: { lt: now },
        },
        take: limit,
        select: { id: true, tenantId: true, attempt: true, maxAttempts: true, leaseToken: true },
      }),
    );

    let requeued = 0;
    let deadLettered = 0;

    for (const job of expired) {
      const exhausted = job.attempt >= job.maxAttempts;
      const claimed = await TenantContext.runUnscoped(() =>
        this.prisma.unscoped.automationJob.updateMany({
          // `leaseToken` kosulu: arada connector geri donup tamamladiysa
          // token degismistir ve bu toparlama uygulanmaz.
          where: { id: job.id, leaseToken: job.leaseToken },
          data: exhausted
            ? {
                status: AutomationJobStatus.dead_letter,
                deadLetteredAt: now,
                failureClass: 'lease_expired',
                leaseExpiresAt: null,
                leaseToken: null,
              }
            : {
                status: AutomationJobStatus.queued,
                failureClass: 'lease_expired',
                leasedByConnectorId: null,
                leasedAt: null,
                leaseExpiresAt: null,
                leaseToken: null,
              },
        }),
      );
      if (claimed.count === 0) continue;
      if (exhausted) deadLettered += 1;
      else requeued += 1;
    }

    return { requeued, deadLettered };
  }
}
