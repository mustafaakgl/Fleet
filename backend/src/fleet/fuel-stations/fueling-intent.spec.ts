import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { FuelProductType, FuelProductUsage, Prisma } from '@prisma/client';
import {
  FLEET_OPERATING_TIME_ZONE,
  STANDALONE_INTENT_MAX_HOURS,
  endOfLocalDay,
  isSameSelection,
  resolveIntentExpiry,
} from './core/fueling-intent.util';
import { SelectFuelingIntentDto } from './dto/select-fueling-intent.dto';
import {
  FuelSelectionContextService,
  SELECTION_CONTEXT_TTL_SECONDS,
  toSelectionContextStation,
} from './fuel-selection-context.service';
import { FuelingIntentOfficeController } from './fueling-intent-office.controller';
import { FuelingIntentDriverController } from './fueling-intent.controller';
import { FuelingIntentService } from './fueling-intent.service';

/**
 * Gecici yakit duragi (FuelingIntent).
 *
 * Prisma, saglayici ve rota motoru MOCK: gercek ag ya da veritabani cagrisi
 * yok. Sinanan sey secim baglaminin guvenligi, idempotency, es zamanlilik,
 * tembel sure sonu ve — en onemlisi — TUR VERISINE HIC DOKUNULMADIGI.
 *
 * Sahte Prisma bilincli olarak "aptal degil": (tenantId, activeDriverKey)
 * tekil indeksini gercekten uyguluyor ve transaction hatasinda satirlari geri
 * aliyor. Aksi halde "iki aktif niyet olusamaz" testi yalnizca uygulama
 * kodunun kendi findFirst'unu dogrular, asil koruma olan indeksi degil.
 */

const NOW = new Date('2026-08-13T10:00:00.000Z');

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['tenantId', 'activeDriverKey'] },
  });
}

type Row = Record<string, unknown>;

/** Cok kucuk bir where eslestiricisi: esitlik, gt/lte ve OR. */
function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;

  for (const [key, expected] of Object.entries(where)) {
    if (key === 'OR') {
      const alternatives = expected as Array<Record<string, unknown>>;
      if (!alternatives.some((alternative) => matches(row, alternative))) return false;
      continue;
    }
    if (key === 'AND') {
      const clauses = expected as Array<Record<string, unknown>>;
      if (!clauses.every((clause) => matches(row, clause))) return false;
      continue;
    }
    if (key === 'tenantId') {
      // Tenant filtresi gercekte Prisma uzantisinda; sahte istemcide tek
      // kiraci var ve bu kosul her zaman saglanir.
      continue;
    }

    const actual = row[key];
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const range = expected as { gt?: Date; lte?: Date; gte?: Date; lt?: Date };
      const value = actual instanceof Date ? actual.getTime() : Number(actual);
      if (range.gt !== undefined && !(value > range.gt.getTime())) return false;
      if (range.gte !== undefined && !(value >= range.gte.getTime())) return false;
      if (range.lte !== undefined && !(value <= range.lte.getTime())) return false;
      if (range.lt !== undefined && !(value < range.lt.getTime())) return false;
      continue;
    }

    if (actual !== expected) return false;
  }

  return true;
}

interface FakePrismaOptions {
  tour?: { id: string; driverId: string; vehicleId: string | null; workDate: Date; stopIds: string[] } | null;
  /** Her create'ten ONCE calisir; yaris kurmak icin. */
  beforeCreate?: (rows: Row[]) => void;
}

