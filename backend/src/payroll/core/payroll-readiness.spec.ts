import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WageTypeRule } from './payroll-movement.mapper';
import {
  evaluatePayrollReadiness,
  profileAt,
  type ReadinessInput,
  type ReadinessProfile,
} from './payroll-readiness';

const ASOF = new Date('2026-08-31T00:00:00.000Z');

function profile(overrides: Partial<ReadinessProfile> = {}): ReadinessProfile {
  return {
    driverId: 'driver-a',
    personnelNumber: '1001',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    ...overrides,
  };
}

function wageRule(movementType: WageTypeRule['movementType']): WageTypeRule {
  return {
    targetSystem: 'datev_lodas',
    movementType,
    externalWageType: '1000',
    enabled: true,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    costCenter: null,
    costUnit: null,
  };
}

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    periodStatus: 'approved',
    targetSystem: 'datev_lodas',
    consultantNumber: '12345',
    clientNumber: '54321',
    driverIds: ['driver-a'],
    profiles: [profile()],
    usedMovementTypes: ['regular_hours'],
    wageTypeRules: [wageRule('regular_hours')],
    dayAnomalies: new Map(),
    asOf: ASOF,
    ...overrides,
  };
}

function codes(result: { issues: Array<{ code: string }> }): string[] {
  return [...new Set(result.issues.map((issue) => issue.code))].sort();
}

