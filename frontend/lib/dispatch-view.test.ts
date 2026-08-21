import { describe, expect, it } from 'vitest';
import {
  MIN_OVERRIDE_NOTE_LENGTH,
  allDeclarationsComplete,
  blockingChecks,
  canApplyCandidate,
  checkLabelKey,
  checkTone,
  checksNeedingData,
  checksNeedingDeclaration,
  createDecisionKey,
  decisionTone,
  displayNumber,
  formatDurationMinutes,
  generationTone,
  isDeclarationComplete,
  isRouteEstimated,
  proposalStatusTone,
  reasonLabelKey,
  routeTone,
  type DeclarationDraft,
} from './dispatch-view';
import type { DispatchCheckView } from './types';

/**
 * DISPATCH GORUNUM MANTIGI (Faz 17g).
 *
 * Burasi bir GUVENLIK siniri degil — uygunluk ve maskeleme sunucuda. Olculen
 * sey, sunucunun soyledigini ekranin DOGRU gostermesi ve sunucunun
 * reddedecegi bir seyi MUMKUN gostermemesi.
 */

function check(overrides: Partial<DispatchCheckView> = {}): DispatchCheckView {
  return {
    code: 'vehicle_payload',
    status: 'verified',
    reasonKey: 'capacity_sufficient',
    overridable: false,
    ...overrides,
  };
}

describe('Uc durumlu kontrol tonu', () => {
  it('`unknown` NOTR DEGIL, UYARI', () => {
    // Dogrulanamamis bir sey dogrulanmis gibi sessiz gorunmemeli.
    expect(checkTone('unknown')).toBe('warning');
    expect(checkTone('verified')).toBe('positive');
    expect(checkTone('incompatible')).toBe('danger');
  });

  it('karar ve uretim tonlari', () => {
    expect(decisionTone('eligible')).toBe('positive');
    expect(decisionTone('blocked')).toBe('danger');
    expect(decisionTone('review_required')).toBe('warning');
    expect(generationTone('ready')).toBe('positive');
    expect(generationTone('failed')).toBe('danger');
    expect(generationTone('expired')).toBe('danger');
    expect(generationTone('queued')).toBe('neutral');
    expect(generationTone('processing')).toBe('neutral');
    expect(proposalStatusTone('approved')).toBe('positive');
    expect(proposalStatusTone('superseded')).toBe('warning');
    expect(proposalStatusTone('open')).toBe('neutral');
  });

  it('rota bozulmasi UYARI, basarisizlik TEHLIKE', () => {
    expect(routeTone('ok')).toBe('positive');
    expect(routeTone('degraded')).toBe('warning');
    expect(routeTone('failed')).toBe('danger');
    // Bozulmus rotada mesafe/sure bir TAHMIN — arayuz bunu isaretlemeli.
    expect(isRouteEstimated('ok')).toBe(false);
    expect(isRouteEstimated('degraded')).toBe(true);
    expect(isRouteEstimated('failed')).toBe(true);
  });
});

describe('Kontrol etiketleri', () => {
  it('bilinen kod cevrilir', () => {
    expect(checkLabelKey('driver_drive_time')).toBe('dispatch.check.driver_drive_time');
    // Kodlar SUNUCUDAKI uygunluk motoruyla birebir ayni olmali.
    expect(checkLabelKey('vehicle_capacity_weight')).toBe('dispatch.check.vehicle_capacity_weight');
    expect(checkLabelKey('time_windows')).toBe('dispatch.check.time_windows');
    expect(checkLabelKey('vehicle_available')).toBe('dispatch.check.vehicle_available');
  });

  it('BILINMEYEN kod null doner — gizlenmez, ham gosterilir', () => {
    // Sunucu yeni bir kontrol eklediginde arayuz onu saklamamali; aksi halde
    // dispatcher bilmedigi bir sebeple engellenmis plani anlayamaz.
    expect(checkLabelKey('brand_new_server_check')).toBeNull();
  });

  it('maskelenmis gerekce notr anahtara dusuyor', () => {
    // Sunucu ofise `masked_financial` gonderiyor; ekran "gorme yetkiniz yok"
    // demeli, ham kodu degil.
    expect(reasonLabelKey('masked_financial')).toBe('dispatch.reason.maskedFinancial');
  });

  /**
   * REGRESYON: sunucu TAM anahtari gonderiyor.
   *
   * On ek eklerdik ve `dispatch.reason.dispatch.reason.vehicleActive` cikardi;
   * ceviri bulunamaz ve ekranda HAM ANAHTAR gorunurdu.
   */
  it('tam anahtar CIFT ON EK almiyor', () => {
    expect(reasonLabelKey('dispatch.reason.vehicleActive')).toBe('dispatch.reason.vehicleActive');
    expect(reasonLabelKey('dispatch.reason.weightFits')).toBe('dispatch.reason.weightFits');
  });
});