function fakePrisma(options: FakePrismaOptions = {}) {
  let rows: Row[] = [];
  let seq = 0;
  /** Tur/durak uzerindeki HER yazma denemesi buraya dusuyor — bos kalmali. */
  const tourWrites: string[] = [];

  const enforceUnique = (candidate: Row, ignoreId?: string) => {
    const key = candidate.activeDriverKey;
    if (key === null || key === undefined) return;
    if (rows.some((row) => row.id !== ignoreId && row.activeDriverKey === key)) {
      throw uniqueViolation();
    }
  };

  const withVehicle = (row: Row): Row => ({ ...row, vehicle: { plateNumber: 'DU-AB 123' } });

  const fuelingIntent = {
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = rows.find((row) => matches(row, args?.where));
      return found ? withVehicle(found) : null;
    },
    findMany: async () => rows.map(withVehicle),
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of rows) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
    update: async (args: { where: { id: string }; data: Row }) => {
      const row = rows.find((entry) => entry.id === args.where.id);
      if (!row) throw new Error('row not found');
      const next = { ...row, ...args.data };
      enforceUnique(next, row.id as string);
      Object.assign(row, args.data);
      return withVehicle(row);
    },
    create: async (args: { data: Row }) => {
      options.beforeCreate?.(rows);
      seq += 1;
      const row: Row = {
        id: `intent-${seq}`,
        tenantId: 'tenant-a',
        supersededAt: null,
        cancelledAt: null,
        completedAt: null,
        navigationOpenedAt: null,
        ...args.data,
      };
      enforceUnique(row);
      rows.push(row);
      return withVehicle(row);
    },
  };

  const tour = {
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const configured = options.tour;
      if (!configured) return null;
      const where = (args?.where ?? {}) as { id?: string; driverId?: string };
      if (where.id !== configured.id) return null;
      if (where.driverId !== undefined && where.driverId !== configured.driverId) return null;

      const stopFilter = (args as { select?: { stops?: { where?: { id?: string } } } }).select
        ?.stops?.where?.id;
      return {
        id: configured.id,
        workDate: configured.workDate,
        vehicleId: configured.vehicleId,
        driverId: configured.driverId,
        ...(stopFilter !== undefined
          ? { stops: configured.stopIds.includes(stopFilter) ? [{ id: stopFilter }] : [] }
          : {}),
      };
    },
    update: async () => {
      tourWrites.push('tour.update');
      return {};
    },
    updateMany: async () => {
      tourWrites.push('tour.updateMany');
      return { count: 0 };
    },
    create: async () => {
      tourWrites.push('tour.create');
      return {};
    },
  };

  const tourStop = {
    findFirst: async () => null,
    update: async () => {
      tourWrites.push('tourStop.update');
      return {};
    },
    updateMany: async () => {
      tourWrites.push('tourStop.updateMany');
      return { count: 0 };
    },
    create: async () => {
      tourWrites.push('tourStop.create');
      return {};
    },
    createMany: async () => {
      tourWrites.push('tourStop.createMany');
      return { count: 0 };
    },
    delete: async () => {
      tourWrites.push('tourStop.delete');
      return {};
    },
  };

  const client = { fuelingIntent, tour, tourStop };

  return {
    client: {
      ...client,
      // Gercek transaction gibi: geri alma var. Callback firlatirsa satirlar
      // islem oncesi haline doner.
      $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => {
        const snapshot = rows.map((row) => ({ ...row }));
        try {
          return await fn(client);
        } catch (error) {
          // Geri alma BIZIM islemimizi kapsar. `__external` isaretli satirlar
          // baska bir istegin COMMIT ETTIGI kayitlari temsil eder ve geri
          // alinmaz — yaris testinin anlamli olmasi buna bagli.
          const committedElsewhere = rows.filter(
            (row) => row.__external === true && !snapshot.some((old) => old.id === row.id),
          );
          rows = [...snapshot, ...committedElsewhere];
          throw error;
        }
      },
    },
    rows: () => rows,
    tourWrites,
  };
}

function memoryCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null),
    set: async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    },
  };
}

function normalizedStation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'station-1',
    provider: 'tankerkoenig',
    name: 'Aral Duisburg Hafen',
    brand: 'ARAL',
    address: { street: 'Hafenstraße', houseNumber: '1', postalCode: '47059', city: 'Duisburg' },
    latitude: 51.44,
    longitude: 6.76,
    distanceKm: 2.1,
    isOpen: true,
    pricesUpdatedAt: null,
    retrievedAt: '2026-08-13T09:58:00.000Z',
    hgvAccess: 'unknown' as const,
    acceptedFuelCards: null,
    offerings: [
      {
        productType: FuelProductType.DIESEL,
        pricePerUnit: 1.759,
        unit: 'liter' as const,
        currency: 'EUR' as const,
        updatedAt: null,
      },
    ],
    ...overrides,
  };
}

const ROUTE_METRICS = {
  calculationStatus: 'calculated' as const,
  roadDistanceToStationKm: 4.8,
  driveTimeToStationMin: 8,
  viaStationDistanceKm: 11.6,
  viaStationDurationMin: 15,
  extraDistanceKm: 1.6,
  extraDurationMin: 3,
  stationEta: '2026-08-13T10:08:00.000Z',
};

