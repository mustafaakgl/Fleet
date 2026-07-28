import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CompanyEmailsService } from '../company-emails/company-emails.service';
import { DepartureCheckService } from '../departure-check/departure-check.service';
import { LicenseComplianceService } from '../license-compliance/license-compliance.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService, mapAssignmentTransactionError } from './assignments.service';

function createService(prisma: object): AssignmentsService {
  return new AssignmentsService(
    prisma as unknown as PrismaService,
    {} as unknown as CompanyEmailsService,
    { logAction: async () => undefined } as unknown as AuditService,
    {} as unknown as DriverNotifyService,
    {} as unknown as LicenseComplianceService,
    {} as unknown as DepartureCheckService,
  );
}

describe('AssignmentsService.bulkComplete', () => {
  it('completes open assignments and skips finished or missing ones', async () => {
    const updated: string[] = [];
    const service = createService({
      assignment: {
        findMany: async () => [
          { id: 'open-1', status: AssignmentStatus.planned },
          { id: 'open-2', status: AssignmentStatus.in_progress },
          { id: 'done-1', status: AssignmentStatus.completed },
          { id: 'cancelled-1', status: AssignmentStatus.cancelled },
        ],
        update: async ({ where }: { where: { id: string } }) => {
          updated.push(where.id);
          return { id: where.id };
        },
      },
    });

    const result = await service.bulkComplete([
      'open-1',
      'open-2',
      'done-1',
      'cancelled-1',
      'missing-1',
      'open-1',
    ]);

    assert.deepEqual(updated, ['open-1', 'open-2']);
    assert.equal(result.requested, 5);
    assert.equal(result.completedCount, 2);
    assert.deepEqual(result.skipped, [
      { id: 'done-1', reason: 'already_completed' },
      { id: 'cancelled-1', reason: 'cancelled' },
      { id: 'missing-1', reason: 'not_found' },
    ]);
  });
});

describe('mapAssignmentTransactionError', () => {
  it('maps Serializable write conflicts to HTTP conflict', () => {
    const error = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });

    assert.throws(() => mapAssignmentTransactionError(error), ConflictException);
  });

  it('rethrows unrelated failures unchanged', () => {
    const error = new Error('database unavailable');
    assert.throws(() => mapAssignmentTransactionError(error), error);
  });
});