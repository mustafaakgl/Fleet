import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_OVERRIDE_NOTE_LENGTH,
  decisionOf,
  evaluateAdr,
  isRecommendable,
  resolveApplyGate,
  scopeMatches,
  evaluateCandidate,
  evaluateDriveTime,
  evaluateDriver,
  evaluateVehicle,
  evaluateWindows,
  isApplicable,
  overallStatus,
  type DispatchCheck,
  type DispatchDemand,
  type DriverFacts,
  type VehicleFacts,
} from './dispatch-eligibility';

/**
 * UYGUNLUK MOTORU (Faz 17).
 *
 * Buradaki testlerin ortak sorusu tek: `unknown` hicbir yerde "uygun" ya da
 * "guvenli" sayiliyor mu. Bir kontrolun gecmesi degil, GECMEMESI GEREKEN
 * yerde gecmemesi olculuyor.
 */

const AT = new Date('2026-09-01T08:00:00Z');

function vehicle(overrides: Partial<VehicleFacts> = {}): VehicleFacts {
  return {
    id: 'veh-1',
    status: 'active',
    payloadCapacityKg: 12_000,
    cargoVolumeM3: 60,
    palletCapacity: 33,
    adrCertified: true,
    conflictingAssignments: 0,
    conflictingTours: 0,
    tuvExpiryDate: '2027-01-01',
    insuranceExpiryDate: '2027-01-01',
    ...overrides,
  };
}

function driver(overrides: Partial<DriverFacts> = {}): DriverFacts {
  return {
    id: 'drv-1',
    status: 'active',
    calendarCode: null,
    licenseExpiresAt: '2027-01-01',
    conflictingAssignments: 0,
    conflictingTours: 0,
    remainingDriveMinutes: 400,
    ...overrides,
  };
}

function demand(overrides: Partial<DispatchDemand> = {}): DispatchDemand {
  return {
    totalWeightKg: 8_400,
    totalVolumeM3: 24,
    totalPallets: 12,
    adr: 'no',
    windows: [
      { kind: 'pickup', start: '08:00', end: '12:00', timezone: 'Europe/Berlin' },
      { kind: 'delivery', start: '14:00', end: '18:00', timezone: 'Europe/Berlin' },
    ],
    ...overrides,
  };
}

function find(checks: DispatchCheck[], code: string): DispatchCheck {
  const hit = checks.find((item) => item.code === code);
  assert.ok(hit, `kontrol yok: ${code}`);
  return hit;
}

// ---------------------------------------------------------------------------
// Mutlu yol
// ---------------------------------------------------------------------------

describe('Uygun arac/surucu', () => {
  it('butun kontroller gecince aday `verified` ve UYGULANABILIR', () => {
    const result = evaluateCandidate({ vehicle: vehicle(), driver: driver(), demand: demand(), at: AT });
    assert.equal(result.overall, 'verified');
    assert.equal(isApplicable(result.overall), true);
    assert.ok(result.checks.every((item) => item.status === 'verified'));
  });

  it('DETERMINISTIK: ayni girdi ayni sonucu verir', () => {
    const input = { vehicle: vehicle(), driver: driver(), demand: demand(), at: AT };
    assert.deepEqual(evaluateCandidate(input), evaluateCandidate(input));
  });
});

// ---------------------------------------------------------------------------
// Cakisma
// ---------------------------------------------------------------------------

describe('Cakisan arac ve surucu ELENIR', () => {
  it('baska bir gorevi olan arac `incompatible`', () => {
    const checks = evaluateVehicle(vehicle({ conflictingAssignments: 1 }), demand(), AT);
    assert.equal(find(checks, 'vehicle_no_conflict').status, 'incompatible');
  });

  it('baska bir turu olan arac `incompatible`', () => {
    const checks = evaluateVehicle(vehicle({ conflictingTours: 1 }), demand(), AT);
    assert.equal(find(checks, 'vehicle_no_conflict').status, 'incompatible');
  });

  it('cakisan surucu `incompatible`', () => {
    const checks = evaluateDriver(driver({ conflictingAssignments: 2 }), AT);
    const conflict = find(checks, 'driver_no_conflict');
    assert.equal(conflict.status, 'incompatible');
    assert.equal(conflict.evidence?.assignments, 2);
  });

  it('tek bir cakisma BUTUN adayi dusurur', () => {
    const result = evaluateCandidate({
      vehicle: vehicle({ conflictingAssignments: 1 }),
      driver: driver(),
      demand: demand(),
      at: AT,
    });
    assert.equal(result.overall, 'incompatible');
    assert.equal(isApplicable(result.overall), false);
  });
});

