import { describe, expect, it } from 'vitest';
import {
  ADR_CHOICES,
  CAPACITY_FIELDS,
  CAPACITY_FIELD_COUNT,
  buildCapacityPayload,
  isDirty,
  specFor,
  toDraft,
  unverifiedCount,
  validateDraft,
  validateField,
  type CapacityDraft,
} from './vehicle-capacity';

/**
 * ARAC KAPASITESI (Faz 17g).
 *
 * EN ONEMLI IKI IDDIA:
 *   1. Sinirlar SUNUCU SOZLESMESIYLE AYNI — arayuz sunucunun reddedecegi bir
 *      degeri kabul etmiyor, kabul ettigi bir degeri de engellemiyor.
 *   2. BOS ALAN `null` — "0" ya da "hayir" DEGIL. Bunu karistiran bir arayuz
 *      eksik veriyi kesin bir cevap gibi sunardi.
 */

function emptyDraft(): CapacityDraft {
  return toDraft({});
}

describe('Alan sozlesmesi', () => {
  it('yedi sayisal alan + uc durumlu ADR', () => {
    expect(CAPACITY_FIELDS).toHaveLength(7);
    expect(CAPACITY_FIELD_COUNT).toBe(8);
  });

  /**
   * Bu degerler backend `update-vehicle.dto.ts` ile BIREBIR ayni olmali.
   * Biri degisip digeri degismezse kullanici ya 400 alir ya da gecerli bir
   * degeri giremez.
   */
  it('ust sinirlar backend DTO ile ayni', () => {
    expect(specFor('payload_capacity_kg').max).toBe(100_000);
    expect(specFor('cargo_volume_m3').max).toBe(1_000);
    expect(specFor('pallet_capacity').max).toBe(100);
    expect(specFor('gross_weight_kg').max).toBe(100_000);
    expect(specFor('height_cm').max).toBe(500);
    expect(specFor('length_cm').max).toBe(3_000);
    expect(specFor('width_cm').max).toBe(400);
  });

  it('ondalik basamaklar backend ile ayni', () => {
    expect(specFor('payload_capacity_kg').decimals).toBe(2);
    expect(specFor('cargo_volume_m3').decimals).toBe(3);
    // `@IsInt()` olanlar ondalik KABUL ETMIYOR.
    expect(specFor('pallet_capacity').decimals).toBe(0);
    expect(specFor('height_cm').decimals).toBe(0);
  });

  it('ADR UC secenek sunuyor — bilinmiyor da bir secim', () => {
    expect(ADR_CHOICES.map((choice) => choice.value)).toEqual([true, false, null]);
  });
});

describe('Alan dogrulamasi', () => {
  it('BOS metin hata DEGIL, `null` demek', () => {
    expect(validateField('payload_capacity_kg', '')).toEqual({ value: null, error: null });
    expect(validateField('payload_capacity_kg', '   ')).toEqual({ value: null, error: null });
  });

  it('sifir ve negatif REDDEDILIYOR — sunucudaki @IsPositive ile ayni', () => {
    // Kapasitesi sifir olan arac "arac degil"; bilinmiyorsa alan BOS kalmali.
    expect(validateField('payload_capacity_kg', '0').error).toBe('not_positive');
    expect(validateField('payload_capacity_kg', '-5').error).toBe('not_positive');
  });

  it('ust sinir asilamiyor', () => {
    expect(validateField('height_cm', '500').error).toBeNull();
    expect(validateField('height_cm', '501').error).toBe('too_large');
    expect(validateField('width_cm', '400').error).toBeNull();
    expect(validateField('width_cm', '401').error).toBe('too_large');
  });

  it('tam sayi alanina ondalik girilemiyor', () => {
    expect(validateField('pallet_capacity', '33').value).toBe(33);
    expect(validateField('pallet_capacity', '33.5').error).toBe('too_many_decimals');
  });

  it('ondalik basamak sayisi asilamiyor', () => {
    expect(validateField('cargo_volume_m3', '12.345').value).toBe(12.345);
    expect(validateField('cargo_volume_m3', '12.3456').error).toBe('too_many_decimals');
    expect(validateField('payload_capacity_kg', '1200.55').value).toBe(1200.55);
    expect(validateField('payload_capacity_kg', '1200.555').error).toBe('too_many_decimals');
  });

  it('VIRGUL kabul ediliyor — Almanca klavyede ondalik ayraci virgul', () => {
    expect(validateField('cargo_volume_m3', '12,5').value).toBe(12.5);
  });

  it('sayi olmayan girdi reddediliyor', () => {
    expect(validateField('payload_capacity_kg', 'abc').error).toBe('not_a_number');
  });
});

