import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DriverVehicleService, isAmbiguousActiveTour } from './driver-vehicle.service';

/**
 * Aktif tur seciminin DETERMINISTIK olmasi ve `arrived` durak davranisi.
 *
 * Neden ayri dosya: bu iki kural rota sapmasinin dayanagi. Yanlis tur secilirse
 * surucu baska bir turun sapmasini gorur; `arrived` duraga rota kurulursa
 * "bulundugun yere git" gibi anlamsiz bir oneri uretilir.
 *
 * Veri katmani elle kuruluyor (TourService testlerinin ayni deseni), gercek
 * veritabani yok.
 */

type StopRow = {
  id: string;
  sequence: number;
  kind: string;
  status: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    street: string | null;
    rawAddress: string | null;
  };
};

type TourRow = {
  id: string;
  status: string;
  updatedAt: Date;
  workDate: Date;
  createdAt: Date;
  tenantId: string;
  driverId: string;
  stops: StopRow[];
};

function stop(overrides: Partial<StopRow> = {}): StopRow {
  return {
    id: 'stop-1',
    sequence: 0,
    kind: 'delivery',
    status: 'pending',
    location: {
      latitude: 51.5,
      longitude: 6.9,
      city: 'Oberhausen',
      street: 'Musterweg 1',
      rawAddress: 'Musterweg 1, Oberhausen',
    },
    ...overrides,
  };
}

function tour(overrides: Partial<TourRow> = {}): TourRow {
  return {
    id: 'tour-1',
    status: 'in_progress',
    updatedAt: new Date('2026-08-12T10:00:00.000Z'),
    workDate: new Date('2026-08-12T00:00:00.000Z'),
    createdAt: new Date('2026-08-12T06:00:00.000Z'),
    tenantId: 'tenant-a',
    driverId: 'drv-1',
    stops: [stop()],
    ...overrides,
  };
}

/**
 * Prisma'nin `findMany` davranisini taklit eder: WHERE filtresi + orderBy.
 *
 * orderBy GERCEKTEN uygulaniyor — aksi halde "deterministik siralama" testi
 * yalnizca sahte verinin dizi sirasini dogrulardi.
 */
function buildService(options: {
  tours: TourRow[];
  /** Kapsamli istemcinin kiraci sinirini taklit eder. */
  actingTenant?: string;
}) {
  const actingTenant = options.actingTenant ?? 'tenant-a';
  const queries: unknown[] = [];

  const prisma = {
    tour: {
      findMany: async (args: {
        where: { driverId: string; status: { in: string[] } };
        orderBy: Array<Record<string, 'asc' | 'desc'>>;
      }) => {
        queries.push(args);

        const filtered = options.tours.filter(
          (row) =>
            // Kapsamli istemci baska kiracinin turunu DONDURMEZ.
            row.tenantId === actingTenant &&
            row.driverId === args.where.driverId &&
            args.where.status.in.includes(row.status),
        );

        const sorted = [...filtered].sort((left, right) => {
          for (const rule of args.orderBy) {
            const [field, direction] = Object.entries(rule)[0] as [keyof TourRow, 'asc' | 'desc'];
            const a = left[field];
            const b = right[field];
            let comparison = 0;
            if (a instanceof Date && b instanceof Date) comparison = a.getTime() - b.getTime();
            else if (typeof a === 'string' && typeof b === 'string') comparison = a.localeCompare(b);
            if (comparison !== 0) return direction === 'asc' ? comparison : -comparison;
          }
          return 0;
        });

        return sorted.map((row) => ({
          id: row.id,
          status: row.status,
          updatedAt: row.updatedAt,
          stops: row.stops
            .filter((entry) => entry.status !== 'completed' && entry.status !== 'skipped')
            .sort((a, b) => a.sequence - b.sequence),
        }));
      },
    },
  };

  return { service: new DriverVehicleService(prisma as never), queries };
}

