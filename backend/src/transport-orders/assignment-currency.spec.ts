import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveAssignmentCurrency } from '../common/utils/revenue-currency';
import { allocateRevenue } from './core/order-fulfillment';
import { maskOrderFinancials } from './core/order-field-security';

/**
 * ASSIGNMENT GELIR PARA BIRIMI — DENETIM SENARYOLARI.
 *
 * Denetimin sordugu bes sorunun her biri burada bir testtir. Faz 15'in
 * "para birimi siparisten cozulur" tasarimi bu senaryolarin UCUNU birden
 * saglayamiyordu; `Assignment.currency` bu yuzden eklendi.
 */

// ---------------------------------------------------------------------------
// 1) Migration: backfill kiracinin KENDI tabanindan
// ---------------------------------------------------------------------------

describe('Migration — legacy backfill', () => {
  const migration = readFileSync(
    path.resolve(
      __dirname,
      '../../prisma/migrations/20260819190000_assignment_revenue_currency/migration.sql',
    ),
    'utf8',
  );

  it('backfill KIRACININ `baseCurrency`sinden yapilir', () => {
    assert.match(migration, /UPDATE "Assignment"[\s\S]*SET "currency" = t\."baseCurrency"/);
    assert.match(migration, /FROM "Tenant" AS t[\s\S]*WHERE a\."tenantId" = t\."id"/);
  });

  it('SABIT `EUR` yazilmaz — TRY tabanli kiraci icin bu hatanin ta kendisi olurdu', () => {
    const statements = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    assert.ok(!/'EUR'/.test(statements), 'migration sabit EUR yaziyor');
  });

  it('kolon once nullable eklenip SONRA zorunlu yapilir', () => {
    // YORUMLAR ELENIR: aciklama metni de `SET NOT NULL` gecirdigi icin ham
    // metinde arama yapmak yanlis sira raporlardi.
    const statements = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const addIndex = statements.indexOf('ADD COLUMN "currency" TEXT');
    const notNullIndex = statements.indexOf('SET NOT NULL');
    assert.ok(addIndex > -1, 'kolon eklenmiyor');
    assert.ok(notNullIndex > addIndex, 'sira yanlis');
  });

  it('FALLBACK YOK: bos kalan satir migration\'i DUSURUR', () => {
    // Sessizce `EUR` yazmaktansa gurultulu bir hata iyidir.
    assert.ok(!/COALESCE/i.test(migration));
  });
});

// ---------------------------------------------------------------------------
// 2) Kaynak revizyondan DONDURMA
// ---------------------------------------------------------------------------

describe('Para birimi OLUSTURMA aninda dondurulur', () => {
  it('EUR siparisten uretilen gorev EUR alir', () => {
    const currency = resolveAssignmentCurrency({
      orderCurrency: 'EUR',
      tenantBaseCurrency: 'TRY',
    });
    // Kiraci tabani TRY olsa bile siparis EUR ise gorev EUR.
    assert.equal(currency, 'EUR');
  });

  it('TRY tabanli kiracinin BAGIMSIZ gorevi TRY alir', () => {
    assert.equal(resolveAssignmentCurrency({ tenantBaseCurrency: 'TRY' }), 'TRY');
  });

  it('SIPARIS EUR→TRY degistiginde ESKI gorev EUR KALIR', () => {
    /**
     * Bu, Faz 15 tasariminin kirildigi yer.
     *
     * Eskiden gorevin para birimi siparisten CANLI cozuluyordu; amendment
     * sonrasi 1.200 EUR'luk bir is, hicbir sey yazilmadan 1.200 TRY olarak
     * okunuyordu. Artik para birimi gorevin KENDI sutununda.
     */
    const assignmentCurrency = resolveAssignmentCurrency({ orderCurrency: 'EUR' });
    assert.equal(assignmentCurrency, 'EUR');

    // Siparis TRY'ye cevrildi; gorev satiri DEGISMEDI.
    const orderCurrencyAfterAmendment = 'TRY';
    assert.notEqual(assignmentCurrency, orderCurrencyAfterAmendment);

    // Ve tahsis hesabi bunu GORUYOR: eski gorev toplama girmiyor.
    const allocation = allocateRevenue({
      contractedRevenue: 50_000,
      currency: orderCurrencyAfterAmendment,
      assignments: [
        { status: 'planned', expectedDailyRevenue: 1200, currency: assignmentCurrency },
      ],
    });
    assert.equal(allocation.allocated, 0);
    assert.deepEqual(allocation.unconvertedByCurrency, [
      { currency: 'EUR', amount: 1200, count: 1 },
    ]);
  });

  it('amendment sonrasi ACILAN gorev YENI para birimini alir', () => {
    // Donma "hep eski kalir" demek degil: yeni dilim yeni revizyondan dogar.
    assert.equal(resolveAssignmentCurrency({ orderCurrency: 'TRY' }), 'TRY');
  });
});

