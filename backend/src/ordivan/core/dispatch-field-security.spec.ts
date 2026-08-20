import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MASKED_REASON_KEY,
  auditSafeMetadata,
  auditSafeSlotMetadata,
  canSeeDispatchFinancials,
  isFinancialName,
  maskDispatchFinancials,
  maskEvidenceRecord,
  maskFreeText,
  maskReasonKey,
  textRevealsFinancials,
} from './dispatch-field-security';

/**
 * DISPATCH FINANS MASKESI (Faz 17f).
 *
 * Olculen sey "maske calisiyor mu" degil, IKI YONLU dogruluk: korunan alan
 * gercekten gidiyor mu, VE korunmayan alan yanlislikla goturulmuyor mu.
 * Ikincisi en az birincisi kadar onemli — asiri maskeleyen bir filtre
 * calisiyor gorunur ama dispatcher'in zaman damgalarini yok eder.
 */

const OFFICE = 'office';
const ACCOUNTING = 'accounting';

describe('Rol kapisi', () => {
  it('finans rolleri repodaki FINANCIAL_ROLES ile ayni', () => {
    assert.equal(canSeeDispatchFinancials('admin'), true);
    assert.equal(canSeeDispatchFinancials('boss'), true);
    assert.equal(canSeeDispatchFinancials(ACCOUNTING), true);
    assert.equal(canSeeDispatchFinancials(OFFICE), false);
    assert.equal(canSeeDispatchFinancials('driver'), false);
    assert.equal(canSeeDispatchFinancials(undefined), false);
  });
});

describe('Ad eslestirmesi', () => {
  it('finansal adlari yakaliyor', () => {
    for (const name of [
      'contractedRevenue',
      'expectedDailyRevenue',
      'currency',
      'billingMode',
      'totalPrice',
      'netAmount',
      'plannedTollCents',
      'frachtpreis',
      'gesamtbetrag',
      'navlunTutari',
      'unit_cost',
      'daily_rate',
    ]) {
      assert.equal(isFinancialName(name), true, name);
    }
  });

  /**
   * EN ONEMLI TEST.
   *
   * Faz 16'nin `isFinancialField`i ALT DIZGE ariyor ve `ope[rate]dAt`,
   * `gene[rate]dAt` gibi adlari finansal sanardi. O eslestirici govdenin
   * tamamini tarayan bu maskede kullanilsaydi dispatcher zaman damgalarini
   * kaybederdi — ve maske "calisiyor" gorunecegi icin bu, fark edilmesi en
   * zor turden bir hata olurdu.
   */
  it('YANLIS POZITIF URETMIYOR — kelime siniri var', () => {
    for (const name of [
      'operatedAt',
      'generatedAt',
      'separateStops',
      'accurateEta',
      'corporateId',
      'decoratedName',
      'status',
      'workDate',
      'totalDistanceKm',
      'totalDurationMin',
      // Nicelik belirtecleri finansal DEGIL: mesafe, sure ve agirlik
      // maskelenirse plan okunamaz hale gelir.
      'netWeightKg',
      'grossWeightKg',
      'sumOfStops',
      'palletCount',
    ]) {
      assert.equal(isFinancialName(name), false, name);
    }
  });

  it('para desenini metinde yakaliyor', () => {
    assert.equal(textRevealsFinancials('Auftrag 1.250,00 EUR bestaetigt'), true);
    assert.equal(textRevealsFinancials('€ 900 offen'), true);
    assert.equal(textRevealsFinancials('Fahrzeug in der Werkstatt'), false);
  });
});

describe('Kanit maskesi', () => {
  it('anahtar KALIYOR, deger gidiyor', () => {
    const masked = maskEvidenceRecord(
      { requiredKg: 1200, capacityKg: 4000, expectedRevenue: 950 },
      OFFICE,
    );
    // Operasyonel kanit oldugu gibi duruyor.
    assert.equal(masked?.requiredKg, 1200);
    assert.equal(masked?.capacityKg, 4000);
    // Finansal kanit gorulemiyor ama VARLIGI biliniyor.
    assert.ok('expectedRevenue' in (masked ?? {}));
    assert.equal(masked?.expectedRevenue, null);
  });

  it('deger METIN olarak tutar tasiyorsa da gidiyor', () => {
    const masked = maskEvidenceRecord({ note: 'Zuschlag 120,00 EUR' }, OFFICE);
    assert.equal(masked?.note, null);
  });

  it('finans rolunde hicbir sey degismiyor', () => {
    const evidence = { expectedRevenue: 950 };
    assert.equal(maskEvidenceRecord(evidence, ACCOUNTING), evidence);
  });
});