describe('active tour selection — status priority', () => {
  it('prefers in_progress over released and optimized', async () => {
    const { service } = buildService({
      tours: [
        tour({ id: 'opt', status: 'optimized' }),
        tour({ id: 'rel', status: 'released' }),
        tour({ id: 'run', status: 'in_progress' }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    assert.equal(isAmbiguousActiveTour(result), false);
    assert.equal(result && !isAmbiguousActiveTour(result) ? result.tourId : null, 'run');
  });

  it('falls back to released when no in_progress tour exists', async () => {
    const { service } = buildService({
      tours: [tour({ id: 'opt', status: 'optimized' }), tour({ id: 'rel', status: 'released' })],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    assert.equal(result && !isAmbiguousActiveTour(result) ? result.tourId : null, 'rel');
  });

  it('falls back to optimized when it is the only status present', async () => {
    const { service } = buildService({ tours: [tour({ id: 'opt', status: 'optimized' })] });

    const result = await service.resolveActiveTourNextStop('drv-1');
    assert.equal(result && !isAmbiguousActiveTour(result) ? result.tourId : null, 'opt');
  });

  it('returns null when the driver has no visible tour today', async () => {
    const { service } = buildService({
      tours: [tour({ id: 'draft', status: 'draft' }), tour({ id: 'done', status: 'completed' })],
    });

    assert.equal(await service.resolveActiveTourNextStop('drv-1'), null);
  });
});

describe('active tour selection — determinism', () => {
  it('resolves two released tours deterministically by workDate then createdAt', async () => {
    // Bolunmus vardiya: iki `released` tur normaldir. Secim SIRASIZ olmamali.
    const tours = [
      tour({
        id: 'afternoon',
        status: 'released',
        createdAt: new Date('2026-08-12T05:00:00.000Z'),
      }),
      tour({
        id: 'morning',
        status: 'released',
        createdAt: new Date('2026-08-12T08:00:00.000Z'),
      }),
    ];

    // Ayni girdi, iki farkli dizi sirasi -> AYNI sonuc.
    const first = await buildService({ tours }).service.resolveActiveTourNextStop('drv-1');
    const second = await buildService({ tours: [...tours].reverse() }).service.resolveActiveTourNextStop(
      'drv-1',
    );

    const idOf = (value: Awaited<ReturnType<DriverVehicleService['resolveActiveTourNextStop']>>) =>
      value && !isAmbiguousActiveTour(value) ? value.tourId : null;

    // createdAt azalan (ofis tur listesinin canonical sirasi) -> en yeni kayit.
    assert.equal(idOf(first), 'morning');
    assert.equal(idOf(second), 'morning');
  });

  it('falls back to a stable id tie-break when workDate and createdAt match', async () => {
    const shared = {
      status: 'released',
      workDate: new Date('2026-08-12T00:00:00.000Z'),
      createdAt: new Date('2026-08-12T06:00:00.000Z'),
    };
    const tours = [tour({ id: 'bbb', ...shared }), tour({ id: 'aaa', ...shared })];

    const idOf = (value: Awaited<ReturnType<DriverVehicleService['resolveActiveTourNextStop']>>) =>
      value && !isAmbiguousActiveTour(value) ? value.tourId : null;

    assert.equal(idOf(await buildService({ tours }).service.resolveActiveTourNextStop('drv-1')), 'aaa');
    assert.equal(
      idOf(await buildService({ tours: [...tours].reverse() }).service.resolveActiveTourNextStop('drv-1')),
      'aaa',
    );
  });

  it('asks the database for an explicit deterministic ordering', async () => {
    const { service, queries } = buildService({ tours: [tour()] });
    await service.resolveActiveTourNextStop('drv-1');

    const args = queries[0] as { orderBy: Array<Record<string, string>> };
    // Siralama sorguda acikca istenmeli; Prisma'nin dogal sirasina guvenilmez.
    assert.deepEqual(args.orderBy, [
      { workDate: 'asc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });
});

describe('active tour selection — ambiguity', () => {
  it('refuses to pick when two tours are in_progress at once', async () => {
    // Bir surucu iki turu birlikte suremez: veri anomalisi. Deterministik
    // secim TEKNIK olarak mumkun olsa da IS ANLAMINDA keyfi olurdu.
    const { service } = buildService({
      tours: [
        tour({ id: 'run-a', status: 'in_progress' }),
        tour({ id: 'run-b', status: 'in_progress' }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');

    assert.equal(isAmbiguousActiveTour(result), true);
    if (isAmbiguousActiveTour(result)) {
      assert.deepEqual([...result.tourIds].sort(), ['run-a', 'run-b']);
    }
  });

  it('is not ambiguous when a single in_progress tour outranks other statuses', async () => {
    const { service } = buildService({
      tours: [
        tour({ id: 'run', status: 'in_progress' }),
        tour({ id: 'rel-a', status: 'released' }),
        tour({ id: 'rel-b', status: 'released' }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    assert.equal(isAmbiguousActiveTour(result), false);
  });

  it('never returns a tour belonging to another tenant', async () => {
    const { service } = buildService({
      tours: [tour({ id: 'other-tenant', tenantId: 'tenant-b' })],
      actingTenant: 'tenant-a',
    });

    assert.equal(await service.resolveActiveTourNextStop('drv-1'), null);
  });

  it('never returns a tour belonging to another driver', async () => {
    const { service } = buildService({ tours: [tour({ id: 'other', driverId: 'drv-2' })] });

    assert.equal(await service.resolveActiveTourNextStop('drv-1'), null);
  });
});

describe('arrived stop handling', () => {
  it('reports the arrived stop as in service instead of routing to it', async () => {
    const { service } = buildService({
      tours: [
        tour({
          stops: [
            stop({ id: 'at-stop', sequence: 0, status: 'arrived' }),
            stop({ id: 'later', sequence: 1, status: 'pending' }),
          ],
        }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    assert.equal(isAmbiguousActiveTour(result), false);
    if (!result || isAmbiguousActiveTour(result)) throw new Error('expected a resolution');

    // Rota hedefi YOK.
    assert.equal(result.nextStop, null);
    assert.equal(result.nextStopLocationMissing, false);
    // Guvenli ozet var, koordinat YOK.
    assert.equal(result.currentStopInService?.id, 'at-stop');
    assert.equal('latitude' in (result.currentStopInService ?? {}), false);
    assert.equal('longitude' in (result.currentStopInService ?? {}), false);
  });

  it('does not silently skip to the next pending stop', async () => {
    const { service } = buildService({
      tours: [
        tour({
          stops: [
            stop({ id: 'at-stop', sequence: 0, status: 'arrived' }),
            stop({ id: 'later', sequence: 1, status: 'pending' }),
          ],
        }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    if (!result || isAmbiguousActiveTour(result)) throw new Error('expected a resolution');

    // Sonraki pending duraga gecmek, surucunun mevcut hizmeti bitirdigini
    // VARSAYMAK olurdu.
    assert.equal(result.nextStop, null);
  });

  it('resolves the next pending stop once the arrived stop is completed', async () => {
    const { service } = buildService({
      tours: [
        tour({
          stops: [
            // Tamamlanmis durak sorgudan zaten duser.
            stop({ id: 'at-stop', sequence: 0, status: 'completed' }),
            stop({ id: 'later', sequence: 1, status: 'pending' }),
          ],
        }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    if (!result || isAmbiguousActiveTour(result)) throw new Error('expected a resolution');

    assert.equal(result.nextStop?.id, 'later');
    assert.equal(result.currentStopInService, null);
  });

  it('also resolves normally after the arrived stop is skipped', async () => {
    const { service } = buildService({
      tours: [
        tour({
          stops: [
            stop({ id: 'at-stop', sequence: 0, status: 'skipped' }),
            stop({ id: 'later', sequence: 1, status: 'pending' }),
          ],
        }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    if (!result || isAmbiguousActiveTour(result)) throw new Error('expected a resolution');

    assert.equal(result.nextStop?.id, 'later');
  });

  it('keeps a pending first stop as the route target', async () => {
    const { service } = buildService({
      tours: [tour({ stops: [stop({ id: 'target', sequence: 0, status: 'pending' })] })] ,
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    if (!result || isAmbiguousActiveTour(result)) throw new Error('expected a resolution');

    assert.equal(result.nextStop?.id, 'target');
    assert.equal(result.currentStopInService, null);
  });

  it('still reports a missing coordinate for a pending stop', async () => {
    const { service } = buildService({
      tours: [
        tour({
          stops: [
            stop({
              id: 'nocoords',
              status: 'pending',
              location: {
                latitude: null,
                longitude: null,
                city: 'Oberhausen',
                street: null,
                rawAddress: null,
              },
            }),
          ],
        }),
      ],
    });

    const result = await service.resolveActiveTourNextStop('drv-1');
    if (!result || isAmbiguousActiveTour(result)) throw new Error('expected a resolution');

    assert.equal(result.nextStop, null);
    assert.equal(result.nextStopLocationMissing, true);
    assert.equal(result.currentStopInService, null);
  });
});