interface BuildOptions extends FakePrismaOptions {
  vehicleId?: string | null;
  compatibility?: Array<{
    productType: FuelProductType;
    usageType: FuelProductUsage;
    approved: boolean;
  }>;
  contextTourId?: string | null;
  contextAnchorStopId?: string | null;
  stations?: Array<ReturnType<typeof normalizedStation>>;
  withRouteMetrics?: boolean;
}

async function buildService(options: BuildOptions = {}) {
  const prisma = fakePrisma(options);
  const cache = memoryCache();
  const selectionContexts = new FuelSelectionContextService(cache as never);

  const vehicleId = options.vehicleId === undefined ? 'veh-1' : options.vehicleId;
  const driverVehicle = {
    requireDriverForUser: async () => ({ id: 'drv-1' }),
    resolveTodayVehicle: async () =>
      vehicleId ? { id: vehicleId, plateNumber: 'DU-AB 123', source: 'tour' as const } : null,
  };

  const compatibility = {
    listRowsForVehicle: async () =>
      options.compatibility ?? [
        {
          productType: FuelProductType.DIESEL,
          usageType: FuelProductUsage.PRIMARY,
          approved: true,
        },
      ],
  };

  const auditEntries: Array<Record<string, unknown>> = [];
  const audit = {
    logAction: async (params: Record<string, unknown>) => {
      auditEntries.push(params);
      return {};
    },
  };

  const notifications: Array<Record<string, unknown>> = [];
  const operationalNotify = {
    notifyOperationalUsersSafely: (input: Record<string, unknown>) => {
      notifications.push(input);
    },
  };

  const service = new FuelingIntentService(
    prisma.client as never,
    driverVehicle as never,
    compatibility as never,
    selectionContexts,
    audit as never,
    operationalNotify as never,
  );

  const stations = options.stations ?? [normalizedStation()];
  const context = await selectionContexts.create({
    driverId: 'drv-1',
    vehicleId: vehicleId ?? 'veh-1',
    compatibleProducts: [FuelProductType.DIESEL],
    attribution: { label: 'Tankerkönig (CC BY 4.0)', url: 'https://creativecommons.tankerkoenig.de' },
    routeMode: options.contextTourId ? 'active_tour' : 'nearby_only',
    routeCalculatedAt: options.withRouteMetrics ? '2026-08-13T10:00:00.000Z' : null,
    tourId: options.contextTourId ?? null,
    anchorTourStopId: options.contextAnchorStopId ?? null,
    stations: stations.map((station) =>
      toSelectionContextStation(station, options.withRouteMetrics ? ROUTE_METRICS : undefined),
    ),
  });

  return { service, prisma, context, selectionContexts, cache, auditEntries, notifications };
}

function selectDto(overrides: Partial<SelectFuelingIntentDto> & { selectionContextId: string }) {
  return {
    stationId: 'station-1',
    selectedFuelProduct: FuelProductType.DIESEL,
    ...overrides,
  } as SelectFuelingIntentDto;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof ConflictException || error instanceof NotFoundException,
      `expected a business rejection, got ${String(error)}`,
    );
    assert.deepEqual(error.getResponse(), { code });
    return true;
  });
}

describe('fueling intent — endpoint contract', () => {
  it('exposes the driver endpoints under driver/fueling-intents', () => {
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, FuelingIntentDriverController),
      'driver/fueling-intents',
    );

    const expectations: Array<[string, string, RequestMethod]> = [
      ['active', 'active', RequestMethod.GET],
      ['select', 'active', RequestMethod.PUT],
      ['cancel', 'active/cancel', RequestMethod.POST],
      ['navigationOpened', 'active/navigation-opened', RequestMethod.POST],
    ];

    for (const [handlerName, path, method] of expectations) {
      const handler = Reflect.get(
        FuelingIntentDriverController.prototype as object,
        handlerName,
      ) as object;
      assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path, handlerName);
      assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), method, handlerName);
    }
  });

  it('accepts no driver, vehicle, tour, price or coordinate field from the client', () => {
    // Global ValidationPipe forbidNonWhitelisted ile calisiyor: DTO'da olmayan
    // alan 400 ile reddedilir. Bu yuzden "alan yok" gercek bir korumadir —
    // istemci fiyat ya da istasyon koordinati UYDURAMAZ.
    const fields = Object.getOwnPropertyNames(new SelectFuelingIntentDto());
    for (const forbidden of [
      'driverId',
      'vehicleId',
      'tourId',
      'tenantId',
      'anchorTourStopId',
      'quotedPricePerLitre',
      'pricePerUnit',
      'latitude',
      'longitude',
      'stationName',
      'extraDistanceKm',
      'stationEta',
      'expiresAt',
      'status',
    ]) {
      assert.equal(fields.includes(forbidden), false, `${forbidden} must not be accepted`);
    }
  });

  it('gives the office a read-only endpoint and no write handler', () => {
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, FuelingIntentOfficeController),
      'fleet/fueling-intents',
    );

    const handlers = Object.getOwnPropertyNames(FuelingIntentOfficeController.prototype).filter(
      (name) => name !== 'constructor',
    );
    for (const name of handlers) {
      const handler = Reflect.get(FuelingIntentOfficeController.prototype as object, name) as object;
      assert.equal(
        Reflect.getMetadata(METHOD_METADATA, handler),
        RequestMethod.GET,
        `${name} must be read-only`,
      );
    }
  });
});