// ---------------------------------------------------------------------------
// 3) Toplamlar
// ---------------------------------------------------------------------------

describe('EUR ve TRY gorevler AYNI TOPLAMDA birlesmez', () => {
  const mixed = [
    { status: 'planned', expectedDailyRevenue: 1000, currency: 'EUR' },
    { status: 'planned', expectedDailyRevenue: 200, currency: 'EUR' },
    { status: 'planned', expectedDailyRevenue: 45_000, currency: 'TRY' },
  ];

  it('EUR siparisinde yalnizca EUR toplanir', () => {
    const result = allocateRevenue({
      contractedRevenue: 2000,
      currency: 'EUR',
      assignments: mixed,
    });
    assert.equal(result.allocated, 1200);
    assert.equal(result.unconvertedByCurrency.length, 1);
    assert.equal(result.unconvertedByCurrency[0]!.currency, 'TRY');
  });

  it('TRY siparisinde yalnizca TRY toplanir', () => {
    const result = allocateRevenue({
      contractedRevenue: 50_000,
      currency: 'TRY',
      assignments: mixed,
    });
    assert.equal(result.allocated, 45_000);
    assert.equal(result.unconvertedByCurrency[0]!.currency, 'EUR');
    assert.equal(result.unconvertedByCurrency[0]!.count, 2);
  });

  it('hicbir toplam 1200 + 45000 = 46200 URETMEZ', () => {
    for (const currency of ['EUR', 'TRY'] as const) {
      const result = allocateRevenue({
        contractedRevenue: null,
        currency,
        assignments: mixed,
      });
      assert.notEqual(result.allocated, 46_200);
    }
  });
});

// ---------------------------------------------------------------------------
// 4) Rol sizintisi
// ---------------------------------------------------------------------------

describe('Tutar ve para birimi finans yetkisi olmayan role SIZMAZ', () => {
  const payload = {
    id: 'order-1',
    orderNumber: 'TO-1',
    currency: 'TRY',
    contractedRevenue: '45000.00',
    billingMode: 'per_delivery',
    revenueAllocation: {
      allocated: 45000,
      currency: 'TRY',
      unconvertedByCurrency: [{ currency: 'EUR', amount: 1200, count: 1 }],
    },
    assignments: [
      { id: 'asg-1', status: 'planned', expectedDailyRevenue: '1200.00', currency: 'EUR' },
    ],
  };

  it('office icin gorev PARA BIRIMI de maskelenir', () => {
    const masked = maskOrderFinancials(payload, 'office');
    const assignments = masked.assignments as Array<Record<string, unknown>>;
    assert.equal(assignments[0]!.expectedDailyRevenue, null);
    assert.equal(assignments[0]!.currency, null, 'para birimi sizdi');
    // Operasyon alani yerinde.
    assert.equal(assignments[0]!.status, 'planned');
  });

  it('tahsis kirilimi de sizdirmaz', () => {
    const masked = maskOrderFinancials(payload, 'office');
    assert.equal(masked.revenueAllocation, null);
    const serialized = JSON.stringify(masked);
    assert.ok(!serialized.includes('45000'), 'sozlesme tutari sizdi');
    assert.ok(!serialized.includes('1200'), 'gorev tutari sizdi');
  });

  it('finansal rol her ikisini de gorur', () => {
    const visible = maskOrderFinancials(payload, 'accounting');
    const assignments = visible.assignments as Array<Record<string, unknown>>;
    assert.equal(assignments[0]!.currency, 'EUR');
    assert.equal(assignments[0]!.expectedDailyRevenue, '1200.00');
  });
});

// ---------------------------------------------------------------------------
// 5) API sozlesmesi
// ---------------------------------------------------------------------------

describe('API para tutarlarini STRING tasimaya devam eder', () => {
  it('servis Decimal\'i string olarak donuyor', () => {
    // `transport-orders.service` `decimalToString` kullaniyor; float
    // yuvarlamasi bir sozlesme tutarini sessizce degistirmemeli.
    const source = readFileSync(
      path.resolve(__dirname, 'transport-orders.service.ts'),
      'utf8',
    );
    assert.match(source, /expectedDailyRevenue: decimalToString\(item\.expectedDailyRevenue\)/);
    assert.match(source, /contractedRevenue: decimalToString\(order\.contractedRevenue\)/);
  });

  it('gorev satiri tutarla BIRLIKTE para birimi doner', () => {
    const source = readFileSync(
      path.resolve(__dirname, 'transport-orders.service.ts'),
      'utf8',
    );
    // Tutari para birimi olmadan gostermek, okuyanin kendi varsayimini
    // yapmasina davetiye.
    assert.match(source, /currency: item\.currency,/);
  });
});