// ---------------------------------------------------------------------------
// Izin / hastalik / pasiflik
// ---------------------------------------------------------------------------

describe('Izinli, hasta ve pasif surucu', () => {
  for (const [status, reason] of [
    ['on_leave', 'dispatch.reason.driverOnLeave'],
    ['sick', 'dispatch.reason.driverSick'],
    ['inactive', 'dispatch.reason.driverInactive'],
    ['terminated', 'dispatch.reason.driverTerminated'],
  ] as const) {
    it(`\`${status}\` surucu \`incompatible\` ve GEREKCESI var`, () => {
      const check = find(evaluateDriver(driver({ status }), AT), 'driver_available');
      assert.equal(check.status, 'incompatible');
      assert.equal(check.reasonKey, reason);
    });
  }

  it('takvimdeki izin kodu o gun icin engel', () => {
    for (const code of ['UT', 'KT', 'FT', 'AB']) {
      const check = find(evaluateDriver(driver({ calendarCode: code }), AT), 'driver_calendar');
      assert.equal(check.status, 'incompatible', code);
    }
  });

  it('`AT` (gorev) takvim ENGELI SAYILMAZ — cakisma zaten ayri olculuyor', () => {
    // Ayni engeli iki kez raporlamak dispatcher'i yanlis yonlendirir.
    const check = find(evaluateDriver(driver({ calendarCode: 'AT' }), AT), 'driver_calendar');
    assert.equal(check.status, 'verified');
  });
});

// ---------------------------------------------------------------------------
// Ehliyet ve bakim
// ---------------------------------------------------------------------------

describe('Ehliyet ve belge engelleri', () => {
  it('suresi dolmus ehliyet `incompatible`', () => {
    const check = find(evaluateDriver(driver({ licenseExpiresAt: '2026-01-01' }), AT), 'driver_license');
    assert.equal(check.status, 'incompatible');
  });

  it('GIRILMEMIS ehliyet tarihi `unknown` — "gecerli" SAYILMAZ', () => {
    const check = find(evaluateDriver(driver({ licenseExpiresAt: null }), AT), 'driver_license');
    assert.equal(check.status, 'unknown');
  });

  it('okunamayan tarih `unknown`', () => {
    const check = find(evaluateDriver(driver({ licenseExpiresAt: 'yakinda' }), AT), 'driver_license');
    assert.equal(check.status, 'unknown');
  });

  it('suresi dolmus muayene ve sigorta `incompatible`', () => {
    const checks = evaluateVehicle(
      vehicle({ tuvExpiryDate: '2026-01-01', insuranceExpiryDate: '2026-02-01' }),
      demand(),
      AT,
    );
    assert.equal(find(checks, 'vehicle_inspection').status, 'incompatible');
    assert.equal(find(checks, 'vehicle_insurance').status, 'incompatible');
  });
});

describe('Bakim engeli', () => {
  for (const [status, reason] of [
    ['maintenance', 'dispatch.reason.vehicleMaintenance'],
    ['broken', 'dispatch.reason.vehicleBroken'],
    ['inactive', 'dispatch.reason.vehicleInactive'],
  ] as const) {
    it(`\`${status}\` arac \`incompatible\``, () => {
      const check = find(evaluateVehicle(vehicle({ status }), demand(), AT), 'vehicle_available');
      assert.equal(check.status, 'incompatible');
      assert.equal(check.reasonKey, reason);
    });
  }
});

// ---------------------------------------------------------------------------
// Kapasite — bilinmeyen ile uyumsuzun AYRIMI
// ---------------------------------------------------------------------------

