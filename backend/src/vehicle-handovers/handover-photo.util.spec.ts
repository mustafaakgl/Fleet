import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculatePhotoRequirement, normalizePlate } from './handover-photo.util';

describe('normalizePlate', () => {
  it('strips spaces and dashes and uppercases', () => {
    assert.equal(normalizePlate('ab-12 cd'), 'AB12CD');
    assert.equal(normalizePlate('  m-xy 123 '), 'MXY123');
  });
});

describe('calculatePhotoRequirement', () => {
  const vehicleA = 'vehicle-a';
  const vehicleB = 'vehicle-b';

  it('requires photos when vehicle changed', () => {
    assert.deepEqual(calculatePhotoRequirement(vehicleA, vehicleB), {
      photoRequired: true,
      photoStatus: 'missing',
      status: 'pending',
    });
  });

  it('does not require photos when vehicle unchanged and no plate context', () => {
    assert.deepEqual(calculatePhotoRequirement(vehicleA, vehicleA), {
      photoRequired: false,
      photoStatus: 'not_required',
      status: 'completed',
    });
  });

  it('requires photos when plate changed even if vehicle id is the same', () => {
    assert.deepEqual(
      calculatePhotoRequirement({
        yesterdayVehicleId: vehicleA,
        currentVehicleId: vehicleA,
        yesterdayPlate: 'AB-12 CD',
        todayPlate: 'XY 99',
      }),
      {
        photoRequired: true,
        photoStatus: 'missing',
        status: 'pending',
      },
    );
  });

  it('treats normalized plates as equal', () => {
    assert.deepEqual(
      calculatePhotoRequirement({
        yesterdayVehicleId: vehicleA,
        currentVehicleId: vehicleA,
        yesterdayPlate: 'AB-12 CD',
        todayPlate: 'ab12cd',
      }),
      {
        photoRequired: false,
        photoStatus: 'not_required',
        status: 'completed',
      },
    );
  });

  it('does not require photos on first day without yesterday plate', () => {
    assert.deepEqual(
      calculatePhotoRequirement({
        yesterdayVehicleId: null,
        currentVehicleId: vehicleA,
        yesterdayPlate: null,
        todayPlate: 'AB 12',
      }),
      {
        photoRequired: false,
        photoStatus: 'not_required',
        status: 'completed',
      },
    );
  });
});
