UPDATE "CustomerAssignmentMessage" AS cam
SET "tenantId" = a."tenantId"
FROM "Assignment" AS a
WHERE cam."assignmentId" = a.id
  AND cam."tenantId" IS DISTINCT FROM a."tenantId";