describe('Kapasite: uyumsuz ile BILINMEYEN ayri', () => {
  it('yuk kapasiteyi asiyorsa `incompatible` ve iki deger de kanitta', () => {
    const check = find(
      evaluateVehicle(vehicle({ payloadCapacityKg: 5_000 }), demand({ totalWeightKg: 8_400 }), AT),
      'vehicle_capacity_weight',
    );
    assert.equal(check.status, 'incompatible');
    assert.equal(check.evidence?.demand, 8_400);
    assert.equal(check.evidence?.capacity, 5_000);
  });

  it('ARAC KAPASITESI girilmemisse `unknown` — "sinirsiz" SAYILMAZ', () => {
    const check = find(
      evaluateVehicle(vehicle({ payloadCapacityKg: null }), demand(), AT),
      'vehicle_capacity_weight',
    );
    assert.equal(check.status, 'unknown');
    assert.equal(check.reasonKey, 'dispatch.reason.weightCapacityUnknown');
  });

  it('TALEP bilinmiyorsa da `unknown` — 0 SAYILMAZ', () => {
    const check = find(
      evaluateVehicle(vehicle(), demand({ totalWeightKg: null }), AT),
      'vehicle_capacity_weight',
    );
    assert.equal(check.status, 'unknown');
    assert.equal(check.reasonKey, 'dispatch.reason.weightDemandUnknown');
  });

  it('hacim ve palet icin de ayni uc durum gecerli', () => {
    const checks = evaluateVehicle(
      vehicle({ cargoVolumeM3: null, palletCapacity: 10 }),
      demand({ totalVolumeM3: 24, totalPallets: 12 }),
      AT,
    );
    assert.equal(find(checks, 'vehicle_capacity_volume').status, 'unknown');
    assert.equal(find(checks, 'vehicle_capacity_pallets').status, 'incompatible');
  });

  it('bilinmeyen kapasite adayi `unknown` yapar — `verified` DEGIL', () => {
    const result = evaluateCandidate({
      vehicle: vehicle({ payloadCapacityKg: null }),
      driver: driver(),
      demand: demand(),
      at: AT,
    });
    assert.equal(result.overall, 'unknown');
    assert.equal(isApplicable(result.overall), false);
  });
});

// ---------------------------------------------------------------------------
// ADR
// ---------------------------------------------------------------------------

describe('ADR — iki tarafli belirsizlik', () => {
  it('yuk tehlikeli DEGILSE belgesiz arac da uygun', () => {
    assert.equal(evaluateAdr(null, 'no').status, 'verified');
    assert.equal(evaluateAdr(false, 'no').status, 'verified');
  });

  it('yuk tehlikeliyse belgeli arac uygun, belgesiz `incompatible`', () => {
    assert.equal(evaluateAdr(true, 'yes').status, 'verified');
    assert.equal(evaluateAdr(false, 'yes').status, 'incompatible');
  });

  it('ARAC BELGESI bilinmiyorsa ve yuk tehlikeliyse `unknown`', () => {
    assert.equal(evaluateAdr(null, 'yes').status, 'unknown');
  });

  it('YUK BELIRSIZSE belgesiz arac GECEMEZ — `unknown` `no` gibi islem GORMEZ', () => {
    // Bu kontrolun engellemesi gereken tam senaryo: ADR olup olmadigini
    // bilmedigimiz bir yuku, yetkisi bilinmeyen bir araca yuklemek.
    assert.equal(evaluateAdr(null, 'unknown').status, 'unknown');
    assert.equal(evaluateAdr(false, 'unknown').status, 'incompatible');
  });
});

// ---------------------------------------------------------------------------
// Takograf
// ---------------------------------------------------------------------------

