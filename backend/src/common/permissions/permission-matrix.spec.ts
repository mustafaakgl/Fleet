import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AssignmentsController } from '../../assignments/assignments.controller';
import { CompaniesController } from '../../companies/companies.controller';
import { DriversController } from '../../drivers/drivers.controller';
import { UsersController } from '../../users/users.controller';
import { VehiclesController } from '../../vehicles/vehicles.controller';
import { REQUIRES_WRITE_KEY } from '../decorators/requires-write.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { OPERATIONAL_WRITE_ROLES, type UserRole } from '../utils/permissions';
import { PERMISSION_MATRIX } from './permission-matrix';

const controllers = {
  users: UsersController,
  drivers: DriversController,
  vehicles: VehiclesController,
  companies: CompaniesController,
  assignments: AssignmentsController,
};

const sorted = (roles: UserRole[]) => [...roles].sort();

describe('canonical permission matrix controller drift', () => {
  for (const [module, controller] of Object.entries(controllers)) {
    it(`${module} controller metadata matches its matrix entry`, () => {
      const permission = PERMISSION_MATRIX.find((entry) => entry.module === module);
      assert.ok(permission, `Missing permission matrix entry for ${module}`);

      const classRoles = (Reflect.getMetadata(ROLES_KEY, controller) ?? []) as UserRole[];
      assert.deepEqual(sorted(classRoles), sorted(permission.read));

      const effectiveWriteRoles = classRoles.filter((role) => OPERATIONAL_WRITE_ROLES.includes(role));
      assert.deepEqual(sorted(effectiveWriteRoles), sorted(permission.write));

      const prototype = controller.prototype as object;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === 'constructor') continue;
        const handler = Reflect.get(prototype, methodName) as unknown;
        if (typeof handler !== 'function' || Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
        if (requestMethod !== RequestMethod.GET) {
          assert.equal(
            Reflect.getMetadata(REQUIRES_WRITE_KEY, handler),
            true,
            `${module}.${methodName} must declare @RequiresWrite()`,
          );
        }
      }
    });
  }
});