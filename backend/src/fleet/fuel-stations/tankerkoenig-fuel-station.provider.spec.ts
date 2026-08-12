import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { FuelProductType } from '@prisma/client';
import { TankerkoenigFuelStationProvider } from './tankerkoenig-fuel-station.provider';

/**
 * Tankerkonig adaptoru.
 *
 * `fetch` degistiriliyor — gercek API'ye cikan test kirilgan olur (anahtar,
 * kota, degisen fiyat) ve zaten sozlesme testi degil bizim normalizasyonumuzu
 * sinamak istiyoruz.
 *
 * En kritik iki iddia: API anahtari HICBIR yere sizmiyor ve zaman asimi
 * kontrollu bir sonuca donuyor.
 */

const API_KEY = 'secret-key-must-never-leak-0000';

type FetchCall = { url: string; signal?: AbortSignal };

/** Onbellegi devre disi birakan sahte: her cagri saglayiciya gitsin. */
function noCache() {
  return {
    get: async () => null,
    set: async () => undefined,
    ttlSeconds: 300,
  };
}

function stubFetch(handler: (call: FetchCall) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), signal: init?.signal ?? undefined };
    calls.push(call);
    return handler(call);
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SEARCH = { latitude: 51.4344, longitude: 6.7623, radiusKm: 10 };

const SAMPLE_STATION = {
  id: 'aral-1',
  name: 'Aral Duisburg',
  brand: 'ARAL',
  street: 'Musterweg',
  houseNumber: '1',
  postCode: 47051,
  place: 'Duisburg',
  lat: 51.44,
  lng: 6.76,
  dist: 1.4,
  isOpen: true,
  diesel: 1.759,
  e5: 1.879,
  e10: 1.819,
};

let restoreFetch: (() => void) | undefined;
const previousKey = process.env.TANKERKOENIG_API_KEY;

beforeEach(() => {
  process.env.TANKERKOENIG_API_KEY = API_KEY;
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
  if (previousKey === undefined) {
    delete process.env.TANKERKOENIG_API_KEY;
  } else {
    process.env.TANKERKOENIG_API_KEY = previousKey;
  }
});

function buildProvider() {
  return new TankerkoenigFuelStationProvider(noCache() as never);
}

describe('TankerkoenigFuelStationProvider — configuration', () => {
  it('reports a missing API key instead of calling the provider', async () => {
    delete process.env.TANKERKOENIG_API_KEY;
    const stub = stubFetch(() => jsonResponse({ ok: true, stations: [] }));
    restoreFetch = stub.restore;

    const provider = buildProvider();
    const result = await provider.search(SEARCH);

    assert.equal(provider.isConfigured(), false);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, 'provider_not_configured');
    }
    // Anahtar yoksa disariya hic cikilmamali.
    assert.deepEqual(stub.calls, []);
  });

  it('only claims the products Tankerkoenig actually prices', () => {
    // SUPER_PLUS, HVO100, ADBLUE bilincli olarak YOK: saglayici bu fiyatlari
    // dondurmuyor, listeye eklemek olmayan veriyi var saymak olur.
    const supported = buildProvider().supportedProducts();
    assert.deepEqual([...supported], [
      FuelProductType.DIESEL,
      FuelProductType.SUPER_E5,
      FuelProductType.SUPER_E10,
    ]);
    assert.equal(supported.includes(FuelProductType.HVO100), false);
    assert.equal(supported.includes(FuelProductType.ADBLUE), false);
  });
});

describe('TankerkoenigFuelStationProvider — API key containment', () => {
  it('sends the key only in the outgoing request and never in the result', async () => {
    const stub = stubFetch(() => jsonResponse({ ok: true, stations: [SAMPLE_STATION] }));
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);

    // Anahtar giden istekte olmali (aksi halde saglayici reddeder)...
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]!.url.includes(API_KEY), true);

    // ...ama donen veride ASLA olmamali.
    assert.equal(JSON.stringify(result).includes(API_KEY), false);
  });

  it('keeps the key out of error results on every failure branch', async () => {
    const branches: Array<() => Response> = [
      () => jsonResponse({ ok: false, message: 'wrong apikey' }, 200),
      () => jsonResponse({ error: 'forbidden' }, 401),
      () => new Response('<html>gateway</html>', { status: 502 }),
      () => new Response('not json', { status: 200 }),
    ];

    for (const branch of branches) {
      const stub = stubFetch(() => branch());
      const result = await buildProvider().search(SEARCH);
      stub.restore();

      assert.equal(result.ok, false);
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(API_KEY), false, `key leaked in: ${serialized}`);
      // Tam URL de tasinmamali — icinde anahtar var.
      assert.equal(serialized.includes('apikey'), false, `url leaked in: ${serialized}`);
    }
  });
});

