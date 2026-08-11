import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TourService, type TourStopInput } from './tour.service';

/**
 * Serbest duraklu tur kurulumu ve optimizasyon sonrasi ETA yazimi.
 *
 * Veritabani ve Valhalla disaridan veriliyor: sinanan sey is kurali, altyapi
 * degil. Ozellikle iki davranis civileniyor — baska kiracinin Location'ina
 * durak baglanamamasi ve varis saatlerinin gercekten KAYDEDILMESI (alanlar
 * sema'da aylardir duruyordu ama hicbir yer yazmiyordu).
 */

type StopRow = {
  id: string;
  sequence: number;
  kind: string;
  assignmentId: string | null;
  serviceMinutes: number;
  location: { latitude: number | null; longitude: number | null };
};

function location(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    rawAddress: `${id} caddesi 1, Duisburg`,
    latitude: 51.44,
    longitude: 6.7,
    truckAccess: 'reachable',
    ...overrides,
  };
}

function buildCreateService(options: {
  knownLocationIds?: string[];
  resolved?: Record<string, ReturnType<typeof location>>;
}) {
  const createdStops: Array<Record<string, unknown>> = [];
  const createdTours: Array<Record<string, unknown>> = [];
  const unscopedCalls: string[] = [];

  const tx = {
    tour: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdTours.push(data);
        return { id: 'tour-1', ...data };
      },
    },
    tourStop: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        createdStops.push(...data);
        return { count: data.length };
      },
    },
  };

  const prisma = {
    location: {
      findFirst: async ({ where }: { where: { id?: string } }) => {
        const known = options.knownLocationIds ?? [];
        return where.id && known.includes(where.id) ? location(where.id) : null;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    get unscoped() {
      unscopedCalls.push('accessed');
      return {};
    },
  };

  const routing = {
    resolveLocation: async ({ rawAddress }: { rawAddress: string }) =>
      options.resolved?.[rawAddress] ?? location(`loc-${rawAddress}`),
  };

  const service = new TourService(prisma as never, {} as never, routing as never);
  return { service, createdStops, createdTours, unscopedCalls };
}

const BASE = {
  workDate: new Date('2026-08-12T00:00:00.000Z'),
  createdById: 'user-1',
};

function stopInput(address: string, serviceMinutes = 0): TourStopInput {
  return { address, serviceMinutes };
}

describe('createFromStops — tenant isolation', () => {
  it('refuses a location id the tenant-scoped client cannot see', async () => {
    // Kapsamli istemci baska kiracinin kaydini dondurmez; dogrulama olmasaydi
    // o id'ye isaret eden bir TourStop sessizce yazilirdi.
    const { service } = buildCreateService({ knownLocationIds: ['mine'] });

    await assert.rejects(
      () =>
        service.createFromStops({
          ...BASE,
          start: { locationId: 'mine' },
          stops: [{ locationId: 'someone-elses' }],
        }),
      (error: { response?: { code?: string; locationId?: string } }) => {
        assert.equal(error.response?.code, 'location_not_found');
        assert.equal(error.response?.locationId, 'someone-elses');
        return true;
      },
    );
  });

  it('never reaches for the unscoped client', async () => {
    const { service, unscopedCalls } = buildCreateService({ knownLocationIds: ['mine'] });

    await service.createFromStops({
      ...BASE,
      start: { locationId: 'mine' },
      stops: [stopInput('Musterweg 1')],
    });

    assert.deepEqual(unscopedCalls, []);
  });
});

describe('createFromStops — stop validation', () => {
  it('rejects a stop that is not reachable by truck', async () => {
    // Optimizasyona birakilsaydi Valhalla tum turu opak bir 400 ile cokertir
    // ve hangi duragin suclu oldugu anlasilmazdi.
    const { service } = buildCreateService({
      resolved: {
        'Sperrweg 9': location('blocked', { truckAccess: 'unreachable', rawAddress: 'Sperrweg 9' }),
      },
    });

    await assert.rejects(
      () =>
        service.createFromStops({
          ...BASE,
          start: stopInput('Depot 1'),
          stops: [stopInput('Sperrweg 9')],
        }),
      (error: { response?: { code?: string; addresses?: string[] } }) => {
        assert.equal(error.response?.code, 'stops_not_reachable');
        assert.deepEqual(error.response?.addresses, ['Sperrweg 9']);
        return true;
      },
    );
  });

  it('rejects a stop whose address could not be geocoded', async () => {
    const { service } = buildCreateService({
      resolved: {
        'Nirgendwo 1': location('nogeo', {
          latitude: null,
          longitude: null,
          rawAddress: 'Nirgendwo 1',
        }),
      },
    });

    await assert.rejects(
      () =>
        service.createFromStops({
          ...BASE,
          start: stopInput('Depot 1'),
          stops: [stopInput('Nirgendwo 1')],
        }),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'stops_without_coordinates');
        return true;
      },
    );
  });

  it('rejects a stop with neither an address nor a location id', async () => {
    const { service } = buildCreateService({});

    await assert.rejects(
      () => service.createFromStops({ ...BASE, start: stopInput('Depot 1'), stops: [{}] }),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'stop_without_location');
        return true;
      },
    );
  });

  it('rejects a tour with no stops at all', async () => {
    const { service } = buildCreateService({});

    await assert.rejects(
      () => service.createFromStops({ ...BASE, start: stopInput('Depot 1'), stops: [] }),
      (error: { response?: { code?: string } }) => {
        assert.equal(error.response?.code, 'no_stops');
        return true;
      },
    );
  });
});

