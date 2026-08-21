import { describe, expect, it } from 'vitest';
import {
  amountKind,
  FINANCE_PERIODS,
  financeErrorKey,
  hasActualRevenue,
  hasMargin,
  isRejectionReasonValid,
  isTruncated,
  MIN_REJECTION_REASON,
  openDecisionCount,
} from './finance-view';
import type { FinanceSummaryResponse } from './types';

function summary(over: Partial<FinanceSummaryResponse> = {}): FinanceSummaryResponse {
  return {
    baseCurrency: 'EUR',
    period: { from: '2026-03-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z', timezone: 'Europe/Berlin' },
    revenue: {
      actual: { amount: '12000.00', count: 8 },
      estimated: { amount: '15000.00', count: 40 },
    },
    cost: {
      fuel: { amount: '4000.00', count: 30 },
      service: { amount: '2500.00', count: 6 },
      fines: { amount: '300.00', count: 3 },
      total: { amount: '6800.00', count: 39 },
    },
    margin: '5200.00',
    pendingServiceRecords: { totalAmount: '900.00', totalCount: 2, items: [] },
    fuelReceipts: { totalAmount: '450.00', totalCount: 3, items: [] },
    disputedFines: { totalAmount: '320.00', totalCount: 1, items: [] },
    unconvertedByCurrency: [],
    ...over,
  };
}

describe('0 ile "veri yok" AYRI seylerdir', () => {
  it('kayit yoksa "veri yok" — tutar sifir olsa bile', () => {
    // `0,00` gostermek "bu donemde hic masraf olmadi" diye okunurdu.
    expect(amountKind({ amount: '0.00', count: 0 })).toBe('noData');
  });

  it('olculmus sifir bir DEGERDIR', () => {
    // Kayit var, toplami sifir cikti: bu gercek bir olcum.
    expect(amountKind({ amount: '0.00', count: 4 })).toBe('value');
  });

  it('alan hic yoksa "veri yok"', () => {
    expect(amountKind(null)).toBe('noData');
    expect(amountKind(undefined)).toBe('noData');
  });
});

describe('gercek gelir ve marj', () => {
  it('fatura yoksa gercek gelir OLCULEMEZ', () => {
    const data = summary({ revenue: { actual: null, estimated: { amount: '15000.00', count: 40 } } });
    expect(hasActualRevenue(data)).toBe(false);
  });

  it('marj yalnizca GERCEK gelirden hesaplanir — tahminden TUREMEZ', () => {
    const data = summary({
      revenue: { actual: null, estimated: { amount: '15000.00', count: 40 } },
      margin: null,
    });
    expect(hasMargin(data)).toBe(false);

    // Backend yanlislikla marj gonderse bile gercek gelir yoksa
    // gosterilmiyor: iki alan birbirinden ayrilirsa ekran susar.
    const inconsistent = summary({
      revenue: { actual: null, estimated: { amount: '15000.00', count: 40 } },
      margin: '5200.00',
    });
    expect(hasMargin(inconsistent)).toBe(false);
  });

  it('fatura varsa marj hesaplanabilir', () => {
    expect(hasMargin(summary())).toBe(true);
  });

  it('veri hic yoksa hicbir sey iddia etmez', () => {
    expect(hasActualRevenue(null)).toBe(false);
    expect(hasMargin(null)).toBe(false);
  });
});

describe('kirpma SESSIZ olmaz', () => {
  it('gosterilen satir sayisi toplamdan azsa isaretlenir', () => {
    expect(isTruncated({ totalCount: 180, items: new Array(50).fill(null) })).toBe(true);
  });

  it('hepsi gorunuyorsa isaret YOK', () => {
    expect(isTruncated({ totalCount: 3, items: [null, null, null] })).toBe(false);
    expect(isTruncated({ totalCount: 0, items: [] })).toBe(false);
  });
});

describe('acik karar sayisi', () => {
  it('servis ve yakit kuyruklarini toplar', () => {
    expect(openDecisionCount(summary())).toBe(5);
  });

  it('ihtilafli cezayi SAYMAZ — o bir karar kuyrugu degil', () => {
    // Ihtilaf muhasebenin onayini beklemiyor; hukuki bir surec.
    const data = summary({ disputedFines: { totalAmount: '9999.00', totalCount: 40, items: [] } });
    expect(openDecisionCount(data)).toBe(5);
  });

  it('veri yoksa sifir', () => {
    expect(openDecisionCount(null)).toBe(0);
  });
});

describe('ret nedeni', () => {
  it('kisa metin yeterli DEGIL', () => {
    expect(isRejectionReasonValid('yok')).toBe(false);
    expect(isRejectionReasonValid('   ')).toBe(false);
    expect(isRejectionReasonValid('x'.repeat(MIN_REJECTION_REASON - 1))).toBe(false);
  });

  it('bosluklar kirpildiktan sonra sayilir', () => {
    expect(isRejectionReasonValid(`  ${'x'.repeat(MIN_REJECTION_REASON)}  `)).toBe(true);
  });

  it('sunucudaki alt sinirla AYNI', () => {
    // backend/src/service-records/dto/review-service-record.dto.ts
    expect(MIN_REJECTION_REASON).toBe(10);
  });
});

describe('hata kodlari', () => {
  it('her kodu kendi metnine cevirir', () => {
    expect(financeErrorKey('finance_reversed_range')).toBe('finance.errors.reversedRange');
    expect(financeErrorKey('finance_range_in_future')).toBe('finance.errors.futureRange');
    expect(financeErrorKey('finance_range_too_large')).toBe('finance.errors.rangeTooLarge');
    expect(financeErrorKey('finance_invalid_range')).toBe('finance.errors.invalidRange');
  });

  it('bilinmeyen kod HAM gosterilmez', () => {
    expect(financeErrorKey('brand_new_code')).toBe('finance.errors.generic');
    expect(financeErrorKey(null)).toBe('finance.errors.generic');
  });
});

describe('donem secenekleri', () => {
  it('backend DTO ile AYNI kume', () => {
    // backend PERIOD_MONTH_OPTIONS — biri degisirse 400 uretirdi.
    expect([...FINANCE_PERIODS]).toEqual([1, 3, 6, 12]);
  });
});