describe('fueling intent — server-resolved identity', () => {
  it('resolves driver and vehicle on the server and stores them', async () => {
    const { service, prisma, context } = await buildService();

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(result.outcome, 'created');
    assert.equal(result.intent.driverId, 'drv-1');
    assert.equal(result.intent.vehicleId, 'veh-1');
    assert.equal(prisma.rows().length, 1);
    assert.equal(prisma.rows()[0]!.driverId, 'drv-1');
  });

  it('refuses the selection when no vehicle can be resolved for the driver', async () => {
    const { service, context } = await buildService({ vehicleId: null });

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: context.id })),
      'driver_vehicle_not_resolved',
    );
  });

  it('takes the station snapshot from the server context, not from the request', async () => {
    const { service, context } = await buildService({ withRouteMetrics: true });

    const result = await service.select(
      'user-1',
      selectDto({ selectionContextId: context.id, plannedLitres: 120 }),
    );

    assert.equal(result.intent.station.name, 'Aral Duisburg Hafen');
    assert.equal(result.intent.station.latitude, 51.44);
    assert.equal(result.intent.quotedPricePerLitre, 1.759);
    assert.equal(result.intent.extraDistanceKm, 1.6);
    assert.equal(result.intent.driveTimeToStationMin, 8);
    assert.equal(result.intent.plannedLitres, 120);
    assert.equal(result.intent.attribution.label, 'Tankerkönig (CC BY 4.0)');
  });
});

describe('fueling intent — selection context safety', () => {
  it('rejects a context that belongs to another driver', async () => {
    const { service, selectionContexts } = await buildService();
    const foreign = await selectionContexts.create({
      driverId: 'drv-2',
      vehicleId: 'veh-1',
      compatibleProducts: [FuelProductType.DIESEL],
      attribution: { label: 'Tankerkönig', url: null },
      routeMode: 'nearby_only',
      routeCalculatedAt: null,
      tourId: null,
      anchorTourStopId: null,
      stations: [toSelectionContextStation(normalizedStation())],
    });

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: foreign.id })),
      'fueling_selection_context_expired',
    );
  });

  it('rejects a context created for a different vehicle', async () => {
    const { service, selectionContexts } = await buildService();
    const otherVehicle = await selectionContexts.create({
      driverId: 'drv-1',
      vehicleId: 'veh-9',
      compatibleProducts: [FuelProductType.DIESEL],
      attribution: { label: 'Tankerkönig', url: null },
      routeMode: 'nearby_only',
      routeCalculatedAt: null,
      tourId: null,
      anchorTourStopId: null,
      stations: [toSelectionContextStation(normalizedStation())],
    });

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: otherVehicle.id })),
      'fueling_selection_context_expired',
    );
  });

  it('rejects an expired context instead of reusing the stale price', async () => {
    const { service, context, cache } = await buildService();
    const stored = JSON.parse(cache.store.get(`selection:${context.id}`)!);
    cache.store.set(
      `selection:${context.id}`,
      JSON.stringify({ ...stored, expiresAt: '2026-08-13T09:00:00.000Z' }),
    );

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: context.id })),
      'fueling_selection_context_expired',
    );
  });

  it('rejects an unknown context id', async () => {
    const { service } = await buildService();

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: 'made-up' })),
      'fueling_selection_context_expired',
    );
  });

  it('rejects a station id that is not inside the context', async () => {
    const { service, context } = await buildService();

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: context.id, stationId: 'ghost' })),
      'fueling_station_not_in_context',
    );
  });

  it('uses a short, documented ttl and an unguessable id', async () => {
    assert.equal(SELECTION_CONTEXT_TTL_SECONDS, 600);

    const { context } = await buildService();
    // UUID v4: tahmin edilemez ve icinde kiraci/surucu bilgisi tasimaz.
    assert.match(
      context.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(context.id.includes('drv-1'), false);
  });

  it('never persists the stations the driver did not select', async () => {
    const { service, prisma, context } = await buildService({
      stations: [
        normalizedStation(),
        normalizedStation({ id: 'station-2', name: 'Shell Ruhrort' }),
        normalizedStation({ id: 'station-3', name: 'Esso Neumühl' }),
      ],
    });

    await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(prisma.rows().length, 1);
    assert.equal(prisma.rows()[0]!.providerStationId, 'station-1');
    assert.equal(
      prisma.rows().some((row) => row.stationName !== 'Aral Duisburg Hafen'),
      false,
    );
  });
});