describe('createFromStops — fixed start and end', () => {
  it('pins the start as depot_start and free stops as waypoints', async () => {
    const { service, createdStops } = buildCreateService({});

    await service.createFromStops({
      ...BASE,
      start: stopInput('Depot 1'),
      stops: [stopInput('Kunde A'), stopInput('Kunde B')],
    });

    assert.deepEqual(
      createdStops.map((stop) => stop.kind),
      ['depot_start', 'waypoint', 'waypoint'],
    );
    assert.deepEqual(
      createdStops.map((stop) => stop.sequence),
      [1, 2, 3],
    );
  });

  it('adds a closing stop at the start location when the tour returns', async () => {
    const { service, createdStops } = buildCreateService({});

    await service.createFromStops({
      ...BASE,
      start: stopInput('Depot 1'),
      stops: [stopInput('Kunde A')],
      returnToStart: true,
    });

    assert.deepEqual(
      createdStops.map((stop) => stop.kind),
      ['depot_start', 'waypoint', 'depot_end'],
    );
    assert.equal(createdStops[0].locationId, createdStops[2].locationId);
  });

  it('uses a different closing location when one is given', async () => {
    const { service, createdStops } = buildCreateService({});

    await service.createFromStops({
      ...BASE,
      start: stopInput('Depot 1'),
      stops: [stopInput('Kunde A')],
      returnToStart: true,
      end: stopInput('Werkstatt'),
    });

    assert.equal(createdStops[2].kind, 'depot_end');
    assert.notEqual(createdStops[0].locationId, createdStops[2].locationId);
  });

  it('keeps the user order untouched — optimisation is a separate step', async () => {
    const { service, createdStops } = buildCreateService({});

    await service.createFromStops({
      ...BASE,
      start: stopInput('Depot 1'),
      stops: [stopInput('Kunde A'), stopInput('Kunde B')],
    });

    assert.deepEqual(
      createdStops.map((stop) => stop.plannedSequence),
      [1, 2, 3],
    );
  });

  it('carries the departure time onto the tour', async () => {
    const { service, createdTours } = buildCreateService({});
    const plannedStartAt = new Date('2026-08-12T06:00:00.000Z');

    await service.createFromStops({
      ...BASE,
      plannedStartAt,
      start: stopInput('Depot 1'),
      stops: [stopInput('Kunde A')],
    });

    assert.equal(createdTours[0].plannedStartAt, plannedStartAt);
  });
});

