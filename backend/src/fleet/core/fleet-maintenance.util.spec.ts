import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMaintenanceRuleStatus } from './fleet-maintenance.util';

describe('fleet-maintenance.util', () => {
  it('computes remaining km until the next interval', () => {
    const status = computeMaintenanceRuleStatus(
      {
        id: 'rule-1',
        name: 'Oil change',
        intervalKm: 15000,
        intervalDays: null,
        lastDoneAtKm: 50000,
        lastDoneAtDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      64500,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    assert.equal(status.remainingKm, 500);
    assert.equal(status.status, 'due_soon');
  });

  it('marks km-based maintenance as overdue', () => {
    const status = computeMaintenanceRuleStatus(
      {
        id: 'rule-2',
        name: 'Brake check',
        intervalKm: 10000,
        intervalDays: null,
        lastDoneAtKm: 30000,
        lastDoneAtDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      41000,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    assert.equal(status.remainingKm, -1000);
    assert.equal(status.status, 'overdue');
  });

  it('computes remaining days for time-based rules', () => {
    const status = computeMaintenanceRuleStatus(
      {
        id: 'rule-3',
        name: 'Inspection',
        intervalKm: null,
        intervalDays: 365,
        lastDoneAtKm: null,
        lastDoneAtDate: new Date('2025-06-01T00:00:00.000Z'),
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      },
      10000,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    assert.ok(status.remainingDays != null);
    assert.equal(status.status, 'overdue');
  });
});
