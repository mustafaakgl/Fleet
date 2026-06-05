import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';

export type SafeAuditParams = {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function safeAuditLog(
  auditService: AuditService,
  params: SafeAuditParams,
): Promise<void> {
  try {
    await auditService.logAction(params);
  } catch (error) {
    console.warn('Audit log failed:', error);
  }
}

export function changedFieldNames(values: Record<string, unknown>): string[] {
  return Object.keys(values).filter((key) => values[key] !== undefined);
}
