import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { describe, it } from 'node:test';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TachographController } from './tachograph.controller';
import type { TachographApiService } from './tachograph-api.service';

function actionContextFactory(role?: string): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, ['admin', 'boss', 'accounting'], handler);

  return {
    getClass: () => class PayrollController {},
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('tachograph payroll-flag authorization', () => {
  it('rejects driver role with a forbidden result', () => {
    const guard = new RolesGuard();

    assert.throws(() => guard.canActivate(actionContextFactory('driver')), ForbiddenException);
  });

  it('allows accounting role and the controller returns the service response', async () => {
    const guard = new RolesGuard();
    assert.equal(guard.canActivate(actionContextFactory('accounting')), true);

    const tachographApiService = {
      setPayrollFlag: async (tenantId: string, id: string, userId: string, payrollRelevant: boolean) => ({
        tenantId,
        id,
        userId,
        payrollRelevant,
      }),
    };

    const controller = new TachographController(
      {} as never,
      tachographApiService as unknown as TachographApiService,
      {} as never,
    );

    assert.deepEqual(
      await controller.setPayrollFlag('tenant-1', 'user-1', 'infr-1', true),
      { tenantId: 'tenant-1', id: 'infr-1', userId: 'user-1', payrollRelevant: true },
    );
  });
});
