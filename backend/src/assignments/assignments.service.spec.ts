import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapAssignmentTransactionError } from './assignments.service';

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