describe('TankerkoenigFuelStationProvider — request shape', () => {
  it('caps the radius at the documented 25 km provider limit', async () => {
    const stub = stubFetch(() => jsonResponse({ ok: true, stations: [] }));
    restoreFetch = stub.restore;

    await buildProvider().search({ ...SEARCH, radiusKm: 999 });

    const url = new URL(stub.calls[0]!.url);
    assert.equal(url.searchParams.get('rad'), '25.0');
    assert.equal(url.searchParams.get('type'), 'all');
    assert.equal(url.searchParams.get('sort'), 'dist');
  });

  it('passes an abort signal so the request cannot hang forever', async () => {
    const stub = stubFetch(() => jsonResponse({ ok: true, stations: [] }));
    restoreFetch = stub.restore;

    await buildProvider().search(SEARCH);
    assert.notEqual(stub.calls[0]!.signal, undefined);
  });
});

describe('TankerkoenigFuelStationProvider — failure behaviour', () => {
  it('returns provider_unavailable on timeout instead of throwing', async () => {
    process.env.TANKERKOENIG_TIMEOUT_MS = '20';
    const stub = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          // Gercek fetch gibi davran: abort edilince AbortError ile reddet.
          call.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    restoreFetch = () => {
      stub.restore();
      delete process.env.TANKERKOENIG_TIMEOUT_MS;
    };

    const result = await buildProvider().search(SEARCH);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, 'provider_unavailable');
      assert.equal(result.message.includes('timed out'), true);
    }
    // Zaman asimi yeniden denenebilir: 1 ilk deneme + 1 tekrar.
    assert.equal(stub.calls.length, 2);
  });

  it('retries a 5xx exactly once', async () => {
    let attempts = 0;
    const stub = stubFetch(() => {
      attempts += 1;
      return attempts === 1
        ? new Response('boom', { status: 503 })
        : jsonResponse({ ok: true, stations: [SAMPLE_STATION] });
    });
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);

    assert.equal(attempts, 2);
    assert.equal(result.ok, true);
  });

  it('does not retry a 4xx — a bad key or exhausted quota will not fix itself', async () => {
    const stub = stubFetch(() => new Response('nope', { status: 403 }));
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);

    assert.equal(stub.calls.length, 1);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, 'provider_rejected');
    }
  });
});

describe('TankerkoenigFuelStationProvider — normalization', () => {
  it('maps diesel/e5/e10 and invents nothing else', async () => {
    const stub = stubFetch(() => jsonResponse({ ok: true, stations: [SAMPLE_STATION] }));
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const station = result.value[0]!;
    assert.equal(station.id, 'aral-1');
    assert.equal(station.provider, 'tankerkoenig');
    assert.equal(station.distanceKm, 1.4);
    assert.equal(station.isOpen, true);

    // Saglayicinin VERMEDIGI alanlar uydurulmuyor.
    assert.equal(station.hgvAccess, 'unknown');
    assert.equal(station.acceptedFuelCards, null);
    assert.equal(station.pricesUpdatedAt, null);
    for (const offering of station.offerings) {
      assert.equal(offering.updatedAt, null);
      assert.equal(offering.currency, 'EUR');
      assert.equal(offering.unit, 'liter');
    }

    assert.deepEqual(
      station.offerings.map((entry) => entry.productType),
      [FuelProductType.DIESEL, FuelProductType.SUPER_E5, FuelProductType.SUPER_E10],
    );
  });

  it('turns false and 0 prices into null rather than a bargain', async () => {
    // Kapali istasyonda saglayici `false` ya da 0 dondurebiliyor. 0 EUR
    // siralamada "en ucuz" olarak basa oturur — bu yuzden null'a cevriliyor.
    const stub = stubFetch(() =>
      jsonResponse({
        ok: true,
        stations: [{ ...SAMPLE_STATION, diesel: false, e5: 0, e10: 1.819 }],
      }),
    );
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const prices = new Map(
      result.value[0]!.offerings.map((entry) => [entry.productType, entry.pricePerUnit]),
    );
    assert.equal(prices.get(FuelProductType.DIESEL), null);
    assert.equal(prices.get(FuelProductType.SUPER_E5), null);
    assert.equal(prices.get(FuelProductType.SUPER_E10), 1.819);
  });

  it('skips a station without an id or coordinates', async () => {
    const stub = stubFetch(() =>
      jsonResponse({
        ok: true,
        stations: [
          { ...SAMPLE_STATION, id: undefined },
          { ...SAMPLE_STATION, id: 'no-coords', lat: null, lng: null },
          SAMPLE_STATION,
        ],
      }),
    );
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(
      result.value.map((entry) => entry.id),
      ['aral-1'],
    );
  });

  it('omits an offering the station does not list at all', async () => {
    const stub = stubFetch(() =>
      jsonResponse({
        ok: true,
        stations: [{ id: 'diesel-only', lat: 51.4, lng: 6.7, dist: 2, diesel: 1.749 }],
      }),
    );
    restoreFetch = stub.restore;

    const result = await buildProvider().search(SEARCH);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(
      result.value[0]!.offerings.map((entry) => entry.productType),
      [FuelProductType.DIESEL],
    );
  });
});
