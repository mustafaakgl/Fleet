-- Faz 12 ek sartname — onay yasam dongusu.
--
-- ONCEKI MIGRATION DEGISTIRILMEDI (20260818140000). Bu ayri ve ileri yonlu
-- bir adim.
--
-- VERI KAYBI YOK: tablo ya da kolon dusurulmuyor, satir silinmiyor. Tek
-- "dusurulen" sey `approval_tasks.proposalId` uzerindeki TEKIL indeks —
-- veri degil, KISIT. Bilincli: onay iliskisi 1:1'den 1:n'e aciliyor ki
-- gelecekte cok adimli onay (once ofis, sonra muhasebe) veri tasimadan
-- eklenebilsin. Yerine (proposalId, sequence) tekilligi geliyor, yani ayni
-- adim iki kez acilamiyor.
-- CreateEnum
CREATE TYPE "ApprovalTaskStatus" AS ENUM ('open', 'decided', 'closed_expired');

-- CreateEnum
CREATE TYPE "AutomationRejectionCategory" AS ENUM ('incorrect_match', 'incorrect_value', 'duplicate', 'insufficient_evidence', 'unsafe_or_untrusted', 'other');

-- DropIndex
DROP INDEX "approval_tasks_proposalId_key";

-- AlterTable
ALTER TABLE "approval_tasks" ADD COLUMN     "assignedRole" TEXT,
ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "rejectionCategory" "AutomationRejectionCategory",
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "ApprovalTaskStatus" NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "automation_correction_events" ADD COLUMN     "rejectionCategory" "AutomationRejectionCategory";

-- CreateIndex
CREATE INDEX "approval_tasks_proposalId_idx" ON "approval_tasks"("proposalId");

-- CreateIndex
CREATE INDEX "approval_tasks_tenantId_status_idx" ON "approval_tasks"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_tasks_proposalId_sequence_key" ON "approval_tasks"("proposalId", "sequence");

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

