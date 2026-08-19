import { describe, expect, it } from 'vitest';
import {
  INTENT_FILTERS,
  LOW_CONFIDENCE_THRESHOLD,
  channelLabelKey,
  fieldLabelKey,
  intentLabelKey,
  intentTone,
  isLowConfidence,
  matchLabelKey,
  operationalFields,
  rejectionLabelKey,
  taskLabelKey,
  MAX_CONSIGNMENTS,
  emptyConsignment,
  toConsignmentDrafts,
  toNumberOrNull,
  validateConsignments,
} from './order-intake-view';

/**
 * SIPARIS GELEN KUTUSU — GORUNUM MANTIGI (Faz 16).
 *
 * Burasi bir GUVENLIK siniri degil: maskeleme ve eslestirme sunucuda yapiliyor.
 * Olculen sey, sunucunun soyledigini ekranin DOGRU gostermesi.
 */

describe('Niyet etiketleri', () => {
  it('dort niyetin ve "tumu" filtresinin anahtari var', () => {
    expect(INTENT_FILTERS).toEqual(['all', 'new_order', 'amendment', 'cancellation', 'unknown']);
    for (const intent of INTENT_FILTERS) {
      expect(intentLabelKey(intent)).toBe(`orderIntake.intent.${intent}`);
    }
  });

  it('taninmayan niyet `unknown`a duser — uydurma anahtar uretilmez', () => {
    expect(intentLabelKey('approve')).toBe('orderIntake.intent.unknown');
    expect(intentLabelKey('')).toBe('orderIntake.intent.unknown');
  });

  it('`unknown` NOTR DEGIL — gozden kacmamasi icin ayri ton', () => {
    // Notr bir ton, "anlamadim" sonucunu sessiz bir satir gibi gosterirdi.
    expect(intentTone('unknown')).toBe('outline');
    expect(intentTone('cancellation')).toBe('destructive');
    expect(intentTone('new_order')).toBe('default');
    expect(intentTone('amendment')).toBe('secondary');
  });
});

describe('Dusuk guven vurgusu', () => {
  it('esik sunucudakiyle AYNI', () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.5);
  });

  it('esigin altindaki skor vurgulanir', () => {
    expect(isLowConfidence(0.4)).toBe(true);
    expect(isLowConfidence(0.49)).toBe(true);
  });

  it('esik ve ustu vurgulanmaz', () => {
    expect(isLowConfidence(0.5)).toBe(false);
    expect(isLowConfidence(0.9)).toBe(false);
  });

  it('SKOR YOKSA dusuk SAYILMAZ — bos alan ile zayif alan ayni sey degil', () => {
    expect(isLowConfidence(undefined)).toBe(false);
  });
});

describe('Alan listesi', () => {
  it('yalnizca gelen alanlar ve SABIT sirayla gosterilir', () => {
    const fields = operationalFields({
      currency: 'EUR',
      customerName: 'Muster',
      intent: 'new_order',
    });
    expect(fields.map((item) => item.field)).toEqual(['intent', 'customerName', 'currency']);
  });

  it('MASKELENMIS alan GIZLENMIYOR, `null` deger olarak duruyor', () => {
    // Sunucu finansal alani siliyor degil `null` yaziyor; ekran da satiri
    // koruyor ki kullanici degerin GIRILMEMIS oldugunu sanmasin.
    const fields = operationalFields({ revenueAmount: null, customerName: 'Muster' });
    expect(fields).toContainEqual({ field: 'revenueAmount', value: null });
  });

  it('sozlesmede olmayan alan ekrana SIZMAZ', () => {
    const fields = operationalFields({ companyId: 'cmp-1', vehicleId: 'veh-1', intent: 'new_order' });
    expect(fields.map((item) => item.field)).toEqual(['intent']);
  });
});