describe('Taslak ve govde', () => {
  it('`null` degerler BOS metne cevriliyor — "0" DEGIL', () => {
    const draft = toDraft({ payload_capacity_kg: null, pallet_capacity: 33 });
    expect(draft.payload_capacity_kg).toBe('');
    expect(draft.pallet_capacity).toBe('33');
  });

  it('bos alan `null` GONDERILIYOR, atlanmiyor', () => {
    // `undefined` "dokunma", `null` "temizle" demek. Kullanici bir degeri
    // sildiyse bu bir niyettir ve sessizce yok sayilmamali.
    const payload = buildCapacityPayload(emptyDraft());
    for (const spec of CAPACITY_FIELDS) {
      expect(payload[spec.key]).toBeNull();
    }
    expect(payload.adr_certified).toBeNull();
  });

  it('ADR ucu de govdeye giriyor', () => {
    expect(buildCapacityPayload({ ...emptyDraft(), adr_certified: true }).adr_certified).toBe(true);
    expect(buildCapacityPayload({ ...emptyDraft(), adr_certified: false }).adr_certified).toBe(false);
    expect(buildCapacityPayload({ ...emptyDraft(), adr_certified: null }).adr_certified).toBeNull();
  });

  it('gecerli govde sayilari tasiyor', () => {
    const draft: CapacityDraft = {
      ...emptyDraft(),
      payload_capacity_kg: '12000',
      cargo_volume_m3: '86,5',
      pallet_capacity: '33',
      adr_certified: true,
    };
    const payload = buildCapacityPayload(draft);
    expect(payload.payload_capacity_kg).toBe(12000);
    expect(payload.cargo_volume_m3).toBe(86.5);
    expect(payload.pallet_capacity).toBe(33);
  });

  it('taslak dogrulamasi hatali alanlari topluyor', () => {
    const errors = validateDraft({
      ...emptyDraft(),
      height_cm: '900',
      pallet_capacity: '2.5',
      cargo_volume_m3: '10',
    });
    expect(errors.height_cm).toBe('too_large');
    expect(errors.pallet_capacity).toBe('too_many_decimals');
    expect(errors.cargo_volume_m3).toBeUndefined();
  });
});

describe('Degisiklik ve eksik sayisi', () => {
  it('degisiklik yoksa kaydetme kapali kalir', () => {
    const saved = toDraft({ payload_capacity_kg: 12000, adr_certified: true });
    expect(isDirty({ ...saved }, saved)).toBe(false);
    expect(isDirty({ ...saved, payload_capacity_kg: '12500' }, saved)).toBe(true);
    // ADR degisikligi de bir degisikliktir.
    expect(isDirty({ ...saved, adr_certified: null }, saved)).toBe(true);
  });

  it('eksik alan sayisi ADR`yi de sayiyor', () => {
    expect(unverifiedCount({})).toBe(8);
    expect(unverifiedCount({ adr_certified: false })).toBe(7);
    expect(
      unverifiedCount({
        payload_capacity_kg: 1,
        cargo_volume_m3: 1,
        pallet_capacity: 1,
        gross_weight_kg: 1,
        height_cm: 1,
        length_cm: 1,
        width_cm: 1,
        adr_certified: true,
      }),
    ).toBe(0);
  });

  it('ADR `false` EKSIK DEGIL — acikca "yetkisiz" demek', () => {
    // `null`u `false`a indirmek belgesi girilmemis araci "ADR tasiyamaz" diye
    // elerdi; ikisi ayri sey ve sayimda da ayri.
    expect(unverifiedCount({ adr_certified: false })).toBeLessThan(unverifiedCount({}));
  });
});
