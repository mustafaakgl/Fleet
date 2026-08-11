import { describe, expect, it } from 'vitest';
import type { PickedLocation, TourDetail } from '@/lib/api';
import {
  buildCreatePayload,
  buildTourSummary,
  emptyStop,
  formatDuration,
  moveStop,
  orderedStops,
  removeStop,
  toPlannedStartAt,
  tourSavings,
  unreachableStops,
  validateTourForm,
  type TourBuilderForm,
  type TourBuilderStop,
} from '@/lib/tour-builder';

const UNITS = { hour: 'sa', minute: 'dk' };

function picked(id: string): PickedLocation {
  return {
    id,
    rawAddress: `${id} yolu 1`,
    latitude: 51.4,
    longitude: 6.7,
    truckAccess: 'reachable',
  } as PickedLocation;
}

function stopWith(key: string, overrides: Partial<TourBuilderStop> = {}): TourBuilderStop {
  return { ...emptyStop(key), location: picked(key), ...overrides };
}

function formWith(overrides: Partial<TourBuilderForm> = {}): TourBuilderForm {
  return {
    driverId: 'driver-1',
    company: 'Musterspedition',
    vehicle: 'DU-AB-123',
    startDate: '2026-08-12',
    startTime: '07:00',
    start: stopWith('depot'),
    stops: [stopWith('a'), stopWith('b')],
    returnToStart: false,
    name: '',
    ...overrides,
  };
}

describe('moveStop', () => {
  const stops = [stopWith('a'), stopWith('b'), stopWith('c')];

  it('moves a stop down', () => {
    expect(moveStop(stops, 0, 2).map((s) => s.key)).toEqual(['b', 'c', 'a']);
  });

  it('moves a stop up', () => {
    expect(moveStop(stops, 2, 0).map((s) => s.key)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list untouched for a no-op or out-of-range move', () => {
    expect(moveStop(stops, 1, 1)).toBe(stops);
    expect(moveStop(stops, -1, 0)).toBe(stops);
    expect(moveStop(stops, 0, 9)).toBe(stops);
  });

  it('does not mutate the original list', () => {
    const before = stops.map((s) => s.key);
    moveStop(stops, 0, 2);
    expect(stops.map((s) => s.key)).toEqual(before);
  });
});

describe('removeStop', () => {
  it('drops only the matching stop', () => {
    const stops = [stopWith('a'), stopWith('b')];
    expect(removeStop(stops, 'a').map((s) => s.key)).toEqual(['b']);
  });
});

describe('validateTourForm', () => {
  it('accepts a complete form', () => {
    expect(validateTourForm(formWith())).toEqual([]);
  });

  it('rejects a start address that was typed but never picked', () => {
    // location null demek: kullanici yazdi ama oneriye tiklamadi. Gonderirsek
    // sunucuda koordinatsiz durak olusur.
    const form = formWith({ start: emptyStop('depot') });
    expect(validateTourForm(form)).toContain('start_missing');
  });

  it('rejects a stop without a picked address', () => {
    const form = formWith({ stops: [stopWith('a'), emptyStop('b')] });
    expect(validateTourForm(form)).toContain('stop_without_address');
  });

  it('rejects an empty stop list', () => {
    expect(validateTourForm(formWith({ stops: [] }))).toContain('no_stops');
  });

  it('rejects a time window that ends before it starts', () => {
    const form = formWith({
      stops: [stopWith('a', { windowStart: '14:00', windowEnd: '09:00' })],
    });
    expect(validateTourForm(form)).toContain('invalid_window');
  });

  it('accepts a half-open window', () => {
    const form = formWith({ stops: [stopWith('a', { windowStart: '09:00', windowEnd: '' })] });
    expect(validateTourForm(form)).toEqual([]);
  });
});

describe('buildCreatePayload', () => {
  it('sends location ids, never raw addresses', () => {
    const payload = buildCreatePayload(formWith());

    expect(payload.start).toEqual({ location_id: 'depot' });
    expect(payload.stops).toEqual([{ location_id: 'a' }, { location_id: 'b' }]);
    expect(JSON.stringify(payload)).not.toContain('yolu 1');
  });

  it('omits optional fields instead of sending empty values', () => {
    const payload = buildCreatePayload(formWith());

    expect(payload.name).toBeUndefined();
    expect(payload.stops[0].service_minutes).toBeUndefined();
    expect(payload.stops[0].window_start).toBeUndefined();
  });

  it('carries service time, window and note when they are set', () => {
    const form = formWith({
      stops: [
        stopWith('a', {
          serviceMinutes: 20,
          windowStart: '09:00',
          windowEnd: '11:00',
          note: 'Rampe 3',
        }),
      ],
    });

    expect(buildCreatePayload(form).stops[0]).toEqual({
      location_id: 'a',
      label: 'Rampe 3',
      service_minutes: 20,
      window_start: '09:00',
      window_end: '11:00',
    });
  });

  it('passes the return-to-start flag through', () => {
    expect(buildCreatePayload(formWith({ returnToStart: true })).return_to_start).toBe(true);
  });
});

describe('toPlannedStartAt', () => {
  it('reads the time as local, not UTC', () => {
    const iso = toPlannedStartAt('2026-08-12', '07:00');
    expect(iso).toBe(new Date('2026-08-12T07:00').toISOString());
  });

  it('returns undefined when either half is missing', () => {
    expect(toPlannedStartAt('', '07:00')).toBeUndefined();
    expect(toPlannedStartAt('2026-08-12', '')).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(275, UNITS)).toBe('4 sa 35 dk');
  });

  it('drops the hour part below an hour', () => {
    expect(formatDuration(35, UNITS)).toBe('35 dk');
  });

  it('drops the minute part on a whole hour', () => {
    expect(formatDuration(120, UNITS)).toBe('2 sa');
  });

  it('returns null when the duration is unknown', () => {
    expect(formatDuration(null, UNITS)).toBeNull();
  });
});

