import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RouteSummary } from '../../routing/core/routing.types';
import {
  DEGRADED_AVERAGE_SPEED_KMH,
  DispatchRefError,
  applyAgentRanking,
  buildRoutePlan,
  haversineKm,
  pairVehiclesWithDrivers,
  resolveConsolidation,
  toTruckProfile,
  type ServerCandidate,
  type StopInput,
} from './dispatch-plan';

/**
 * DISPATCH PLANI — SAF KISIM (Faz 17).
 *
 * Iki soru olculuyor: (1) ajanin siralamasi sunucunun kararini EZEBILIYOR mu,
 * (2) rota basarisiz oldugunda uydurma bir ETA uretiliyor mu.
 */

const DUISBURG = { latitude: 51.4344, longitude: 6.7623 };
const HAMBURG = { latitude: 53.5511, longitude: 9.9937 };

function candidate(ref: string, overall: ServerCandidate['overall']): ServerCandidate {
  return { ref, vehicleId: `veh-${ref}`, driverId: `drv-${ref}`, overall };
}

function stops(): StopInput[] {
  return [
    { kind: 'pickup', locationId: 'loc-1', point: DUISBURG, serviceMinutes: 30 },
    { kind: 'delivery', locationId: 'loc-2', point: HAMBURG, serviceMinutes: 45 },
  ];
}

