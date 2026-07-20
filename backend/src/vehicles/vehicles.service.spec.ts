import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapVehicleCreateError } from './vehicles.service';

describe('mapVehicleCreateError', () => {
  it('maps Prisma unique conflicts to HTTP conflict', () => {
    const error = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tenantId', 'plateNumber'] },
    });

    assert.ok(mapVehicleCreateError(error) instanceof ConflictException);
  });

  it('keeps unknown transaction failures internal', () => {
    assert.ok(mapVehicleCreateError(new Error('database unavailable')) instanceof InternalServerErrorException);
  });
});