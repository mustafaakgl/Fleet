CREATE TABLE "CustomerAssignmentMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "assignmentId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAssignmentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAssignmentMessage_tenantId_idx" ON "CustomerAssignmentMessage"("tenantId");
CREATE INDEX "CustomerAssignmentMessage_assignmentId_createdAt_idx" ON "CustomerAssignmentMessage"("assignmentId", "createdAt");
CREATE INDEX "CustomerAssignmentMessage_senderUserId_createdAt_idx" ON "CustomerAssignmentMessage"("senderUserId", "createdAt");

ALTER TABLE "CustomerAssignmentMessage" ADD CONSTRAINT "CustomerAssignmentMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAssignmentMessage" ADD CONSTRAINT "CustomerAssignmentMessage_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerAssignmentMessage" ADD CONSTRAINT "CustomerAssignmentMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