describe('fueling intent — fuel product checks', () => {
  it('rejects a fuel the vehicle is not approved for', async () => {
    const { service, context } = await buildService({
      compatibility: [
        {
          productType: FuelProductType.SUPER_E10,
          usageType: FuelProductUsage.PRIMARY,
          approved: true,
        },
      ],
    });

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: context.id })),
      'fuel_product_not_compatible',
    );
  });

  it('rejects a fuel the selected station does not offer', async () => {
    const { service, context } = await buildService({
      compatibility: [
        { productType: FuelProductType.DIESEL, usageType: FuelProductUsage.PRIMARY, approved: true },
        {
          productType: FuelProductType.SUPER_E5,
          usageType: FuelProductUsage.ALTERNATIVE,
          approved: true,
        },
      ],
    });

    await expectCode(
      service.select(
        'user-1',
        selectDto({ selectionContextId: context.id, selectedFuelProduct: FuelProductType.SUPER_E5 }),
      ),
      'fuel_product_not_offered',
    );
  });

  it('stores no price when the provider did not report one', async () => {
    const { service, context } = await buildService({
      stations: [
        normalizedStation({
          offerings: [
            {
              productType: FuelProductType.DIESEL,
              pricePerUnit: null,
              unit: 'liter' as const,
              currency: 'EUR' as const,
              updatedAt: null,
            },
          ],
        }),
      ],
    });

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    // "Fiyat bilinmiyor" 0 EUR DEGILDIR.
    assert.equal(result.intent.quotedPricePerLitre, null);
  });
});