function summary(overrides: Partial<RouteSummary> = {}): RouteSummary {
  return {
    distanceKm: 380,
    durationMinutes: 300,
    hasToll: true,
    hasFerry: false,
    hasHighway: true,
    shape: null,
    legs: [{ distanceKm: 380, durationMinutes: 300, shape: null }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Referans cozumleme
// ---------------------------------------------------------------------------

describe('Ajan siralamasi SUNUCUNUN kararini EZEMEZ', () => {
  it('uygun aday, ajan sona koysa bile BASA gelir', () => {
    const result = applyAgentRanking(
      [candidate('c1', 'incompatible'), candidate('c2', 'verified')],
      [
        { candidateRef: 'c1', rank: 1, rationaleKey: 'closest_to_pickup' },
        { candidateRef: 'c2', rank: 2, rationaleKey: 'no_strong_signal' },
      ],
    );
    assert.equal(result[0]!.ref, 'c2');
    assert.equal(result[0]!.position, 1);
    assert.equal(result[1]!.ref, 'c1');
  });

  it('siralama uygunluk SINIFINA gore: eligible > review_required > blocked', () => {
    const result = applyAgentRanking(
      [candidate('c1', 'unknown'), candidate('c2', 'incompatible'), candidate('c3', 'verified')],
      [],
    );
    assert.deepEqual(result.map((item) => item.ref), ['c3', 'c1', 'c2']);
  });

  it('AYNI SINIF icinde ajanin sirasi gecerli', () => {
    const result = applyAgentRanking(
      [candidate('c1', 'verified'), candidate('c2', 'verified')],
      [
        { candidateRef: 'c2', rank: 1, rationaleKey: 'capacity_fits_best' },
        { candidateRef: 'c1', rank: 2, rationaleKey: 'no_strong_signal' },
      ],
    );
    assert.equal(result[0]!.ref, 'c2');
    assert.equal(result[0]!.rationaleKey, 'capacity_fits_best');
  });

  it('`review_required` aday ONERILEN gosterilemez', () => {
    const result = applyAgentRanking([candidate('c1', 'unknown')], [
      { candidateRef: 'c1', rank: 1, rationaleKey: 'closest_to_pickup' },
    ]);
    assert.equal(result[0]!.recommendable, false);
  });

  it('yalnizca `verified` aday onerilebilir', () => {
    const result = applyAgentRanking([candidate('c1', 'verified')], []);
    assert.equal(result[0]!.recommendable, true);
  });

  it('TANIMSIZ referans SESSIZCE ATILMAZ, HATA verir', () => {
    assert.throws(
      () =>
        applyAgentRanking([candidate('c1', 'verified')], [
          { candidateRef: 'c-uydurma', rank: 1, rationaleKey: 'no_strong_signal' },
        ]),
      (error: unknown) =>
        error instanceof DispatchRefError && error.reason === 'unknown_candidate_ref',
    );
  });

  it('TEKRARLANAN referans hata verir', () => {
    assert.throws(
      () =>
        applyAgentRanking([candidate('c1', 'verified')], [
          { candidateRef: 'c1', rank: 1, rationaleKey: 'no_strong_signal' },
          { candidateRef: 'c1', rank: 2, rationaleKey: 'no_strong_signal' },
        ]),
      (error: unknown) =>
        error instanceof DispatchRefError && error.reason === 'duplicate_candidate_ref',
    );
  });

  it('siralanmamis adaylar KAYBOLMAZ, sona gider', () => {
    const result = applyAgentRanking(
      [candidate('c1', 'verified'), candidate('c2', 'verified')],
      [{ candidateRef: 'c2', rank: 1, rationaleKey: 'no_strong_signal' }],
    );
    assert.equal(result.length, 2);
    assert.equal(result[1]!.ref, 'c1');
    assert.equal(result[1]!.agentRank, null);
  });

  it('KARARLI: ayni girdi ayni sirayi verir', () => {
    const input = [candidate('c2', 'verified'), candidate('c1', 'verified')];
    assert.deepEqual(applyAgentRanking(input, []), applyAgentRanking(input, []));
  });
});

// ---------------------------------------------------------------------------
// Kamyon profili
// ---------------------------------------------------------------------------

describe('Kamyon profili', () => {
  it('olculer varsa metre/tona cevriliyor', () => {
    const profile = toTruckProfile(
      { heightCm: 380, lengthCm: 1200, widthCm: 250, grossWeightKg: 18_000 },
      false,
    );
    assert.equal(profile.height, 3.8);
    assert.equal(profile.length, 12);
    assert.equal(profile.width, 2.5);
    assert.equal(profile.weight, 18);
  });

  it('EKSIK olcu guvenli varsayilana duser — fazla kisitli profil gecerli rota uretir', () => {
    const profile = toTruckProfile(
      { heightCm: null, lengthCm: null, widthCm: null, grossWeightKg: null },
      false,
    );
    assert.equal(profile.height, 4.0);
    assert.equal(profile.weight, 40.0);
  });

  it('hazmat TALEPTEN geliyor, aractan degil', () => {
    const dims = { heightCm: null, lengthCm: null, widthCm: null, grossWeightKg: null };
    assert.equal(toTruckProfile(dims, true).hazmat, true);
    assert.equal(toTruckProfile(dims, false).hazmat, false);
  });
});

// ---------------------------------------------------------------------------
// Rota ve ETA
// ---------------------------------------------------------------------------

describe('Rota basarili — ETA gercek rotadan', () => {
  const startAt = new Date('2026-09-01T06:00:00Z');

  it('durum `ok` ve toplamlar Valhalla`dan', () => {
    const plan = buildRoutePlan({ stops: stops(), summary: summary(), failureClass: null, startAt });
    assert.equal(plan.status, 'ok');
    assert.equal(plan.failureClass, null);
    assert.equal(plan.totalDistanceKm, 380);
    assert.equal(plan.totalDurationMin, 300);
  });

  it('ETA bacak suresi + durak islem suresi ile ilerliyor', () => {
    const plan = buildRoutePlan({ stops: stops(), summary: summary(), failureClass: null, startAt });
    assert.equal(plan.stops[0]!.etaAt, '2026-09-01T06:00:00.000Z');
    // 06:00 + 30 dk servis + 300 dk yol = 11:30
    assert.equal(plan.stops[1]!.etaAt, '2026-09-01T11:30:00.000Z');
  });

  it('durak dokumu bacak mesafesini tasiyor', () => {
    const plan = buildRoutePlan({ stops: stops(), summary: summary(), failureClass: null, startAt });
    assert.equal(plan.stops[0]!.legDistanceKm, null);
    assert.equal(plan.stops[1]!.legDistanceKm, 380);
  });
});

describe('Valhalla basarisiz — GUVENLI degradation', () => {
  const startAt = new Date('2026-09-01T06:00:00Z');

  it('durum `degraded` ve hata SINIFI tasiniyor', () => {
    const plan = buildRoutePlan({
      stops: stops(),
      summary: null,
      failureClass: 'unavailable',
      startAt,
    });
    assert.equal(plan.status, 'degraded');
    assert.equal(plan.failureClass, 'unavailable');
  });

  it('tahmin KUS UCUSU mesafeden ve gercek rotadan FARKLI', () => {
    const plan = buildRoutePlan({
      stops: stops(),
      summary: null,
      failureClass: 'unavailable',
      startAt,
    });
    const straight = haversineKm(DUISBURG, HAMBURG);
    assert.ok(plan.totalDistanceKm !== null);
    assert.ok(Math.abs(plan.totalDistanceKm! - straight) < 1);
    // Gercek karayolu mesafesi (380 km) ile ayni DEGIL — tahmin oldugu belli.
    assert.notEqual(Math.round(plan.totalDistanceKm!), 380);
  });

  it('tahmin suresi belgelenmis ortalama hizdan turetiliyor', () => {
    const plan = buildRoutePlan({
      stops: stops(),
      summary: null,
      failureClass: 'unavailable',
      startAt,
    });
    const expected = (haversineKm(DUISBURG, HAMBURG) / DEGRADED_AVERAGE_SPEED_KMH) * 60;
    assert.ok(Math.abs(plan.totalDurationMin! - expected) < 1);
  });

  it('KOORDINAT YOKSA `failed` ve ETA UYDURULMUYOR', () => {
    const plan = buildRoutePlan({
      stops: [
        { kind: 'pickup', locationId: 'loc-1', point: { latitude: 0, longitude: 0 }, serviceMinutes: 0 },
        { kind: 'delivery', locationId: 'loc-2', point: HAMBURG, serviceMinutes: 0 },
      ],
      summary: null,
      failureClass: 'out_of_coverage',
      startAt,
    });
    assert.equal(plan.status, 'failed');
    assert.equal(plan.totalDistanceKm, null);
    assert.equal(plan.stops[1]!.etaAt, null);
  });

  it('BASLANGIC SAATI yoksa ETA uretilmiyor — tahmin taahhude cevrilmez', () => {
    const plan = buildRoutePlan({ stops: stops(), summary: summary(), failureClass: null, startAt: null });
    assert.equal(plan.status, 'ok');
    assert.ok(plan.stops.every((stop) => stop.etaAt === null));
    // Mesafe/sure yine de gecerli — bilinmeyen olan yalnizca VARIS SAATI.
    assert.equal(plan.totalDistanceKm, 380);
  });

  it('durak yoksa `failed`', () => {
    const plan = buildRoutePlan({ stops: [], summary: null, failureClass: null, startAt });
    assert.equal(plan.status, 'failed');
    assert.equal(plan.failureClass, 'no_stops');
  });
});

// ---------------------------------------------------------------------------
// Konsolidasyon
// ---------------------------------------------------------------------------

describe('Konsolidasyon', () => {
  const offered = [
    { ref: 'o1', transportOrderId: 'ord-1', workDate: '2026-09-01' },
    { ref: 'o2', transportOrderId: 'ord-2', workDate: '2026-09-01' },
    { ref: 'o3', transportOrderId: 'ord-3', workDate: '2026-09-02' },
  ];

  it('ayni gunun siparisleri birlestirilebiliyor', () => {
    const result = resolveConsolidation(offered, ['o1', 'o2']);
    assert.deepEqual(result.transportOrderIds, ['ord-1', 'ord-2']);
    assert.equal(result.workDate, '2026-09-01');
  });

  it('FARKLI GUNLER birlestirilemez — Tour tek gun tasiyor', () => {
    assert.throws(
      () => resolveConsolidation(offered, ['o1', 'o3']),
      (error: unknown) => error instanceof DispatchRefError && error.reason === 'mixed_work_dates',
    );
  });

  it('TANIMSIZ siparis referansi HATA', () => {
    assert.throws(
      () => resolveConsolidation(offered, ['o-uydurma']),
      (error: unknown) => error instanceof DispatchRefError && error.reason === 'unknown_order_ref',
    );
  });

  it('tekrarlanan referans hata', () => {
    assert.throws(
      () => resolveConsolidation(offered, ['o1', 'o1']),
      (error: unknown) => error instanceof DispatchRefError && error.reason === 'duplicate_order_ref',
    );
  });

  it('bos secim hata — plan siparissiz olamaz', () => {
    assert.throws(
      () => resolveConsolidation(offered, []),
      (error: unknown) => error instanceof DispatchRefError && error.reason === 'no_orders_selected',
    );
  });
});

// ---------------------------------------------------------------------------
// Arac - surucu eslestirmesi
// ---------------------------------------------------------------------------

describe('Arac-surucu eslestirmesi SINIRLI ama KOR DEGIL', () => {
  it('currentDriverId UYGUN DEGILKEN baska musait surucu onerilir', () => {
    // Onceki davranis yalnizca `currentDriverId` uzerinden aday uretiyordu ve
    // bu, izinli bir surucunun aracini "aday yok" gibi gosteriyordu.
    const result = pairVehiclesWithDrivers(
      [{ id: 'v1', currentDriverId: 'd-izinli' }],
      // `d-izinli` listede YOK (izinli/pasif oldugu icin cekilmedi).
      [{ id: 'd-musait', busy: false }],
    );
    assert.equal(result.pairs.length, 1);
    assert.equal(result.pairs[0]!.driverId, 'd-musait');
    assert.equal(result.pairs[0]!.preferred, false);
  });

  it('SURUCUSUZ arac + musait surucu eslestirilir', () => {
    const result = pairVehiclesWithDrivers(
      [{ id: 'v1', currentDriverId: null }],
      [{ id: 'd1', busy: false }],
    );
    assert.deepEqual(result.pairs, [{ vehicleId: 'v1', driverId: 'd1', preferred: false }]);
  });

  it('AYNI SURUCU IKI ARACA onerilmez', () => {
    const result = pairVehiclesWithDrivers(
      [
        { id: 'v1', currentDriverId: 'd1' },
        { id: 'v2', currentDriverId: 'd1' },
      ],
      [{ id: 'd1', busy: false }],
    );
    const driverIds = result.pairs.map((pair) => pair.driverId);
    assert.equal(new Set(driverIds).size, driverIds.length);
    assert.equal(result.pairs.length, 1);
  });

  it('MEVCUT ESLESME esit kosulda ONCELIKLI', () => {
    const result = pairVehiclesWithDrivers(
      [{ id: 'v1', currentDriverId: 'd2' }],
      [
        { id: 'd1', busy: false },
        { id: 'd2', busy: false },
      ],
    );
    assert.equal(result.pairs[0]!.driverId, 'd2');
    assert.equal(result.pairs[0]!.preferred, true);
  });

  it('MUSAIT surucu, mesgul olandan once eslestirilir', () => {
    const result = pairVehiclesWithDrivers(
      [{ id: 'v1', currentDriverId: null }],
      [
        { id: 'd-mesgul', busy: true },
        { id: 'd-musait', busy: false },
      ],
    );
    assert.equal(result.pairs[0]!.driverId, 'd-musait');
  });

  it('SINIR asilirsa SESSIZ KIRPMA YOK — kac aday disarida kaldigi bildirilir', () => {
    const vehicles = Array.from({ length: 10 }, (_item, index) => ({
      id: `v${index}`,
      currentDriverId: null,
    }));
    const drivers = Array.from({ length: 10 }, (_item, index) => ({
      id: `d${index}`,
      busy: false,
    }));
    const result = pairVehiclesWithDrivers(vehicles, drivers, 4);
    assert.equal(result.pairs.length, 4);
    assert.equal(result.truncated, 6);
  });

  it('kirpmada MEVCUT ESLESMELER korunur', () => {
    const result = pairVehiclesWithDrivers(
      [
        { id: 'v1', currentDriverId: null },
        { id: 'v2', currentDriverId: 'd2' },
      ],
      [
        { id: 'd1', busy: false },
        { id: 'd2', busy: false },
      ],
      1,
    );
    assert.equal(result.pairs.length, 1);
    assert.equal(result.pairs[0]!.preferred, true);
    assert.equal(result.truncated, 1);
  });

  it('DETERMINISTIK: girdi sirasi sonucu degistirmez', () => {
    const vehicles = [
      { id: 'v2', currentDriverId: null },
      { id: 'v1', currentDriverId: null },
    ];
    const drivers = [
      { id: 'd2', busy: false },
      { id: 'd1', busy: false },
    ];
    assert.deepEqual(
      pairVehiclesWithDrivers(vehicles, drivers),
      pairVehiclesWithDrivers([...vehicles].reverse(), [...drivers].reverse()),
    );
  });

  it('surucu yoksa aday uretilmez — uydurma esleme YOK', () => {
    assert.deepEqual(pairVehiclesWithDrivers([{ id: 'v1', currentDriverId: 'd1' }], []), {
      pairs: [],
      truncated: 0,
    });
  });
});