describe('evaluatePayrollReadiness', () => {
  it('her sey yerindeyse hazir', () => {
    const result = evaluatePayrollReadiness(input());

    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
  });

  it('onaylanmamis donemi hazir saymaz', () => {
    // approved ile DATEV-bereit ayri seyler ama onay olmadan da olmuyor.
    assert.deepEqual(codes(evaluatePayrollReadiness(input({ periodStatus: 'draft' }))), [
      'period_not_approved',
    ]);
  });

  it('ihrac edilmis donemi hazir saymaya devam eder', () => {
    // Yeni surum uretilebilmeli; export durumu kapiyi kapatmamali.
    assert.equal(evaluatePayrollReadiness(input({ periodStatus: 'exported' })).ready, true);
  });

  it('DATEV hedefinde eksik Berater/Mandant ayri ayri bildirilir', () => {
    const result = evaluatePayrollReadiness(
      input({ consultantNumber: '  ', clientNumber: null }),
    );

    assert.deepEqual(codes(result), ['client_number_missing', 'consultant_number_missing']);
  });

  it('hedef secilmemisken Berater/Mandant SORULMAZ', () => {
    // Hangi saglayiciya gidildigi bilinmeden bu iki numarayi istemek, Lexware
    // secmek uzere olan kullaniciya asla kapanmayacak bir hata gosterirdi.
    const result = evaluatePayrollReadiness(
      input({ targetSystem: null, consultantNumber: null, clientNumber: null }),
    );

    assert.deepEqual(codes(result), ['target_system_not_configured']);
  });

  it('Lexware hedefi Berater/Mandant olmadan hazir sayilir', () => {
    // Lexware ASCII import'unda Berater-/Mandantennummer diye bir alan yok;
    // DATEV'in kosulunu ona da uygulamak donemi kalici olarak bloklardi.
    const result = evaluatePayrollReadiness(
      input({
        targetSystem: 'lexware_lohn_und_gehalt',
        consultantNumber: null,
        clientNumber: null,
        wageTypeRules: [{ ...wageRule('regular_hours'), targetSystem: 'lexware_lohn_und_gehalt' }],
      }),
    );

    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
  });

  it('Lexware hedefinde DATEV Lohnart eslemesi gecerli sayilmaz', () => {
    // Esleme urun bazinda: LODAS icin girilmis numara Lexware dosyasina
    // konulsaydi sessizce yanlis Lohnart'a yazardi.
    const result = evaluatePayrollReadiness(
      input({ targetSystem: 'lexware_lohn_und_gehalt', consultantNumber: null, clientNumber: null }),
    );

    assert.deepEqual(codes(result), ['wage_type_unmapped']);
  });

  it('personel numarasi olmayan surucuyu bloklar', () => {
    const result = evaluatePayrollReadiness(input({ profiles: [] }));

    assert.equal(result.ready, false);
    assert.equal(result.issues[0].code, 'personnel_number_missing');
    assert.equal(result.issues[0].driverId, 'driver-a');
  });

  it('ayni numarayi ayni anda iki suruculye vermeyi bloklar', () => {
    // Veritabani kisidiyla zorlanamiyor cunku profil surumlu; izin verilseydi
    // DATEV'de iki kisinin saatleri tek satirda birlesirdi.
    const result = evaluatePayrollReadiness(
      input({
        driverIds: ['driver-a', 'driver-b'],
        profiles: [profile(), profile({ driverId: 'driver-b' })],
      }),
    );

    assert.ok(codes(result).includes('personnel_number_duplicate'));
    assert.equal(
      result.issues.find((i) => i.code === 'personnel_number_duplicate')?.detail,
      '1001',
    );
  });

  it('ayni surucunun ARDISIK surumlerini cakisma saymaz', () => {
    const result = evaluatePayrollReadiness(
      input({
        profiles: [
          profile({ validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: new Date('2026-06-30T00:00:00.000Z') }),
          profile({ validFrom: new Date('2026-07-01T00:00:00.000Z') }),
        ],
      }),
    );

    assert.equal(result.ready, true);
  });

  it('cakisan profil surumlerini bloklar', () => {
    const result = evaluatePayrollReadiness(
      input({
        profiles: [
          profile({ validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: new Date('2026-08-31T00:00:00.000Z') }),
          profile({ validFrom: new Date('2026-06-01T00:00:00.000Z'), personnelNumber: '1009' }),
        ],
      }),
    );

    assert.ok(codes(result).includes('overlapping_profile_versions'));
  });

  it('yalnizca KULLANILAN hareket turlerinin eslemesini arar', () => {
    // Donemde Pazar calismasi yoksa Pazar eslemesinin olmamasi engel degil.
    const withoutSunday = evaluatePayrollReadiness(input());
    assert.equal(withoutSunday.ready, true);

    const withSunday = evaluatePayrollReadiness(
      input({ usedMovementTypes: ['regular_hours', 'sunday_hours'] }),
    );
    assert.deepEqual(codes(withSunday), ['wage_type_unmapped']);
    assert.equal(
      withSunday.issues.find((i) => i.code === 'wage_type_unmapped')?.movementType,
      'sunday_hours',
    );
  });

  it('bloklayan gun anomalisini durdurur, bloklamayani gecirir', () => {
    const blocking = evaluatePayrollReadiness(
      input({ dayAnomalies: new Map([['driver-a', ['missing_clock_out']]]) }),
    );
    assert.deepEqual(codes(blocking), ['blocking_day_anomaly']);

    // Mola kisaligi ArbZG bulgusu; sureyi supheli yapmiyor. Takograf sapmasi
    // da dogrulama sinyali, hesap degil.
    const informational = evaluatePayrollReadiness(
      input({
        dayAnomalies: new Map([
          ['driver-a', ['break_shorter_than_required', 'tacho_break_mismatch']],
        ]),
      }),
    );
    assert.equal(informational.ready, true);
  });
});

describe('profileAt', () => {
  it('o tarihte gecerli surumu verir', () => {
    const profiles = [
      profile({ personnelNumber: 'ESKI', validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: new Date('2026-06-30T00:00:00.000Z') }),
      profile({ personnelNumber: 'YENI', validFrom: new Date('2026-07-01T00:00:00.000Z') }),
    ];

    assert.equal(profileAt(profiles, 'driver-a', new Date('2026-03-15T00:00:00.000Z'))?.personnelNumber, 'ESKI');
    assert.equal(profileAt(profiles, 'driver-a', ASOF)?.personnelNumber, 'YENI');
  });

  it('gecerli surum yoksa null doner', () => {
    assert.equal(
      profileAt([profile({ validFrom: new Date('2027-01-01T00:00:00.000Z') })], 'driver-a', ASOF),
      null,
    );
  });
});