describe('Etiket anahtarlari', () => {
  it('kalem alanlari normalize ediliyor', () => {
    expect(fieldLabelKey('consignments[0].pickupAddress')).toBe(
      'orderIntake.field.consignment.pickupAddress',
    );
    expect(fieldLabelKey('consignments[3].adr')).toBe('orderIntake.field.consignment.adr');
  });

  it('duz alanlar oldugu gibi', () => {
    expect(fieldLabelKey('customerNumber')).toBe('orderIntake.field.customerNumber');
  });

  it('kanal anahtari BIRLESTIRME ile degil islevle uretiliyor', () => {
    expect(channelLabelKey('connector_mailbox')).toBe('orderIntake.channel.connector_mailbox');
    // Taninmayan kanal var olmayan bir anahtara cozulmez.
    expect(channelLabelKey('gizli')).toBe('orderIntake.channel.web_eml');
  });

  it('eslestirme durumlari icin anahtar uretiliyor', () => {
    expect(matchLabelKey('company', 'customer_number')).toBe('orderIntake.companyMatch.customer_number');
    expect(matchLabelKey('order', 'external_reference')).toBe('orderIntake.orderMatch.external_reference');
    expect(matchLabelKey('company', undefined)).toBe('orderIntake.companyMatch.unknown');
  });

  it('gorev sirasi dogru etikete gidiyor', () => {
    expect(taskLabelKey(1)).toBe('orderIntake.tasks.operational');
    expect(taskLabelKey(2)).toBe('orderIntake.tasks.financial');
  });

  it('bilinmeyen red kodu GENEL mesaja duser — ham kod ekrana yazilmaz', () => {
    expect(rejectionLabelKey('intake_file_encrypted')).toBe('orderIntake.rejection.intake_file_encrypted');
    expect(rejectionLabelKey('bilinmeyen_kod')).toBe('orderIntake.rejection.generic');
  });
});

describe('Kalem duzenleme', () => {
  it('sinir sunucudakiyle AYNI', () => {
    expect(MAX_CONSIGNMENTS).toBe(20);
  });

  it('yeni kalem ADR `unknown` ile aciliyor — sessizce `no` OLMUYOR', () => {
    expect(emptyConsignment().adrStatus).toBe('unknown');
  });

  it('oneriden COK KALEMLI taslak turetiliyor', () => {
    const drafts = toConsignmentDrafts({
      consignments: [
        { pickupAddress: 'Duisburg', deliveryAddress: 'Hamburg', cargoDescription: 'Teile', adr: 'no', weightKg: 8400 },
        { pickupAddress: 'Koeln', deliveryAddress: 'Berlin', cargoDescription: 'Ersatz', adr: 'yes', palletCount: 6 },
      ],
    });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.adrStatus).toBe('no');
    expect(drafts[1]!.adrStatus).toBe('yes');
    expect(drafts[1]!.palletCount).toBe(6);
  });

  it('TANINMAYAN ADR degeri `unknown`a duser — `no`ya DEGIL', () => {
    const drafts = toConsignmentDrafts({ consignments: [{ adr: 'vielleicht' }] });
    expect(drafts[0]!.adrStatus).toBe('unknown');
  });

  it('kalem yoksa bos liste', () => {
    expect(toConsignmentDrafts({})).toEqual([]);
    expect(toConsignmentDrafts({ consignments: 'bozuk' })).toEqual([]);
  });

  it('sinirin uzerindeki kalemler KIRPILIYOR', () => {
    const many = Array.from({ length: 25 }, () => ({ pickupAddress: 'A' }));
    expect(toConsignmentDrafts({ consignments: many })).toHaveLength(MAX_CONSIGNMENTS);
  });

  it('eksik zorunlu alan gecersiz sayiliyor ve INDEKSI bildiriliyor', () => {
    const result = validateConsignments([
      { pickupAddress: 'A', deliveryAddress: 'B', cargoDescription: 'C' },
      { pickupAddress: 'A', deliveryAddress: '', cargoDescription: 'C' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.incompleteIndexes).toEqual([1]);
  });

  it('tam kalemler gecerli', () => {
    const result = validateConsignments([
      { pickupAddress: 'A', deliveryAddress: 'B', cargoDescription: 'C' },
    ]);
    expect(result.valid).toBe(true);
  });

  it('BOS sayi `null` — `0` ile BOS ayni sey degil', () => {
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('   ')).toBeNull();
    expect(toNumberOrNull('0')).toBe(0);
    expect(toNumberOrNull('8,5')).toBe(8.5);
    expect(toNumberOrNull('abc')).toBeNull();
  });
});
