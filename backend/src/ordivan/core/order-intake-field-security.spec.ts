import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canOpenRawDocument,
  canSeeIntakeFinancials,
  isFinancialField,
  maskAuditMetadata,
  maskConfidence,
  maskDiff,
  maskEvidence,
  maskExtractionPayload,
  maskMessageSummary,
} from './order-intake-field-security';

/**
 * ROL BAZLI ALAN MASKELEMESI (Faz 16, bolum 7).
 *
 * Olculen sey "ekranda gorunuyor mu" degil, SUNUCU YANITINDA duruyor mu.
 */

const FULL = ['admin', 'boss', 'accounting'];
const OPERATIONAL = ['office'];

describe('Rol tanimi', () => {
  it('admin, boss ve muhasebe finansal alanlari gorur', () => {
    for (const role of FULL) assert.equal(canSeeIntakeFinancials(role), true, role);
  });

  it('OFIS finansal alanlari GORMEZ', () => {
    assert.equal(canSeeIntakeFinancials('office'), false);
  });

  it('rolsuz ve taninmayan rol GORMEZ', () => {
    for (const role of [null, undefined, '', 'driver', 'customer', 'gizli']) {
      assert.equal(canSeeIntakeFinancials(role), false, String(role));
    }
  });
});

describe('Cikarim govdesi', () => {
  const payload = { customerName: 'Muster', revenueAmount: 1250, currency: 'EUR', billingMode: 'per_delivery' };

  it('ofiste finansal alanlar `null`, operasyonel alanlar DURUYOR', () => {
    const masked = maskExtractionPayload(payload, 'office');
    assert.equal(masked.revenueAmount, null);
    assert.equal(masked.currency, null);
    assert.equal(masked.billingMode, null);
    assert.equal(masked.customerName, 'Muster');
    assert.equal((masked as Record<string, unknown>).financialFieldsMasked, true);
  });

  it('ALANLAR SILINMIYOR, `null` yaziliyor — yokluk ile gizlilik ayni sey degil', () => {
    const masked = maskExtractionPayload(payload, 'office');
    assert.equal('revenueAmount' in masked, true);
  });

  it('muhasebe tam govdeyi gorur', () => {
    assert.equal(maskExtractionPayload(payload, 'accounting').revenueAmount, 1250);
  });
});

describe('KANIT — snippet fiyat tasiyabilir', () => {
  const evidence = {
    extractorVersion: 'mock@1',
    entries: [
      { field: 'consignments[0].pickupAddress', source: 'body', snippet: 'Ladestelle: Duisburg', financial: false },
      { field: 'revenueAmount', source: 'body', snippet: 'Frachtpreis: 1.250,00 EUR', financial: true },
    ],
  };

  it('ofiste FIYAT snippet`i gizleniyor, operasyonel snippet DURUYOR', () => {
    const masked = maskEvidence(evidence, 'office')!;
    const entries = masked.entries as Array<Record<string, unknown>>;
    assert.equal(entries[0]!.snippet, 'Ladestelle: Duisburg');
    assert.equal(entries[1]!.snippet, null);
    assert.equal(entries[1]!.masked, true);
  });

  it('SATIR SILINMIYOR — "kanit yok" ile "goremiyorum" ayni sey degil', () => {
    const masked = maskEvidence(evidence, 'office')!;
    assert.equal((masked.entries as unknown[]).length, 2);
  });

  it('maskelenmis kanitta fiyat metni HICBIR YERDE yok', () => {
    const serialized = JSON.stringify(maskEvidence(evidence, 'office'));
    assert.equal(serialized.includes('1.250'), false);
    assert.equal(serialized.includes('Frachtpreis'), false);
  });

  it('muhasebe tam kaniti gorur', () => {
    const masked = maskEvidence(evidence, 'accounting')!;
    assert.equal((masked.entries as Array<Record<string, unknown>>)[1]!.snippet, 'Frachtpreis: 1.250,00 EUR');
  });
});

