-- Faz 12 — Ordivan otomasyonu ve connector temeli.
--
-- TAMAMEN EKLEMELI: tablo/kolon dusurulmuyor, veri silinmiyor, mevcut hicbir
-- indeks degistirilmiyor. Yalnizca yeni enum, tablo ve indeksler ekleniyor.
--
-- BU KATMAN DOMAIN'E YAZMAZ: asagidaki tablolarin hicbiri Assignment, Tour,
-- ServiceRecord ya da fatura uretmez. Ciktilari yalnizca oneri ve insanin
-- verdigi karardir (bkz. docs/ordivan-domain-mapping.md).
-- CreateEnum
CREATE TYPE "OrdivanConnectorStatus" AS ENUM ('pending_enrollment', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('queued', 'leased', 'running', 'completed', 'failed', 'cancelled', 'dead_letter');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AutomationProposalStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected');

-- CreateEnum
CREATE TYPE "AutomationCheckStatus" AS ENUM ('verified', 'failed', 'unknown');

-- CreateEnum
CREATE TYPE "AutomationCorrectionCategory" AS ENUM ('accepted_as_is', 'value_corrected', 'field_added', 'field_removed', 'rejected_entirely');

-- CreateTable
CREATE TABLE "ordivan_connectors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "displayName" TEXT NOT NULL,
    "status" "OrdivanConnectorStatus" NOT NULL DEFAULT 'pending_enrollment',
    "enrollmentCodeHash" TEXT NOT NULL,
    "enrollmentExpiresAt" TIMESTAMP(3) NOT NULL,
    "enrolledAt" TIMESTAMP(3),
    "credentialHash" TEXT,
    "credentialPrefix" TEXT,
    "credentialIssuedAt" TIMESTAMP(3),
    "credentialRotatedAt" TIMESTAMP(3),
    "credentialRevokedAt" TIMESTAMP(3),
    "capabilities" TEXT[],
    "connectorVersion" TEXT,
    "protocolVersion" TEXT,
    "platform" TEXT,
    "architecture" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordivan_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "jobType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "requiredCapability" TEXT NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'queued',
    "leasedByConnectorId" TEXT,
    "leasedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "jobId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'running',
    "credentialScope" TEXT[],
    "capabilities" TEXT[],
    "toolset" TEXT[],
    "connectorVersion" TEXT,
    "protocolVersion" TEXT,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "schemaVersion" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_proposals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "jobId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "proposalType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "AutomationProposalStatus" NOT NULL DEFAULT 'pending_review',
    "payload" JSONB NOT NULL,
    "confidence" JSONB,
    "evidence" JSONB,
    "checks" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "proposalId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "decision" "ApprovalDecision",
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "reviewDurationMs" INTEGER,
    "changedFieldCount" INTEGER NOT NULL DEFAULT 0,
    "criticalLowConfidenceVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_correction_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "proposalId" TEXT NOT NULL,
    "approvalTaskId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "changed" BOOLEAN NOT NULL,
    "category" "AutomationCorrectionCategory" NOT NULL,
    "previousConfidence" DECIMAL(4,3),
    "criticalLowConfidence" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByReviewer" BOOLEAN NOT NULL DEFAULT false,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "schemaVersion" INTEGER,
    "reviewDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_correction_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordivan_connectors_enrollmentCodeHash_key" ON "ordivan_connectors"("enrollmentCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "ordivan_connectors_credentialHash_key" ON "ordivan_connectors"("credentialHash");

-- CreateIndex
CREATE INDEX "ordivan_connectors_tenantId_idx" ON "ordivan_connectors"("tenantId");

-- CreateIndex
CREATE INDEX "ordivan_connectors_tenantId_status_idx" ON "ordivan_connectors"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ordivan_connectors_tenantId_displayName_key" ON "ordivan_connectors"("tenantId", "displayName");

-- CreateIndex
CREATE INDEX "automation_jobs_tenantId_idx" ON "automation_jobs"("tenantId");

-- CreateIndex
CREATE INDEX "automation_jobs_tenantId_status_createdAt_idx" ON "automation_jobs"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "automation_jobs_leasedByConnectorId_idx" ON "automation_jobs"("leasedByConnectorId");

-- CreateIndex
CREATE INDEX "automation_jobs_status_leaseExpiresAt_idx" ON "automation_jobs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "agent_runs_tenantId_idx" ON "agent_runs"("tenantId");

-- CreateIndex
CREATE INDEX "agent_runs_connectorId_startedAt_idx" ON "agent_runs"("connectorId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_jobId_attempt_key" ON "agent_runs"("jobId", "attempt");

-- CreateIndex
CREATE INDEX "automation_proposals_tenantId_idx" ON "automation_proposals"("tenantId");

-- CreateIndex
CREATE INDEX "automation_proposals_tenantId_status_createdAt_idx" ON "automation_proposals"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "automation_proposals_jobId_idx" ON "automation_proposals"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_tasks_proposalId_key" ON "approval_tasks"("proposalId");

-- CreateIndex
CREATE INDEX "approval_tasks_tenantId_idx" ON "approval_tasks"("tenantId");

-- CreateIndex
CREATE INDEX "approval_tasks_tenantId_decidedAt_idx" ON "approval_tasks"("tenantId", "decidedAt");

-- CreateIndex
CREATE INDEX "automation_correction_events_tenantId_idx" ON "automation_correction_events"("tenantId");

-- CreateIndex
CREATE INDEX "automation_correction_events_proposalId_idx" ON "automation_correction_events"("proposalId");

-- CreateIndex
CREATE INDEX "automation_correction_events_approvalTaskId_idx" ON "automation_correction_events"("approvalTaskId");

-- CreateIndex
CREATE INDEX "automation_correction_events_tenantId_category_createdAt_idx" ON "automation_correction_events"("tenantId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "ordivan_connectors" ADD CONSTRAINT "ordivan_connectors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordivan_connectors" ADD CONSTRAINT "ordivan_connectors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_leasedByConnectorId_fkey" FOREIGN KEY ("leasedByConnectorId") REFERENCES "ordivan_connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "ordivan_connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_proposals" ADD CONSTRAINT "automation_proposals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_proposals" ADD CONSTRAINT "automation_proposals_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_proposals" ADD CONSTRAINT "automation_proposals_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "automation_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_correction_events" ADD CONSTRAINT "automation_correction_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_correction_events" ADD CONSTRAINT "automation_correction_events_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "automation_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_correction_events" ADD CONSTRAINT "automation_correction_events_approvalTaskId_fkey" FOREIGN KEY ("approvalTaskId") REFERENCES "approval_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