describe('Beyan gruplari', () => {
  const checks = [
    check({ code: 'vehicle_status', status: 'incompatible' }),
    check({ code: 'driver_drive_time', status: 'unknown', overridable: true }),
    check({ code: 'vehicle_payload', status: 'unknown', overridable: false }),
    check({ code: 'driver_license', status: 'verified' }),
  ];

  it('yalnizca asilabilir `unknown` kontroller beyan bekliyor', () => {
    expect(checksNeedingDeclaration(checks).map((item) => item.code)).toEqual([
      'driver_drive_time',
    ]);
  });

  it('`incompatible` BEYANLA ASILAMAZ — beyan listesinde YOK', () => {
    // Yasal engel (ehliyet, aktiflik, bakim) bir beyanla gecilemez.
    expect(checksNeedingDeclaration(checks).some((item) => item.status === 'incompatible')).toBe(
      false,
    );
    expect(blockingChecks(checks).map((item) => item.code)).toEqual(['vehicle_status']);
  });

  it('veri eksigi ayri bir grup — beyan sorunu DEGIL', () => {
    expect(checksNeedingData(checks).map((item) => item.code)).toEqual(['vehicle_payload']);
  });
});

describe('Beyanin gecerliligi', () => {
  it('KAPSAMLI aciklama gerekiyor — "ok" beyan sayilmaz', () => {
    expect(isDeclarationComplete({ note: 'ok', answer: '' })).toBe(false);
    expect(isDeclarationComplete({ note: '   ', answer: '' })).toBe(false);
    expect(isDeclarationComplete({ note: 'surucu kartini elle okudum', answer: '' })).toBe(true);
  });

  it('acik secim: "bilmiyorum" bir cevap DEGIL', () => {
    expect(isDeclarationComplete({ note: '', answer: 'yes' })).toBe(true);
    expect(isDeclarationComplete({ note: '', answer: 'no' })).toBe(true);
    expect(isDeclarationComplete({ note: '', answer: '' })).toBe(false);
  });

  it('en az uzunluk sunucudaki kuralla ayni', () => {
    expect(MIN_OVERRIDE_NOTE_LENGTH).toBe(10);
    expect(isDeclarationComplete({ note: 'a'.repeat(9), answer: '' })).toBe(false);
    expect(isDeclarationComplete({ note: 'a'.repeat(10), answer: '' })).toBe(true);
  });

  it('bekleyen her beyan verilmeden tamam sayilmiyor', () => {
    const pending = [
      check({ code: 'driver_drive_time', status: 'unknown', overridable: true }),
      check({ code: 'time_window', status: 'unknown', overridable: true }),
    ];
    const partial: Record<string, DeclarationDraft> = {
      driver_drive_time: { note: 'karti elle okudum', answer: '' },
    };
    expect(allDeclarationsComplete(pending, partial)).toBe(false);
    expect(
      allDeclarationsComplete(pending, { ...partial, time_window: { note: '', answer: 'yes' } }),
    ).toBe(true);
  });
});

describe('Aday uygulanabilirligi', () => {
  it('BLOCKED aday hicbir beyanla uygulanamaz', () => {
    const checks = [check({ code: 'vehicle_status', status: 'incompatible' })];
    expect(canApplyCandidate(checks, {})).toBe(false);
    // Beyan verilse bile.
    expect(
      canApplyCandidate(checks, { vehicle_status: { note: 'sorumlulugu aliyorum', answer: '' } }),
    ).toBe(false);
  });

  it('veri eksigi beyanla gecilemez', () => {
    const checks = [check({ code: 'vehicle_payload', status: 'unknown', overridable: false })];
    expect(canApplyCandidate(checks, { vehicle_payload: { note: 'sorun yok, biliyorum', answer: '' } })).toBe(
      false,
    );
  });

  it('review_required yalnizca TAM beyanla uygulanabilir', () => {
    const checks = [check({ code: 'driver_drive_time', status: 'unknown', overridable: true })];
    expect(canApplyCandidate(checks, {})).toBe(false);
    expect(canApplyCandidate(checks, { driver_drive_time: { note: 'kisa', answer: '' } })).toBe(false);
    expect(
      canApplyCandidate(checks, {
        driver_drive_time: { note: 'surucu kartini elle okudum, 6 saat kaldi', answer: '' },
      }),
    ).toBe(true);
  });

  it('hepsi verified ise dogrudan uygulanabilir', () => {
    expect(canApplyCandidate([check(), check({ code: 'driver_license' })], {})).toBe(true);
  });
});

describe('Eksik alan gosterimi', () => {
  it('`null` "0" DEGIL — dogrulanamadi olarak isaretleniyor', () => {
    // 0 kg kapasite ile "kapasite girilmemis" ayni sey degil.
    expect(displayNumber(null, 'de-DE')).toEqual({ text: null, unknown: true });
    expect(displayNumber(undefined, 'de-DE')).toEqual({ text: null, unknown: true });
    expect(displayNumber(Number.NaN, 'de-DE')).toEqual({ text: null, unknown: true });
  });

  it('0 gercek bir deger — eksik SAYILMIYOR', () => {
    expect(displayNumber(0, 'de-DE').unknown).toBe(false);
  });

  it('sayi yerel bicimde', () => {
    expect(displayNumber(1250.5, 'de-DE').text).toBe('1.250,5');
  });

  it('sure bicimi', () => {
    expect(formatDurationMinutes(null)).toBeNull();
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(340)).toBe('5 h 40 min');
    expect(formatDurationMinutes(120)).toBe('2 h 0 min');
  });
});

describe('Karar anahtari', () => {
  it('her karar icin BENZERSIZ ve sinir icinde', () => {
    const first = createDecisionKey('approve', 'dp-123456789');
    const second = createDecisionKey('approve', 'dp-123456789');
    expect(first).not.toBe(second);
    expect(first.startsWith('approve-')).toBe(true);
    // Sunucu 8..128 karakter bekliyor.
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first.length).toBeLessThanOrEqual(128);
  });
});