describe('fueling intent — idempotency and concurrency', () => {
  it('does not create a duplicate when the same selection is retried', async () => {
    const { service, prisma, context, notifications } = await buildService();
    const dto = selectDto({ selectionContextId: context.id, plannedLitres: 80 });

    const first = await service.select('user-1', dto);
    const second = await service.select('user-1', dto);

    assert.equal(first.outcome, 'created');
    assert.equal(second.outcome, 'unchanged');
    assert.equal(second.intent.id, first.intent.id);
    assert.equal(prisma.rows().length, 1);
    // Cift dokunus IKINCI bir ofis bildirimi uretmez.
    assert.equal(notifications.length, 1);
  });

  it('supersedes the previous intent when a different station is chosen', async () => {
    const { service, prisma, context, notifications } = await buildService({
      stations: [normalizedStation(), normalizedStation({ id: 'station-2', name: 'Shell Ruhrort' })],
    });

    const first = await service.select('user-1', selectDto({ selectionContextId: context.id }));
    const second = await service.select(
      'user-1',
      selectDto({ selectionContextId: context.id, stationId: 'station-2' }),
    );

    assert.equal(second.outcome, 'replaced');
    assert.equal(second.replacedIntentId, first.intent.id);

    const rows = prisma.rows();
    assert.equal(rows.length, 2);
    const old = rows.find((row) => row.id === first.intent.id)!;
    assert.equal(old.status, 'SUPERSEDED');
    // Terminal duruma gecen kayitta aktif anahtar TEMIZLENIR.
    assert.equal(old.activeDriverKey, null);
    assert.equal(rows.filter((row) => row.status === 'ACTIVE').length, 1);
    assert.equal(notifications.length, 2);
    assert.equal(notifications[1]!.key, 'fueling_stop_changed');
  });

  it('treats a changed planned volume as a new selection', async () => {
    const { service, context } = await buildService();

    await service.select('user-1', selectDto({ selectionContextId: context.id, plannedLitres: 80 }));
    const changed = await service.select(
      'user-1',
      selectDto({ selectionContextId: context.id, plannedLitres: 120 }),
    );

    assert.equal(changed.outcome, 'replaced');
    assert.equal(changed.intent.plannedLitres, 120);
  });

  it('cannot end up with two active intents when two requests race', async () => {
    // Ilk create tam yazilmadan once, ARADAN baska bir istek gecip aktif kayit
    // birakiyor. Tekil indeks ilk denemeyi dusuruyor; servis bir kez yeniden
    // deniyor ve bu kez var olan kaydi goruyor.
    let injected = false;
    const { service, prisma, context } = await buildService({
      beforeCreate: (rows) => {
        if (injected) return;
        injected = true;
        rows.push({
          id: 'intent-racer',
          __external: true,
          tenantId: 'tenant-a',
          driverId: 'drv-1',
          vehicleId: 'veh-1',
          tourId: null,
          anchorTourStopId: null,
          status: 'ACTIVE',
          activeDriverKey: 'drv-1',
          provider: 'tankerkoenig',
          providerStationId: 'station-1',
          stationName: 'Aral Duisburg Hafen',
          stationBrand: 'ARAL',
          stationStreet: null,
          stationHouseNumber: null,
          stationPostalCode: null,
          stationCity: null,
          stationLatitude: new Prisma.Decimal(51.44),
          stationLongitude: new Prisma.Decimal(6.76),
          selectedFuelProduct: FuelProductType.DIESEL,
          quotedPricePerLitre: null,
          priceRetrievedAt: null,
          attributionLabel: 'Tankerkönig',
          attributionUrl: null,
          plannedLitres: null,
          routeMode: 'nearby_only',
          extraDistanceKm: null,
          extraDurationMin: null,
          driveTimeToStationMin: null,
          stationEta: null,
          routeCalculatedAt: null,
          selectedAt: NOW,
          navigationOpenedAt: null,
          expiresAt: new Date('2999-01-01T00:00:00.000Z'),
        });
      },
    });

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    // Ayni istasyon + ayni yakit: yarisi kazanan kayit AYNEN kullaniliyor.
    assert.equal(result.outcome, 'unchanged');
    assert.equal(result.intent.id, 'intent-racer');
    assert.equal(prisma.rows().filter((row) => row.status === 'ACTIVE').length, 1);
  });

  it('reports a conflict instead of guessing when the race does not settle', async () => {
    // Her create'te araya baska bir kayit giriyor ve o kayit FARKLI bir
    // istasyon tutuyor: iki denemede de tekil indeks devrede.
    let counter = 0;
    const { service, context } = await buildService({
      stations: [normalizedStation(), normalizedStation({ id: 'station-2' })],
      beforeCreate: (rows) => {
        counter += 1;
        rows.push({
          id: `racer-${counter}`,
          __external: true,
          tenantId: 'tenant-a',
          driverId: 'drv-1',
          status: 'ACTIVE',
          activeDriverKey: 'drv-1',
          expiresAt: new Date('2999-01-01T00:00:00.000Z'),
        });
      },
    });

    await expectCode(
      service.select('user-1', selectDto({ selectionContextId: context.id })),
      'fueling_intent_conflict',
    );
  });
});

