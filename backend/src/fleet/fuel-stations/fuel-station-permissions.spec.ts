import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRES_WRITE_KEY } from '../../common/decorators/requires-write.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES, type UserRole } from '../../common/utils/permissions';
import { VehiclesController } from '../../vehicles/vehicles.controller';
import {
  MAX_FUEL_STATION_RADIUS_KM,
  MIN_FUEL_STATION_RADIUS_KM,
  NearbyFuelStationsQueryDto,
} from './dto/nearby-fuel-stations.query';
import { FuelStationDriverController } from './fuel-station.controller';

/** Handler'in metadata'sini isim uzerinden okur. */
function handler(controller: new (...args: never[]) => object, methodName: string): object {
  const value: unknown = Reflect.get(controller.prototype as object, methodName);
  assert.equal(typeof value, 'function', `${methodName} handler not found`);
  return value as object;
}

describe('driver fuel station endpoint — access', () => {
  it('is mounted at driver/fuel-stations/nearby', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, FuelStationDriverController), 'driver/fuel-stations');
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler(FuelStationDriverController, 'nearby')), 'nearby');
    assert.equal(
      Reflect.getMetadata(METHOD_METADATA, handler(FuelStationDriverController, 'nearby')),
      RequestMethod.GET,
    );
  });

  it('is restricted to the driver role', () => {
    const roles = (Reflect.getMetadata(ROLES_KEY, FuelStationDriverController) ?? []) as UserRole[];
    assert.deepEqual(roles, ['driver']);
  });

  it('exposes no vehicle field a driver could use to pick another vehicle', () => {
    // Global ValidationPipe forbidNonWhitelisted:true ile calisiyor (bkz.
    // bootstrap/create-app.ts): DTO'da olmayan bir alan gonderilirse istek 400
    // ile REDDEDILIR. Yani "vehicleId alani yok" iddiasi gercek bir korumadir,
    // sadece belge degil.
    const dtoFields = Object.getOwnPropertyNames(new NearbyFuelStationsQueryDto());
    for (const forbidden of ['vehicleId', 'vehicle_id', 'plateNumber']) {
      assert.equal(dtoFields.includes(forbidden), false, `${forbidden} must not be accepted`);
    }
  });

  it('bounds the radius on both ends', () => {
    assert.equal(MIN_FUEL_STATION_RADIUS_KM, 1);
    // Ust sinir saglayici sozlesmesiyle ayni olmali, aksi halde 25 ustu her
    // istek saglayicidan hata ile doner.
    assert.equal(MAX_FUEL_STATION_RADIUS_KM, 25);
  });
});

describe('office fuel compatibility endpoints — access', () => {
  it('keeps reading within the operational roles of the vehicles controller', () => {
    const roles = (Reflect.getMetadata(ROLES_KEY, VehiclesController) ?? []) as UserRole[];
    assert.deepEqual([...roles].sort(), [...OPERATIONAL_ROLES].sort());
    // Surucu bu controller'a hicbir sekilde giremez.
    assert.equal(roles.includes('driver' as UserRole), false);
  });

  it('requires write permission for the replace endpoint', () => {
    const replace = handler(VehiclesController, 'replaceFuelCompatibility');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, replace), RequestMethod.PUT);
    assert.equal(
      Reflect.getMetadata(REQUIRES_WRITE_KEY, replace),
      true,
      'PUT fuel-compatibility must be guarded by @RequiresWrite()',
    );
  });

  it('does not require write permission for the read endpoint', () => {
    const read = handler(VehiclesController, 'getFuelCompatibility');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, read), RequestMethod.GET);
    assert.equal(Reflect.getMetadata(REQUIRES_WRITE_KEY, read), undefined);
  });

  it('leaves accounting able to read but not write', () => {
    // WriteRoleGuard yalnizca OPERATIONAL_WRITE_ROLES'e izin veriyor; muhasebe
    // o listede DEGIL, ama okuma listesinde var.
    assert.equal(OPERATIONAL_ROLES.includes('accounting'), true);
    assert.equal(OPERATIONAL_WRITE_ROLES.includes('accounting' as UserRole), false);
  });
});