describe('Gerekce ve serbest metin', () => {
  it('finansi ele veren ceviri anahtari notrlestiriliyor', () => {
    assert.equal(maskReasonKey('revenue_below_target', OFFICE), MASKED_REASON_KEY);
    assert.equal(maskReasonKey('vehicle_capacity_exceeded', OFFICE), 'vehicle_capacity_exceeded');
    assert.equal(maskReasonKey('revenue_below_target', ACCOUNTING), 'revenue_below_target');
  });

  it('tutar tasiyan red gerekcesi ofise gitmiyor', () => {
    assert.equal(maskFreeText('Preis zu niedrig: 400 EUR', OFFICE), null);
    assert.equal(maskFreeText('Fahrer nicht verfuegbar', OFFICE), 'Fahrer nicht verfuegbar');
    assert.equal(maskFreeText('Preis zu niedrig: 400 EUR', ACCOUNTING), 'Preis zu niedrig: 400 EUR');
  });
});

describe('Derin maske', () => {
  it('IC ICE finansal alanlari null yapiyor', () => {
    const payload = {
      id: 'dp-1',
      generatedAt: '2026-09-01T08:00:00.000Z',
      orders: [
        { orderNumber: 'A-1', contractedRevenue: 1250, currency: 'EUR', billingMode: 'on_order_completion' },
      ],
      candidates: [{ rank: 1, checks: [{ code: 'c', evidence: { expectedRevenue: 900 } }] }],
    };

    const masked = maskDispatchFinancials(payload, OFFICE);
    assert.equal(masked.orders[0]!.contractedRevenue, null);
    assert.equal(masked.orders[0]!.currency, null);
    assert.equal(masked.orders[0]!.billingMode, null);
    assert.equal(masked.candidates[0]!.checks[0]!.evidence.expectedRevenue, null);
    // Operasyonel alanlar DOKUNULMAMIS.
    assert.equal(masked.orders[0]!.orderNumber, 'A-1');
    assert.equal(masked.generatedAt, '2026-09-01T08:00:00.000Z');
    assert.equal(masked.candidates[0]!.rank, 1);
  });

  /**
   * REGRESYON: kimlikler kurban edilmiyor.
   *
   * Derin tarama bir ara dizge DEGERLERINDE de ad eslestirmesi yapiyordu ve
   * `order_margin` kontrol KODUNU `null` yapiyordu — dispatcher hangi
   * kontrolu astigini goremez hale gelirdi. Kod bir tutar degil, bir kimlik.
   */
  it('kimlik ve ad DIZGELERI maskelenmiyor — yalnizca gercek tutarlar', () => {
    const masked = maskDispatchFinancials(
      {
        checkCode: 'order_margin',
        companyName: 'Preiss GmbH',
        reasonKey: 'capacity_sufficient',
        note: 'Zuschlag 120,00 EUR',
      },
      OFFICE,
    );
    assert.equal(masked.checkCode, 'order_margin');
    assert.equal(masked.companyName, 'Preiss GmbH');
    assert.equal(masked.reasonKey, 'capacity_sufficient');
    // Gercek bir TUTAR tasiyan deger yine de gidiyor.
    assert.equal(masked.note, null);
  });

  it('finans rolunde nesne AYNEN doner', () => {
    const payload = { orders: [{ contractedRevenue: 1250 }] };
    assert.equal(maskDispatchFinancials(payload, ACCOUNTING), payload);
  });

  it('Date nesnesini bozmuyor', () => {
    const when = new Date('2026-09-01T08:00:00.000Z');
    const masked = maskDispatchFinancials({ when }, OFFICE);
    assert.equal(masked.when instanceof Date, true);
    assert.equal(masked.when.toISOString(), when.toISOString());
  });
});

describe('Denetim metadata', () => {
  it('tutar denetime HIC yazilmiyor — alan tamamen dusuyor', () => {
    const safe = auditSafeMetadata({
      tourId: 't-1',
      orderCount: 2,
      contractedRevenue: 1250,
      note: 'Zuschlag 120 EUR',
    });
    assert.deepEqual(safe, { tourId: 't-1', orderCount: 2 });
  });

  it('token ve ozet denetime yazilmiyor', () => {
    const safe = auditSafeSlotMetadata({
      slotId: 's-1',
      kind: 'delivery',
      token: 'plain-text-token',
      tokenHash: 'deadbeef',
      tokenPrefix: 'dead',
      connectorSecret: 'x',
    });
    assert.deepEqual(safe, { slotId: 's-1', kind: 'delivery' });
  });
});