describe('fueling intent — cancel, navigation and expiry', () => {
  it('cancels the active intent and is safe to repeat', async () => {
    const { service, prisma, context, notifications } = await buildService();
    await service.select('user-1', selectDto({ selectionContextId: context.id }));

    const first = await service.cancel('user-1');
    const second = await service.cancel('user-1');

    assert.equal(first.cancelled, true);
    assert.equal(second.cancelled, false);
    assert.equal(prisma.rows()[0]!.status, 'CANCELLED');
    assert.equal(prisma.rows()[0]!.activeDriverKey, null);
    // Ikinci iptal IKINCI bir bildirim uretmez.
    assert.equal(notifications.filter((entry) => entry.key === 'fueling_stop_cancelled').length, 1);
  });

  it('returns an empty active intent instead of an error', async () => {
    const { service } = await buildService();
    assert.deepEqual(await service.getActive('user-1'), { intent: null });
  });

  it('records the first navigation opening and keeps it on repeat', async () => {
    const { service, prisma, context, notifications } = await buildService();
    await service.select('user-1', selectDto({ selectionContextId: context.id }));

    const first = await service.markNavigationOpened('user-1');
    const second = await service.markNavigationOpened('user-1');

    assert.ok(first.intent.navigationOpenedAt);
    assert.equal(second.intent.navigationOpenedAt, first.intent.navigationOpenedAt);
    assert.ok(prisma.rows()[0]!.navigationOpenedAt);
    // Navigasyon acmak OFIS BILDIRIMI uretmez.
    assert.equal(
      notifications.some((entry) => String(entry.key).includes('navigation')),
      false,
    );
  });

  it('rejects navigation telemetry when there is no active intent', async () => {
    const { service } = await buildService();
    await expectCode(service.markNavigationOpened('user-1'), 'active_fueling_intent_not_found');
  });

  it('closes an overdue intent lazily on read', async () => {
    const { service, prisma, context } = await buildService();
    await service.select('user-1', selectDto({ selectionContextId: context.id }));

    // Suresi gecmis gibi geriye cekiliyor.
    prisma.rows()[0]!.expiresAt = new Date('2026-08-12T21:59:59.999Z');

    const active = await service.getActive('user-1');

    assert.equal(active.intent, null);
    assert.equal(prisma.rows()[0]!.status, 'EXPIRED');
    // Anahtar temizlenmezse surucu bir daha secim yapamazdi.
    assert.equal(prisma.rows()[0]!.activeDriverKey, null);
  });

  it('lets the driver select again after an intent expired', async () => {
    const { service, prisma, context } = await buildService();
    await service.select('user-1', selectDto({ selectionContextId: context.id }));
    prisma.rows()[0]!.expiresAt = new Date('2026-08-12T21:59:59.999Z');

    const again = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(again.outcome, 'created');
    assert.equal(prisma.rows().filter((row) => row.status === 'ACTIVE').length, 1);
  });
});

describe('fueling intent — tour linkage and isolation', () => {
  const TOUR = {
    id: 'tour-1',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    workDate: new Date('2026-08-13T00:00:00.000Z'),
    stopIds: ['stop-2'],
  };

  it('works with no tour at all', async () => {
    const { service, prisma, context } = await buildService({ tour: null });

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(result.intent.tourId, null);
    assert.equal(result.intent.anchorTourStopId, null);
    assert.equal(prisma.tourWrites.length, 0);
  });

  it('anchors to the next stop without touching tour or stop rows', async () => {
    const { service, prisma, context } = await buildService({
      tour: TOUR,
      contextTourId: 'tour-1',
      contextAnchorStopId: 'stop-2',
      withRouteMetrics: true,
    });

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(result.intent.tourId, 'tour-1');
    assert.equal(result.intent.anchorTourStopId, 'stop-2');
    // ASIL SEY: tur ve durak tablolarina TEK BIR YAZMA bile yapilmadi —
    // durak sayisi, sirasi, optimizasyon ciktisi ve tur durumu degismedi.
    assert.deepEqual(prisma.tourWrites, []);
  });

  it('drops an anchor that does not belong to the tour', async () => {
    const { service, context } = await buildService({
      tour: TOUR,
      contextTourId: 'tour-1',
      contextAnchorStopId: 'stop-from-another-tour',
    });

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(result.intent.tourId, 'tour-1');
    assert.equal(result.intent.anchorTourStopId, null);
  });

  it('drops the tour link when the tour is not the driver own', async () => {
    const { service, context } = await buildService({
      tour: { ...TOUR, driverId: 'drv-other' },
      contextTourId: 'tour-1',
      contextAnchorStopId: 'stop-2',
    });

    const result = await service.select('user-1', selectDto({ selectionContextId: context.id }));

    assert.equal(result.intent.tourId, null);
  });

  it('cancels without touching tour data', async () => {
    const { service, prisma, context } = await buildService({
      tour: TOUR,
      contextTourId: 'tour-1',
      contextAnchorStopId: 'stop-2',
    });

    await service.select('user-1', selectDto({ selectionContextId: context.id }));
    await service.cancel('user-1');

    assert.deepEqual(prisma.tourWrites, []);
  });

  it('shows the office the intent of the tour, and the standalone one as fallback', async () => {
    const { service, prisma, context } = await buildService({ tour: null });
    await service.select('user-1', selectDto({ selectionContextId: context.id }));

    const found = await service.findActiveForTour({
      id: 'tour-1',
      driverId: 'drv-1',
      vehicleId: 'veh-1',
    });

    assert.ok(found);
    assert.equal(found.station.name, 'Aral Duisburg Hafen');
    assert.equal(found.tourId, null);
    assert.equal(prisma.tourWrites.length, 0);
  });

  it('does not show the office an intent of another driver', async () => {
    const { service, context } = await buildService({ tour: null });
    await service.select('user-1', selectDto({ selectionContextId: context.id }));

    const found = await service.findActiveForTour({
      id: 'tour-9',
      driverId: 'drv-other',
      vehicleId: 'veh-other',
    });

    assert.equal(found, null);
  });
});

