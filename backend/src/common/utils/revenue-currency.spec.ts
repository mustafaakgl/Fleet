import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveAssignmentCurrency,
  splitByBaseCurrency,
  sumRevenueInBaseCurrency,
} from './revenue-currency';
import { allocateRevenue } from '../../transport-orders/core/order-fulfillment';

/**
 * GELIR PARA BIRIMI GUVENLIGI (denetim duzeltmesi).
 *
 * Denetimin bulgusu: `Assignment.expectedDailyRevenue` para birimi tasimiyordu
 * ve bes ayri tuketici tarafindan KOSULSUZ toplaniyordu. Bu dosya duzeltmenin
 * sozlesmesini kilitliyor.
 */

// ---------------------------------------------------------------------------
// Cozumleme — SABIT `EUR` YOK
// ---------------------------------------------------------------------------

describe('Gorev para birimi cozumlemesi', () => {
  it('SIPARISTEN uretilen gorev siparisin para birimini alir', () => {
    assert.equal(
      resolveAssignmentCurrency({ orderCurrency: 'TRY', tenantBaseCurrency: 'EUR' }),
      'TRY',
    );
  });

  it('BAGIMSIZ gorev kiracinin TABANINI alir', () => {
    assert.equal(resolveAssignmentCurrency({ tenantBaseCurrency: 'TRY' }), 'TRY');
  });

  it('TRY tabanli kiraciya EUR YAZILMAZ', () => {
    // Denetimin duzeltmeye calistigi hata tam olarak buydu.
    assert.notEqual(resolveAssignmentCurrency({ tenantBaseCurrency: 'TRY' }), 'EUR');
  });

  it('kucuk harf ve bosluk normalize edilir', () => {
    assert.equal(resolveAssignmentCurrency({ tenantBaseCurrency: ' try ' }), 'TRY');
  });

  it('hicbir kaynak yoksa varsayilan tabana duser', () => {
    assert.equal(resolveAssignmentCurrency({}), 'EUR');
  });

  it('gecersiz kod TAHMIN EDILMEZ, bir sonraki kaynaga gecilir', () => {
    assert.equal(
      resolveAssignmentCurrency({ orderCurrency: 'EURO', tenantBaseCurrency: 'TRY' }),
      'TRY',
    );
  });
});

// ---------------------------------------------------------------------------
// Toplama — FARKLI PARA BIRIMLERI BIRLESTIRILMEZ
// ---------------------------------------------------------------------------

const rows = [
  { id: 'a', currency: 'EUR', amount: 1000 },
  { id: 'b', currency: 'EUR', amount: 500 },
  { id: 'c', currency: 'TRY', amount: 45000 },
  { id: 'd', currency: 'CHF', amount: 800 },
];

const read = (row: (typeof rows)[number]) => ({ currency: row.currency, amount: row.amount });

describe('Temel para birimine gore ayirma', () => {
  it('EUR ve TRY AYNI TOPLAMDA BIRLESTIRILMEZ', () => {
    const result = sumRevenueInBaseCurrency(rows, 'EUR', read);
    // 1000 + 500 = 1500. 45000 TRY ve 800 CHF GIRMEDI.
    assert.equal(result.total, 1500);
    assert.notEqual(result.total, 1500 + 45000 + 800);
  });

  it('disarida kalanlar SILINMEZ, kirilimda gorunur', () => {
    const result = sumRevenueInBaseCurrency(rows, 'EUR', read);
    assert.equal(result.excludedCount, 2);
    assert.deepEqual(result.unconvertedByCurrency, [
      { currency: 'CHF', amount: 800, count: 1 },
      { currency: 'TRY', amount: 45000, count: 1 },
    ]);
  });

  it('TRY tabanli kiracida TERSI gecerli', () => {
    const result = sumRevenueInBaseCurrency(rows, 'TRY', read);
    assert.equal(result.total, 45000);
    assert.equal(result.baseCurrency, 'TRY');
    assert.equal(result.excludedCount, 3);
  });

  it('FX DONUSUMU YAPILMAZ — kur uydurulmaz', () => {
    const result = sumRevenueInBaseCurrency(rows, 'EUR', read);
    // Donusum olsaydi toplam 1500'den buyuk olurdu.
    assert.equal(result.total, 1500);
    for (const bucket of result.unconvertedByCurrency) {
      // Kirilim KENDI para biriminde duruyor, cevrilmis degil.
      assert.ok(bucket.amount > 0);
    }
  });

  it('para birimi BOS olan kayit tabana ait sayilir', () => {
    // Repodaki `matchesBaseCurrency` davranisi: null → varsayilan taban.
    const split = splitByBaseCurrency(
      [{ currency: null, amount: 100 }],
      'EUR',
      (row) => ({ currency: row.currency, amount: row.amount }),
    );
    assert.equal(split.included.length, 1);
  });

  it('tutari `null` olan farkli para birimi de SAYILIR', () => {
    const result = sumRevenueInBaseCurrency(
      [{ currency: 'TRY', amount: null }],
      'EUR',
      (row) => ({ currency: row.currency, amount: row.amount }),
    );
    assert.equal(result.unconvertedByCurrency[0]!.count, 1);
    // Varligi gorunuyor, tutari bilinmese de.
    assert.equal(result.unconvertedByCurrency[0]!.amount, 0);
  });
});

// ---------------------------------------------------------------------------
// Siparis gelir tahsisi
// ---------------------------------------------------------------------------

describe('Siparis gelir tahsisi para birimine duyarli', () => {
  it('SIPARISIN para biriminde OLMAYAN gorev toplama GIRMEZ', () => {
    const result = allocateRevenue({
      contractedRevenue: 2400,
      currency: 'EUR',
      assignments: [
        { status: 'planned', expectedDailyRevenue: 900, currency: 'EUR' },
        // Siparis EUR→TRY degistirilmeden once acilmis eski gorev DEGIL;
        // bu, baska para biriminde kalmis bir dilim.
        { status: 'planned', expectedDailyRevenue: 45000, currency: 'TRY' },
      ],
    });
    assert.equal(result.allocated, 900);
    assert.equal(result.currency, 'EUR');
    assert.deepEqual(result.unconvertedByCurrency, [
      { currency: 'TRY', amount: 45000, count: 1 },
    ]);
  });

  it('baska para birimindeki gorev "gelirsiz" SAYILMAZ', () => {
    const result = allocateRevenue({
      contractedRevenue: 1000,
      currency: 'EUR',
      assignments: [{ status: 'planned', expectedDailyRevenue: 45000, currency: 'TRY' }],
    });
    // Geliri VAR, yalnizca bu toplama giremiyor.
    assert.equal(result.assignmentsWithoutRevenue, 0);
    assert.equal(result.allocated, 0);
  });

  it('asim karari YALNIZCA ayni para biriminde verilir', () => {
    const result = allocateRevenue({
      contractedRevenue: 1000,
      currency: 'EUR',
      assignments: [{ status: 'planned', expectedDailyRevenue: 45000, currency: 'TRY' }],
    });
    // 45000 TRY, 1000 EUR'luk sozlesmeyi ASMIS SAYILMAZ.
    assert.equal(result.overAllocated, false);
  });
});
