import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TENANT_SCOPED_MODELS } from './tenant-scoped-models';

describe('TENANT_SCOPED_MODELS', () => {
  it('includes customer assignment messages for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('CustomerAssignmentMessage'), true);
  });

  it('includes user invitations for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('UserInvitation'), true);
  });

  it('includes work sessions for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('WorkSession'), true);
  });

  it('includes vehicle equipment for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('VehicleEquipment'), true);
  });

  it('includes fleet analytics models for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('FleetTrip'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('FleetDrivingEvent'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('FleetFuelEntry'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('FleetMaintenanceRule'), true);
  });
});