describe('fueling intent — expiry rules', () => {
  it('expires a tour-linked intent at the end of the local work day', () => {
    const selectedAt = new Date('2026-08-13T10:00:00.000Z');
    const expiresAt = resolveIntentExpiry({
      selectedAt,
      tourWorkDate: new Date('2026-08-13T00:00:00.000Z'),
    });

    // Yaz saatinde Berlin UTC+2 -> yerel gun 13.08 23:59:59.999 = 21:59:59.999Z.
    // Sunucunun yerel saatine BIRAKILSAYDI UTC'de iki saat erken biterdi.
    assert.equal(expiresAt.toISOString(), '2026-08-13T21:59:59.999Z');
  });

  it('uses the winter offset in january', () => {
    const expiresAt = resolveIntentExpiry({
      selectedAt: new Date('2026-01-15T10:00:00.000Z'),
      tourWorkDate: new Date('2026-01-15T00:00:00.000Z'),
    });

    // Kis saatinde Berlin UTC+1 -> 22:59:59.999Z.
    assert.equal(expiresAt.toISOString(), '2026-01-15T22:59:59.999Z');
  });

  it('caps a standalone selection at 24 hours', () => {
    const selectedAt = new Date('2026-08-13T10:00:00.000Z');
    const expiresAt = resolveIntentExpiry({ selectedAt, tourWorkDate: null });

    assert.equal(STANDALONE_INTENT_MAX_HOURS, 24);
    assert.equal(expiresAt.toISOString(), '2026-08-14T10:00:00.000Z');
  });

  it('never produces an already-expired intent for a past work date', () => {
    const selectedAt = new Date('2026-08-13T10:00:00.000Z');
    const expiresAt = resolveIntentExpiry({
      selectedAt,
      tourWorkDate: new Date('2026-08-01T00:00:00.000Z'),
    });

    assert.ok(expiresAt.getTime() > selectedAt.getTime());
  });

  it('uses the fleet operating time zone, not the server local time', () => {
    assert.equal(FLEET_OPERATING_TIME_ZONE, 'Europe/Berlin');
    assert.equal(
      endOfLocalDay(new Date('2026-08-13T23:30:00.000Z')).toISOString(),
      // 23:30Z = 14.08 01:30 Berlin -> yerel gun 14.08.
      '2026-08-14T21:59:59.999Z',
    );
  });
});

describe('fueling intent — selection equality', () => {
  const base = {
    provider: 'tankerkoenig',
    providerStationId: 'station-1',
    selectedFuelProduct: FuelProductType.DIESEL,
    plannedLitres: 80,
  };

  it('ignores price and route metrics, which change between searches', () => {
    assert.equal(isSameSelection(base, { ...base }), true);
  });

  it('separates a different station, fuel or volume', () => {
    assert.equal(isSameSelection(base, { ...base, providerStationId: 'station-2' }), false);
    assert.equal(
      isSameSelection(base, { ...base, selectedFuelProduct: FuelProductType.SUPER_E10 }),
      false,
    );
    assert.equal(isSameSelection(base, { ...base, plannedLitres: 81 }), false);
    assert.equal(isSameSelection(base, { ...base, plannedLitres: null }), false);
  });

  it('treats a rounding-level volume difference as the same selection', () => {
    assert.equal(isSameSelection(base, { ...base, plannedLitres: 80.001 }), true);
  });
});