describe('Takograf — kanonik veri yoksa `unknown`', () => {
  it('veri YOKSA `unknown` ve sure UYDURULMAZ', () => {
    const check = evaluateDriveTime(null);
    assert.equal(check.status, 'unknown');
    assert.equal(check.reasonKey, 'dispatch.reason.driveTimeNoData');
    assert.equal(check.evidence?.remainingMinutes, null);
  });

  it('kalan sure varsa `verified`', () => {
    assert.equal(evaluateDriveTime(240).status, 'verified');
  });

  it('kalan sure bitmisse `incompatible`', () => {
    assert.equal(evaluateDriveTime(0).status, 'incompatible');
  });

  it('takograf verisi olmayan filoda aday `verified` OLAMAZ', () => {
    const result = evaluateCandidate({
      vehicle: vehicle(),
      driver: driver({ remainingDriveMinutes: null }),
      demand: demand(),
      at: AT,
    });
    assert.equal(result.overall, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Zaman pencereleri
// ---------------------------------------------------------------------------

describe('Zaman pencereleri', () => {
  it('dilimli pencere `verified`', () => {
    assert.equal(evaluateWindows(demand()).status, 'verified');
  });

  it('pencere YOKSA `unknown`', () => {
    assert.equal(evaluateWindows(demand({ windows: [] })).status, 'unknown');
  });

  it('saat var ama ZAMAN DILIMI yoksa `incompatible` — kullanilamaz veri', () => {
    const check = evaluateWindows(
      demand({ windows: [{ kind: 'pickup', start: '08:00', end: '12:00', timezone: null }] }),
    );
    assert.equal(check.status, 'incompatible');
    assert.equal(check.reasonKey, 'dispatch.reason.windowsTimezoneMissing');
  });

  it('ters pencere `incompatible`', () => {
    const check = evaluateWindows(
      demand({ windows: [{ kind: 'pickup', start: '18:00', end: '08:00', timezone: 'Europe/Berlin' }] }),
    );
    assert.equal(check.status, 'incompatible');
  });

  it('saatsiz pencere `unknown` — dilim aranmaz', () => {
    const check = evaluateWindows(
      demand({ windows: [{ kind: 'pickup', start: null, end: null, timezone: null }] }),
    );
    assert.equal(check.status, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Toplama kurali
// ---------------------------------------------------------------------------

describe('Genel durum EN KOTU kontrolden turetilir', () => {
  const ok: DispatchCheck = { code: 'a', status: 'verified', reasonKey: 'x' };
  const unsure: DispatchCheck = { code: 'b', status: 'unknown', reasonKey: 'x' };
  const bad: DispatchCheck = { code: 'c', status: 'incompatible', reasonKey: 'x' };

  it('tek `incompatible` her seyi dusurur', () => {
    assert.equal(overallStatus([ok, ok, ok, bad]), 'incompatible');
    assert.equal(overallStatus([ok, unsure, bad]), 'incompatible');
  });

  it('`incompatible` yoksa tek `unknown` yeter', () => {
    assert.equal(overallStatus([ok, ok, unsure]), 'unknown');
  });

  it('"cogunluk uygun" diye `verified` YAZILMAZ', () => {
    assert.notEqual(overallStatus([ok, ok, ok, ok, unsure]), 'verified');
  });

  it('hic kontrol yoksa `unknown` — "uygun" DEGIL', () => {
    assert.equal(overallStatus([]), 'unknown');
  });

  it('YALNIZCA `verified` uygulanabilir', () => {
    assert.equal(isApplicable('verified'), true);
    assert.equal(isApplicable('unknown'), false);
    assert.equal(isApplicable('incompatible'), false);
  });
});

describe('Kanit serbest metin TASIMAZ', () => {
  it('butun kanit degerleri sayilabilir ya da bos', () => {
    const result = evaluateCandidate({ vehicle: vehicle(), driver: driver(), demand: demand(), at: AT });
    for (const item of result.checks) {
      // Ceviri anahtari — sunucu kullanici diline metin uretmiyor.
      assert.match(item.reasonKey, /^dispatch\.reason\./);
      for (const value of Object.values(item.evidence ?? {})) {
        assert.ok(
          value === null || ['string', 'number', 'boolean'].includes(typeof value),
          `${item.code}: ${String(value)}`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// KARAR KATMANI — kontrol sonucundan AYRI
// ---------------------------------------------------------------------------

describe('Karar esleme TEK YONLU ve SABIT', () => {
  it('verified -> eligible, incompatible -> blocked, unknown -> review_required', () => {
    assert.equal(decisionOf('verified'), 'eligible');
    assert.equal(decisionOf('incompatible'), 'blocked');
    assert.equal(decisionOf('unknown'), 'review_required');
  });

  it('`unknown` HICBIR KOSULDA `eligible` OLMAZ', () => {
    // Kestirme bir kural eklenirse burasi kirilir.
    assert.notEqual(decisionOf('unknown'), 'eligible');
  });

  it('degerlendirme hem VERIYI hem KARARI tasiyor', () => {
    const result = evaluateCandidate({ vehicle: vehicle(), driver: driver(), demand: demand(), at: AT });
    assert.equal(result.overall, 'verified');
    assert.equal(result.decision, 'eligible');
  });

  it('bilinmeyen kapasitede karar `review_required`', () => {
    const result = evaluateCandidate({
      vehicle: vehicle({ payloadCapacityKg: null }),
      driver: driver(),
      demand: demand(),
      at: AT,
    });
    assert.equal(result.overall, 'unknown');
    assert.equal(result.decision, 'review_required');
  });
});

describe('AJAN `unknown` adayi ONERILEN gosteremez', () => {
  it('yalnizca `eligible` aday onerilebilir', () => {
    assert.equal(isRecommendable('verified'), true);
    assert.equal(isRecommendable('unknown'), false);
    assert.equal(isRecommendable('incompatible'), false);
  });
});

// ---------------------------------------------------------------------------
// Uygulama kapisi ve override politikalari
// ---------------------------------------------------------------------------

describe('Uygulama kapisi — YASAL ENGEL ASILAMAZ', () => {
  it('`incompatible` hicbir beyanla gecilemez', () => {
    const checks = evaluateVehicle(vehicle({ status: 'maintenance' }), demand(), AT);
    const gate = resolveApplyGate(checks, [
      { code: 'vehicle_available', note: 'atolyeyi aradim, arac hazir dediler' },
    ]);
    assert.equal(gate.applicable, false);
    assert.equal(gate.decision, 'blocked');
    assert.equal(gate.blocking.length, 1);
  });

  it('suresi dolmus ehliyet beyanla gecilemez', () => {
    const checks = evaluateDriver(driver({ licenseExpiresAt: '2026-01-01' }), AT);
    const gate = resolveApplyGate(checks, [
      { code: 'driver_license', note: 'surucu yeni ehliyetini gosterdi' },
    ]);
    assert.equal(gate.applicable, false);
  });
});

describe('Uygulama kapisi — TAKOGRAF harici dogrulama ile asilabilir', () => {
  const noTacho = () => evaluateDriver(driver({ remainingDriveMinutes: null }), AT);

  it('kanonik veri yoksa kontrol `external_verification` politikasini tasir', () => {
    const check = find(noTacho(), 'driver_drive_time');
    assert.equal(check.status, 'unknown');
    assert.equal(check.override, 'external_verification');
  });

  it('beyansiz UYGULANAMAZ', () => {
    const gate = resolveApplyGate(noTacho());
    assert.equal(gate.applicable, false);
    assert.ok(gate.needsDeclaration.some((item) => item.code === 'driver_drive_time'));
  });

  it('ZORUNLU aciklama ile uygulanabilir ve karar `manual_override`', () => {
    const gate = resolveApplyGate(noTacho(), [
      { code: 'driver_drive_time', note: 'surucu kartini elle okudum, 6 saat kaldi' },
    ]);
    assert.equal(gate.applicable, true);
    assert.equal(gate.mode, 'manual_override');
    assert.deepEqual(gate.acceptedOverrides, ['driver_drive_time']);
  });

  it('SONUC YINE `unknown` — beyan veriyi degistirmez', () => {
    const checks = noTacho();
    const gate = resolveApplyGate(checks, [
      { code: 'driver_drive_time', note: 'surucu kartini elle okudum, 6 saat kaldi' },
    ]);
    assert.equal(find(checks, 'driver_drive_time').status, 'unknown');
    assert.equal(gate.decision, 'review_required');
  });

  it('BOS ya da cok kisa aciklama beyan SAYILMAZ', () => {
    for (const note of ['', '   ', 'ok', 'tamam']) {
      const gate = resolveApplyGate(noTacho(), [{ code: 'driver_drive_time', note }]);
      assert.equal(gate.applicable, false, JSON.stringify(note));
    }
    assert.ok(MIN_OVERRIDE_NOTE_LENGTH > 5);
  });
});

describe('Uygulama kapisi — KAPASITEDE genel override YOK', () => {
  it('bilinmeyen kapasite `none` politikasi tasir', () => {
    const check = find(
      evaluateVehicle(vehicle({ payloadCapacityKg: null }), demand(), AT),
      'vehicle_capacity_weight',
    );
    assert.equal(check.override, 'none');
  });

  it('beyan verilse bile UYGULANAMAZ — veri doldurulmali', () => {
    const checks = evaluateVehicle(vehicle({ payloadCapacityKg: null }), demand(), AT);
    const gate = resolveApplyGate(checks, [
      { code: 'vehicle_capacity_weight', note: 'gozle baktim sigar gibi duruyor' },
    ]);
    assert.equal(gate.applicable, false);
    assert.ok(gate.needsData.some((item) => item.code === 'vehicle_capacity_weight'));
    assert.equal(gate.acceptedOverrides.length, 0);
  });

  it('YUK BILGISI eksikse de veri doldurulmali', () => {
    const checks = evaluateVehicle(vehicle(), demand({ totalWeightKg: null }), AT);
    const gate = resolveApplyGate(checks);
    assert.ok(gate.needsData.some((item) => item.code === 'vehicle_capacity_weight'));
  });

  it('belge tarihi eksikse de beyanla gecilemez', () => {
    const checks = evaluateDriver(driver({ licenseExpiresAt: null }), AT);
    const gate = resolveApplyGate(checks, [{ code: 'driver_license', note: 'ehliyeti gordum gecerli' }]);
    assert.equal(gate.applicable, false);
    assert.ok(gate.needsData.some((item) => item.code === 'driver_license'));
  });
});

describe('Uygulama kapisi — ADR ACIK SECIM ister', () => {
  it('yuk ADR mi bilinmiyorsa politika `explicit_choice`', () => {
    const check = evaluateAdr(true, 'unknown');
    assert.equal(check.status, 'unknown');
    assert.equal(check.override, 'explicit_choice');
  });

  it('SECIM YAPILMADAN plan uygulanamaz', () => {
    const gate = resolveApplyGate([evaluateAdr(true, 'unknown')]);
    assert.equal(gate.applicable, false);
    assert.ok(gate.needsDeclaration.some((item) => item.code === 'vehicle_adr'));
  });

  it('aciklama yeterli DEGIL — bir SECIM gerekiyor', () => {
    const gate = resolveApplyGate([evaluateAdr(true, 'unknown')], [
      { code: 'vehicle_adr', note: 'muhtemelen tehlikeli madde degil' },
    ]);
    assert.equal(gate.applicable, false);
  });

  it('acik secimle uygulanabilir ve karar `manual_override`', () => {
    const gate = resolveApplyGate([evaluateAdr(true, 'unknown')], [
      { code: 'vehicle_adr', answer: 'no' },
    ]);
    assert.equal(gate.applicable, true);
    assert.equal(gate.mode, 'manual_override');
  });

  it('BELGELI arac + belirsiz yuk -> ACIK SECIM (iki cevap da guvenli)', () => {
    const check = evaluateAdr(true, 'unknown');
    assert.equal(check.status, 'unknown');
    assert.equal(check.override, 'explicit_choice');
  });

  it('BELGESIZ arac + belirsiz yuk -> `incompatible`, SECIM SORULMAZ', () => {
    // Kritik sira: once secim sorsaydik, "evet ADR" cevabi yetkisiz araci
    // bir beyanla gecirirdi. Belirsizligi cozmek yetkisiz araci yetkili yapmaz.
    const check = evaluateAdr(false, 'unknown');
    assert.equal(check.status, 'incompatible');
    assert.equal(check.override, undefined);
    const gate = resolveApplyGate([check], [{ code: 'vehicle_adr', answer: 'yes' }]);
    assert.equal(gate.applicable, false);
  });

  it('BELGESI BILINMEYEN arac + belirsiz yuk -> VERI isteniyor', () => {
    const check = evaluateAdr(null, 'unknown');
    assert.equal(check.override, 'none');
  });

  it('ARAC BELGESI bilinmiyorsa secim degil VERI isteniyor', () => {
    // Eksik arac kaydini kullaniciya onaylatmak, veri girisini atlatmak olurdu.
    const check = evaluateAdr(null, 'yes');
    assert.equal(check.override, 'none');
    const gate = resolveApplyGate([check], [{ code: 'vehicle_adr', answer: 'yes' }]);
    assert.equal(gate.applicable, false);
  });
});

describe('Uygulama kapisi — temiz aday', () => {
  it('her sey `verified` ise beyan gerekmez ve mod `direct`', () => {
    const result = evaluateCandidate({ vehicle: vehicle(), driver: driver(), demand: demand(), at: AT });
    const gate = resolveApplyGate(result.checks);
    assert.equal(gate.applicable, true);
    assert.equal(gate.mode, 'direct');
    assert.equal(gate.decision, 'eligible');
    assert.equal(gate.acceptedOverrides.length, 0);
  });

  it('ILGISIZ bir beyan modu `manual_override` YAPMAZ', () => {
    const result = evaluateCandidate({ vehicle: vehicle(), driver: driver(), demand: demand(), at: AT });
    const gate = resolveApplyGate(result.checks, [{ code: 'driver_drive_time', note: 'gereksiz beyan' }]);
    assert.equal(gate.mode, 'direct');
  });
});

// ---------------------------------------------------------------------------
// Beyanin KAPSAMI — baska gune/oneriye tasinamaz
// ---------------------------------------------------------------------------

describe('Override beyani KAPSAMA KILITLI', () => {
  const scope = {
    dispatchProposalId: 'dp-1',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    workDate: '2026-09-01',
    proposalRevision: 3,
  };
  const declaration = {
    code: 'driver_drive_time',
    note: 'surucu kartini elle okudum, 6 saat kaldi',
    scope,
  };
  const noTacho = () => evaluateDriver(driver({ remainingDriveMinutes: null }), AT);

  it('tam eslesen kapsamda beyan GECERLI', () => {
    const gate = resolveApplyGate(noTacho(), [declaration], scope);
    assert.equal(gate.applicable, true);
    assert.equal(gate.mode, 'manual_override');
  });

  it('BASKA GUNE tasinamaz', () => {
    const gate = resolveApplyGate(noTacho(), [declaration], { ...scope, workDate: '2026-09-02' });
    assert.equal(gate.applicable, false);
  });

  it('BASKA SURUCUYE tasinamaz', () => {
    const gate = resolveApplyGate(noTacho(), [declaration], { ...scope, driverId: 'drv-2' });
    assert.equal(gate.applicable, false);
  });

  it('BASKA ARACA tasinamaz', () => {
    const gate = resolveApplyGate(noTacho(), [declaration], { ...scope, vehicleId: 'veh-2' });
    assert.equal(gate.applicable, false);
  });

  it('BASKA ONERIYE tasinamaz', () => {
    const gate = resolveApplyGate(noTacho(), [declaration], { ...scope, dispatchProposalId: 'dp-2' });
    assert.equal(gate.applicable, false);
  });

  it('ONERI YENIDEN HESAPLANDIYSA eski beyan gecersiz', () => {
    // Damga degisti: araclar ya da siparis degismis olabilir.
    const gate = resolveApplyGate(noTacho(), [declaration], { ...scope, proposalRevision: 4 });
    assert.equal(gate.applicable, false);
  });

  it('KAPSAMSIZ beyan, baglam varken GECERSIZ', () => {
    const gate = resolveApplyGate(
      noTacho(),
      [{ code: 'driver_drive_time', note: 'kartina baktim, suresi var' }],
      scope,
    );
    assert.equal(gate.applicable, false);
  });

  it('scopeMatches tek tek dogrulanabiliyor', () => {
    assert.equal(scopeMatches(declaration, scope), true);
    assert.equal(scopeMatches(declaration, { ...scope, workDate: '2026-09-03' }), false);
    // Baglam yoksa kapsam ARANMAZ (birim testi / onizleme yolu).
    assert.equal(scopeMatches(declaration, null), true);
  });
});