describe('buildTourSummary', () => {
  const labels = { title: 'Çok duraklı rota', stops: 'durak', ...UNITS };

  it('builds the cell summary', () => {
    expect(buildTourSummary({ stopCount: 9, distanceKm: 186, durationMinutes: 275 }, labels)).toBe(
      'Çok duraklı rota · 9 durak · 186 km · 4 sa 35 dk',
    );
  });

  it('omits distance and duration before optimisation instead of showing zero', () => {
    // "0 km" yazmak rotanin bos oldugunu dusundururdu.
    expect(
      buildTourSummary({ stopCount: 3, distanceKm: null, durationMinutes: null }, labels),
    ).toBe('Çok duraklı rota · 3 durak');
  });
});

describe('tourSavings', () => {
  function tour(overrides: Partial<TourDetail>): TourDetail {
    return {
      baselineDistanceKm: 200,
      plannedDistanceKm: 170,
      stops: [],
      ...overrides,
    } as TourDetail;
  }

  it('reports what the optimiser saved', () => {
    const savings = tourSavings(tour({}));
    expect(savings?.savedKm).toBe(30);
    expect(savings?.percent).toBeCloseTo(15);
  });

  it('returns null without a baseline to compare against', () => {
    expect(tourSavings(tour({ baselineDistanceKm: null }))).toBeNull();
  });

  it('reports a negative saving rather than hiding it', () => {
    // Optimizasyon uzun rota uretmisse dispatcher bunu gormeli.
    expect(tourSavings(tour({ plannedDistanceKm: 230 }))?.savedKm).toBe(-30);
  });
});

describe('stop helpers', () => {
  const tour = {
    stops: [
      { id: 'b', sequence: 2, truckAccess: 'unreachable' },
      { id: 'a', sequence: 1, truckAccess: 'reachable' },
    ],
  } as TourDetail;

  it('sorts stops by visit order', () => {
    expect(orderedStops(tour).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('surfaces stops a truck cannot reach', () => {
    expect(unreachableStops(tour).map((s) => s.id)).toEqual(['b']);
  });
});
