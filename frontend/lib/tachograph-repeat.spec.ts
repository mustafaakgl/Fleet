import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeRepeatCounts,
  getRepeatCount,
  infringementAgeDays,
  topRepeatOffenders,
} from './tachograph-repeat';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const DRIVER = 'driver-1';

describe('computeRepeatCounts', () => {
  it('returns no badge count when fewer than 3 in window', () => {
    const items = [
      { id: '1', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-06-01T00:00:00Z' },
      { id: '2', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-05-01T00:00:00Z' },
    ];
    const counts = computeRepeatCounts(items, NOW);
    assert.equal(getRepeatCount(counts, DRIVER, 'insufficient_break'), 2);
  });

  it('counts exactly 3 for repeat badge threshold', () => {
    const items = [
      { id: '1', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-06-10T00:00:00Z' },
      { id: '2', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-05-10T00:00:00Z' },
      { id: '3', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-04-10T00:00:00Z' },
    ];
    const counts = computeRepeatCounts(items, NOW);
    assert.equal(getRepeatCount(counts, DRIVER, 'insufficient_break'), 3);
  });

  it('excludes infringements older than 91 days', () => {
    const items = [
      { id: '1', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-06-10T00:00:00Z' },
      { id: '2', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2026-03-20T00:00:00Z' },
      { id: '3', driverId: DRIVER, type: 'insufficient_break', occurredAt: '2025-12-01T00:00:00Z' },
    ];
    const counts = computeRepeatCounts(items, NOW);
    assert.equal(getRepeatCount(counts, DRIVER, 'insufficient_break'), 2);
  });
});

describe('topRepeatOffenders', () => {
  it('ranks by count descending', () => {
    const items = [
      {
        id: '1',
        driverId: 'a',
        type: 'insufficient_break',
        occurredAt: '2026-06-01T00:00:00Z',
        driver: { id: 'a', firstName: 'A', lastName: 'Driver' },
      },
      {
        id: '2',
        driverId: 'a',
        type: 'insufficient_break',
        occurredAt: '2026-05-01T00:00:00Z',
        driver: { id: 'a', firstName: 'A', lastName: 'Driver' },
      },
      {
        id: '3',
        driverId: 'a',
        type: 'insufficient_break',
        occurredAt: '2026-04-01T00:00:00Z',
        driver: { id: 'a', firstName: 'A', lastName: 'Driver' },
      },
    ];
    const top = topRepeatOffenders(items, { nowMs: NOW, minCount: 3 });
    assert.equal(top.length, 1);
    assert.equal(top[0]?.count, 3);
  });
});

describe('infringementAgeDays', () => {
  it('computes whole days since occurrence', () => {
    assert.equal(infringementAgeDays('2026-06-12T12:00:00Z', NOW), 3);
  });
});
