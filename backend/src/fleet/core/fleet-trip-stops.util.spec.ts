import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveTripStops } from './fleet-trip-stops.util';

describe('fleet-trip-stops.util', () => {
  it('does not create a stop below the 5 minute threshold', () => {
    const stops = deriveTripStops([
      {
        tripId: 'trip-1',
        startedAt: new Date('2026-06-12T08:00:00.000Z'),
        endedAt: new Date('2026-06-12T08:30:00.000Z'),
        startCoordinate: null,
        endCoordinate: null,
        routeStartLabel: 'A',
        routeEndLabel: 'B',
      },
      {
        tripId: 'trip-2',
        startedAt: new Date('2026-06-12T08:34:59.000Z'),
        endedAt: new Date('2026-06-12T09:00:00.000Z'),
        startCoordinate: null,
        endCoordinate: null,
        routeStartLabel: 'C',
        routeEndLabel: 'D',
      },
    ]);

    assert.equal(stops.length, 0);
  });

  it('creates a stop at exactly five minutes', () => {
    const stops = deriveTripStops([
      {
        tripId: 'trip-1',
        startedAt: new Date('2026-06-12T08:00:00.000Z'),
        endedAt: new Date('2026-06-12T08:30:00.000Z'),
        startCoordinate: null,
        endCoordinate: { lat: 52.5, lng: 13.4 },
        routeStartLabel: 'A',
        routeEndLabel: 'Depot',
      },
      {
        tripId: 'trip-2',
        startedAt: new Date('2026-06-12T08:35:00.000Z'),
        endedAt: new Date('2026-06-12T09:00:00.000Z'),
        startCoordinate: null,
        endCoordinate: null,
        routeStartLabel: 'Customer',
        routeEndLabel: 'D',
      },
    ]);

    assert.equal(stops.length, 1);
    assert.equal(stops[0]?.durationS, 300);
    assert.equal(stops[0]?.label, 'Depot');
  });

  it('skips stops across a day boundary', () => {
    const stops = deriveTripStops([
      {
        tripId: 'trip-1',
        startedAt: new Date('2026-06-12T23:20:00.000Z'),
        endedAt: new Date('2026-06-12T23:58:00.000Z'),
        startCoordinate: null,
        endCoordinate: null,
        routeStartLabel: 'A',
        routeEndLabel: 'B',
      },
      {
        tripId: 'trip-2',
        startedAt: new Date('2026-06-13T00:08:00.000Z'),
        endedAt: new Date('2026-06-13T01:00:00.000Z'),
        startCoordinate: null,
        endCoordinate: null,
        routeStartLabel: 'C',
        routeEndLabel: 'D',
      },
    ]);

    assert.equal(stops.length, 0);
  });
});