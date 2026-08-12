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

  it('includes vehicle fuel compatibility for tenant isolation', () => {
    // Surucu ucu istasyon filtresini bu tabloya gore kuruyor: kapsam disi
    // kalirsa baska kiracinin araci icin fiyat filtrelenebilir hale gelir.
    assert.equal(TENANT_SCOPED_MODELS.has('VehicleFuelCompatibility'), true);
  });

  it('includes telematics device models for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('Device'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('VehicleTelemetryLatest'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('VehicleDtc'), true);
  });

  it('includes tachograph compliance models for tenant isolation', () => {
    assert.equal(TENANT_SCOPED_MODELS.has('DddFile'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('TachoProviderCredential'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('TachoActivity'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('TachoInfringement'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('TachoDownloadSchedule'), true);
    assert.equal(TENANT_SCOPED_MODELS.has('TelemetryQuarantine'), true);
  });

  it('includes every outgoing invoicing model for tenant isolation', () => {
    const models = [
      'TenantBillingProfile',
      'RateCard',
      'RateCardItem',
      'Invoice',
      'InvoiceLine',
      'InvoiceAssignmentClaim',
      'InvoiceNumberSequence',
      'InvoicePayment',
      'InvoiceDeliveryAttempt',
      'InvoiceAuditEvent',
      'DunningNotice',
      'DatevExport',
    ];

    for (const model of models) {
      assert.equal(TENANT_SCOPED_MODELS.has(model), true, `${model} must be tenant scoped`);
    }
  });
});