describe('optimizeSequence — ETA and leg detail are persisted', () => {
  function buildOptimizeService(plannedStartAt: Date | null) {
    const stops: StopRow[] = [
      {
        id: 's1',
        sequence: 1,
        kind: 'depot_start',
        assignmentId: null,
        serviceMinutes: 10,
        location: { latitude: 51.44, longitude: 6.7 },
      },
      {
        id: 's2',
        sequence: 2,
        kind: 'waypoint',
        assignmentId: null,
        serviceMinutes: 20,
        location: { latitude: 51.5, longitude: 6.9 },
      },
      {
        id: 's3',
        sequence: 3,
        kind: 'waypoint',
        assignmentId: null,
        serviceMinutes: 5,
        location: { latitude: 51.6, longitude: 7.1 },
      },
    ];

    const stopUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const tourUpdates: Array<Record<string, unknown>> = [];

    const tx = {
      tourStop: {
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          stopUpdates.push({ id: where.id, data });
          return {};
        },
      },
      tour: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          tourUpdates.push(data);
          return {};
        },
      },
    };

    const prisma = {
      tour: {
        findFirst: async () => ({
          id: 'tour-1',
          status: 'draft',
          plannedStartAt,
          baselineDistanceKm: null,
          baselineDurationMin: null,
          stops,
        }),
        update: async () => ({}),
      },
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    };

    const valhalla = {
      route: async () => ({
        ok: true,
        value: { distanceKm: 90, durationMinutes: 100, legs: [] },
      }),
      optimizedRoute: async () => ({
        ok: true,
        value: {
          order: [0, 1, 2],
          summary: {
            distanceKm: 80,
            durationMinutes: 75,
            legs: [
              { distanceKm: 30, durationMinutes: 45, shape: 'shape-a' },
              { distanceKm: 50, durationMinutes: 30, shape: 'shape-b' },
            ],
          },
        },
      }),
    };

    const service = new TourService(prisma as never, valhalla as never, {} as never);
    return { service, stopUpdates, tourUpdates };
  }

  it('writes arrival, departure, leg distance, duration and shape per stop', async () => {
    const { service, stopUpdates, tourUpdates } = buildOptimizeService(
      new Date('2026-08-12T06:00:00.000Z'),
    );

    const result = await service.optimizeSequence('tour-1');
    assert.equal(result.optimized, true);

    // Ilk gecis gecici negatif sira yaziyor; kalici degerler ikinci geciste.
    const finalUpdates = stopUpdates.filter((update) => 'plannedArrivalAt' in update.data);
    const byStop = new Map(finalUpdates.map((update) => [update.id, update.data]));

    // s1 kalkis noktasi: gelis bacagi yok, varis = kalkis ani
    assert.equal(byStop.get('s1')?.legDistanceKm, null);
    assert.equal(
      (byStop.get('s1')?.plannedArrivalAt as Date).toISOString(),
      '2026-08-12T06:00:00.000Z',
    );

    // s2: +45 dk yol -> 06:55 (s1'de 10 dk is), +20 dk is -> 07:15 kalkis
    assert.equal(byStop.get('s2')?.legDistanceKm, 30);
    assert.equal(byStop.get('s2')?.legDurationMin, 45);
    assert.equal(byStop.get('s2')?.legShape, 'shape-a');
    assert.equal(
      (byStop.get('s2')?.plannedArrivalAt as Date).toISOString(),
      '2026-08-12T06:55:00.000Z',
    );

    // s3: 07:15 + 30 dk -> 07:45
    assert.equal(
      (byStop.get('s3')?.plannedArrivalAt as Date).toISOString(),
      '2026-08-12T07:45:00.000Z',
    );

    // Turun bitisi son duragin isinin bitmesi: 07:45 + 5 dk
    const tourUpdate = tourUpdates.find((update) => 'plannedEndAt' in update);
    assert.equal((tourUpdate?.plannedEndAt as Date).toISOString(), '2026-08-12T07:50:00.000Z');
  });

  it('still records leg detail when the departure time is unknown', async () => {
    // Saat uretilemez ama mesafe/sure bilinir; ikisini birbirine baglamak
    // tur bilgisini gereksiz yere yok ederdi.
    const { service, stopUpdates, tourUpdates } = buildOptimizeService(null);

    await service.optimizeSequence('tour-1');

    const byStop = new Map(
      stopUpdates
        .filter((update) => 'plannedArrivalAt' in update.data)
        .map((update) => [update.id, update.data]),
    );

    assert.equal(byStop.get('s2')?.legDistanceKm, 30);
    assert.equal(byStop.get('s2')?.plannedArrivalAt, null);

    const tourUpdate = tourUpdates.find((update) => 'plannedEndAt' in update);
    assert.equal(tourUpdate?.plannedEndAt, null);
  });
});