describe('Guven skorlari ve diff', () => {
  it('finansal alanlarin guven skoru ofiste GONDERILMIYOR', () => {
    const masked = maskConfidence({ customerName: 0.9, revenueAmount: 0.6, currency: 0.6 }, 'office')!;
    assert.deepEqual(Object.keys(masked), ['customerName']);
  });

  it('revizyon diff`inde ESKI/YENI TUTAR gizleniyor, alan adi kaliyor', () => {
    const changes = [
      { field: 'notes', before: 'a', after: 'b' },
      { field: 'contractedRevenue', before: '1250.00', after: '1400.00' },
    ];
    const masked = maskDiff(changes, 'office');
    assert.deepEqual(masked[0], { field: 'notes', before: 'a', after: 'b' });
    assert.deepEqual(masked[1], { field: 'contractedRevenue', before: null, after: null, masked: true });
  });
});

describe('Liste ve ARAMA ozeti', () => {
  it('fiyat iceren mesajda konu ofiste maskeleniyor', () => {
    const masked = maskMessageSummary(
      { id: 'm1', subject: 'Auftrag 1.250 EUR', bodyPreview: 'Frachtpreis 1.250,00 EUR', containsFinancialData: 'yes' },
      'office',
    );
    assert.equal(masked.subject, null);
    assert.equal(masked.bodyPreview, null);
    assert.equal((masked as Record<string, unknown>).subjectMasked, true);
  });

  it('fiyat TASIMAYAN mesajin konusu ofiste GORUNUR', () => {
    const masked = maskMessageSummary(
      { id: 'm1', subject: 'Transportauftrag KD-1', containsFinancialData: 'no' },
      'office',
    );
    assert.equal(masked.subject, 'Transportauftrag KD-1');
  });

  it('`unknown` GUVENLI SAYILMIYOR — maskeleniyor', () => {
    const masked = maskMessageSummary({ id: 'm1', subject: 'Auftrag', containsFinancialData: 'unknown' }, 'office');
    assert.equal(masked.subject, null);
  });

  it('isaret hic yoksa da maskeleniyor', () => {
    assert.equal(maskMessageSummary({ id: 'm1', subject: 'Auftrag' }, 'office').subject, null);
  });
});

describe('HAM BELGE erisimi', () => {
  it('finansal rol her belgeyi acabilir', () => {
    for (const role of FULL) {
      for (const flag of ['yes', 'no', 'unknown'] as const) {
        assert.equal(canOpenRawDocument(role, flag), true, `${role}/${flag}`);
      }
    }
  });

  it('OFIS yalnizca fiyat TASIMADIGI KESIN belgeyi acabilir', () => {
    for (const role of OPERATIONAL) {
      assert.equal(canOpenRawDocument(role, 'no'), true);
      assert.equal(canOpenRawDocument(role, 'yes'), false);
      // `unknown` GUVENLI SAYILMAZ.
      assert.equal(canOpenRawDocument(role, 'unknown'), false);
    }
  });

  it('surucu hicbir belgeyi acamaz', () => {
    // Rol zaten controller`da engelli; burada maskeleme katmani da hayir diyor.
    assert.equal(canOpenRawDocument('driver', 'unknown'), false);
    assert.equal(canOpenRawDocument('driver', 'yes'), false);
  });
});

describe('Denetim metadata`si', () => {
  it('finansal anahtarlar ofiste `null`', () => {
    const masked = maskAuditMetadata({ reviewId: 'r1', revenueAmount: 1250, intent: 'new_order' }, 'office');
    assert.equal(masked.revenueAmount, null);
    assert.equal(masked.reviewId, 'r1');
    assert.equal(masked.intent, 'new_order');
  });
});

describe('Finansal alan tespiti GENIS', () => {
  it('yeni bir tutar alani eklendiginde de yakalanir', () => {
    for (const field of [
      'revenueAmount', 'contractedRevenue', 'totalPrice', 'netAmount', 'grossAmount',
      'currency', 'billingMode', 'unitPrice', 'frachtpreis', 'tutar', 'navlunBedeli',
    ]) {
      assert.equal(isFinancialField(field), true, field);
    }
  });

  it('operasyonel alanlari YANLISLIKLA yakalamiyor', () => {
    for (const field of ['pickupAddress', 'cargoDescription', 'weightKg', 'palletCount', 'adr', 'timezone']) {
      assert.equal(isFinancialField(field), false, field);
    }
  });
});
