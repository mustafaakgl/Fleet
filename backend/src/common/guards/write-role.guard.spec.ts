import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { WriteRoleGuard } from './write-role.guard';
import { REQUIRES_WRITE_KEY, WRITE_EXTRA_ROLES_KEY } from '../decorators/requires-write.decorator';

/** Reflector taklidi: hangi metadata anahtarina ne donulecegini testte belirliyoruz. */
function reflectorFor(values: Record<string, unknown>) {
  return {
    getAllAndOverride: (key: string) => values[key],
  } as never;
}

function contextFor(role?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined, headers: {} }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

describe('WriteRoleGuard', () => {
  it('lets a write role through', () => {
    const guard = new WriteRoleGuard(reflectorFor({ [REQUIRES_WRITE_KEY]: true }));
    assert.equal(guard.canActivate(contextFor('office')), true);
  });

  it('blocks accounting by default', () => {
    // Muhasebe global yazma listesinde YOK; bu davranis korunmali.
    const guard = new WriteRoleGuard(reflectorFor({ [REQUIRES_WRITE_KEY]: true }));
    assert.throws(() => guard.canActivate(contextFor('accounting')), ForbiddenException);
  });

  it('lets accounting through when the endpoint extends the roles', () => {
    const guard = new WriteRoleGuard(
      reflectorFor({ [REQUIRES_WRITE_KEY]: true, [WRITE_EXTRA_ROLES_KEY]: ['accounting'] }),
    );
    assert.equal(guard.canActivate(contextFor('accounting')), true);
  });

  it('does not let an unrelated role in through the extension', () => {
    const guard = new WriteRoleGuard(
      reflectorFor({ [REQUIRES_WRITE_KEY]: true, [WRITE_EXTRA_ROLES_KEY]: ['accounting'] }),
    );
    assert.throws(() => guard.canActivate(contextFor('driver')), ForbiddenException);
    assert.throws(() => guard.canActivate(contextFor('customer')), ForbiddenException);
  });

  it('skips the check entirely on read endpoints', () => {
    const guard = new WriteRoleGuard(reflectorFor({}));
    assert.equal(guard.canActivate(contextFor('driver')), true);
    assert.equal(guard.canActivate(contextFor(undefined)), true);
  });

  it('rejects a request with no role at all', () => {
    const guard = new WriteRoleGuard(reflectorFor({ [REQUIRES_WRITE_KEY]: true }));
    assert.throws(() => guard.canActivate(contextFor(undefined)), ForbiddenException);
  });
});
