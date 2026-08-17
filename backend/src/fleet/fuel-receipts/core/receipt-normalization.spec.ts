import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONFIDENCE_HIGH,
  CONFIDENCE_REVIEW,
  checkFuelLineConsistency,
  classifyConfidence,
  detectCurrency,
  hasNonFuelDifference,
  matchFuelLabel,
  parseReceiptDecimal,
  selectFuelLine,
  type ReceiptLineItem,
} from './receipt-normalization.util';

function line(over: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
  return {
    description: 'Diesel',
    quantity: 45.32,
    unitPrice: 1.759,
    totalPrice: 79.72,
    confidence: 0.9,
    ...over,
  };
}

describe('ondalik ayristirma', () => {
  it('Alman bicimini okur', () => {
    assert.equal(parseReceiptDecimal('45,32'), 45.32);
    assert.equal(parseReceiptDecimal('1,759'), 1.759);
  });

  it('Ingiliz bicimini okur', () => {
    assert.equal(parseReceiptDecimal('45.32'), 45.32);
    assert.equal(parseReceiptDecimal('1.759'), 1.759);
  });

  it('binlik ayiricili Alman bicimini okur', () => {
    assert.equal(parseReceiptDecimal('1.234,56'), 1234.56);
    assert.equal(parseReceiptDecimal('12.345,67'), 12345.67);
  });

  it('binlik ayiricili Ingiliz bicimini okur', () => {
    assert.equal(parseReceiptDecimal('1,234.56'), 1234.56);
  });

  it('Turk lirasi bicimini okur', () => {
    assert.equal(parseReceiptDecimal('2.450,75 TL'), 2450.75);
    assert.equal(parseReceiptDecimal('₺42,50'), 42.5);
  });

  it('para birimi simgesi ve litre birimini atar', () => {
    assert.equal(parseReceiptDecimal('79,72 €'), 79.72);
    assert.equal(parseReceiptDecimal('45,32 L'), 45.32);
    assert.equal(parseReceiptDecimal('EUR 1,759'), 1.759);
  });

  it('sayi olmayan metinde null doner', () => {
    // Yanlis bir tutar dondurmektense "okunamadi" demek dogru.
    assert.equal(parseReceiptDecimal('Diesel'), null);
    assert.equal(parseReceiptDecimal(''), null);
    assert.equal(parseReceiptDecimal(null), null);
    assert.equal(parseReceiptDecimal('12,34,56'), null);
  });

  it('sayiyi oldugu gibi gecirir', () => {
    assert.equal(parseReceiptDecimal(45.32), 45.32);
    assert.equal(parseReceiptDecimal(Number.NaN), null);
  });
});

describe('yakit urunu eslemesi — Almanca', () => {
  it('dizel varyantlarini esler', () => {
    assert.equal(matchFuelLabel('Diesel').product, 'DIESEL');
    assert.equal(matchFuelLabel('LKW Diesel').product, 'DIESEL');
    assert.equal(matchFuelLabel('LKW-Diesel B7').product, 'DIESEL');
  });

  it('E5 ve E10 AYRI urunlerdir', () => {
    assert.equal(matchFuelLabel('Super E5').product, 'SUPER_E5');
    assert.equal(matchFuelLabel('Super E10').product, 'SUPER_E10');
    assert.equal(matchFuelLabel('E10').product, 'SUPER_E10');
  });

  it('yalin "Super" BELIRSIZ — E5/E10 uydurulmaz', () => {
    const match = matchFuelLabel('Super 95');
    assert.equal(match.product, null);
    assert.equal(match.ambiguous, true);
    assert.equal(match.rawLabel, 'Super 95');
  });

  it('Super Plus ayri bir urundur', () => {
    assert.equal(matchFuelLabel('Super Plus').product, 'SUPER_PLUS');
    assert.equal(matchFuelLabel('SuperPlus 98').product, 'SUPER_PLUS');
  });

  it('HVO100 dizele DUSMEZ', () => {
    assert.equal(matchFuelLabel('HVO100').product, 'HVO100');
    assert.equal(matchFuelLabel('HVO 100 Diesel').product, 'HVO100');
  });

  it('AdBlue dizele DUSMEZ', () => {
    // "Diesel Exhaust Fluid" metninde "Diesel" gectigi icin sira onemli.
    assert.equal(matchFuelLabel('AdBlue').product, 'ADBLUE');
    assert.equal(matchFuelLabel('AdBlue 10L').product, 'ADBLUE');
  });

  it('gazlari esler', () => {
    assert.equal(matchFuelLabel('Erdgas CNG').product, 'CNG');
    assert.equal(matchFuelLabel('LNG').product, 'LNG');
  });
});

describe('yakit urunu eslemesi — Turkce', () => {
  it('motorin/dizel/mazot dizele eslenir', () => {
    assert.equal(matchFuelLabel('Motorin').product, 'DIESEL');
    assert.equal(matchFuelLabel('Dizel').product, 'DIESEL');
    assert.equal(matchFuelLabel('Mazot').product, 'DIESEL');
    assert.equal(matchFuelLabel('MOTORIN EURO DIESEL').product, 'DIESEL');
  });

  it('yalin "Benzin" BELIRSIZ', () => {
    const match = matchFuelLabel('Benzin');
    assert.equal(match.product, null);
    assert.equal(match.ambiguous, true);
  });

  it('"Kursunsuz 95" oktan bilgisiyle bile BELIRSIZ', () => {
    // 95 oktan hem E5 hem E10 olabilir; tahmin yanlis yakit kaydi uretir.
    for (const label of ['Kurşunsuz 95', 'Kursunsuz 98']) {
      const match = matchFuelLabel(label);
      assert.equal(match.product, null, `${label} eslenmemeli`);
      assert.equal(match.ambiguous, true);
    }
  });

  it('LPG/Otogaz canonical enum\'da YOK — uydurulmaz', () => {
    // Repo enum'unda LPG karsiligi yok ve yeni enum acmak yasak.
    for (const label of ['LPG', 'Otogaz', 'Autogas']) {
      const match = matchFuelLabel(label);
      assert.equal(match.product, null, `${label} icin enum degeri uydurulmamali`);
      assert.equal(match.ambiguous, true);
      assert.equal(match.rawLabel, label);
    }
  });

  it('tanimsiz metin belirsiz de sayilmaz', () => {
    const match = matchFuelLabel('Kaffee');
    assert.equal(match.product, null);
    assert.equal(match.ambiguous, false);
  });
});

describe('para birimi', () => {
  it('acik EUR kanitindan okur', () => {
    assert.equal(detectCurrency('Gesamt 79,72 €'), 'EUR');
    assert.equal(detectCurrency('EUR 79.72'), 'EUR');
  });

  it('acik TRY kanitindan okur', () => {
    assert.equal(detectCurrency('TOPLAM 2.450,75 TL'), 'TRY');
    assert.equal(detectCurrency('₺42,50'), 'TRY');
  });

  it('kanit yoksa UYDURMAZ', () => {
    // Ulkeye/dile bakip para birimi secmek 2.400 TL'yi 2.400 EUR yapardi.
    assert.equal(detectCurrency('Gesamt 79,72'), null);
    assert.equal(detectCurrency(null, undefined, ''), null);
  });

  it('iki para birimi birden gecerse BELIRSIZ', () => {
    assert.equal(detectCurrency('2.450,75 TL (≈ 65,00 EUR)'), null);
  });
});

describe('yakit satiri secimi', () => {
  it('tek yakit satirini secer', () => {
    const result = selectFuelLine([line()]);
    assert.equal(result.selected?.description, 'Diesel');
    assert.equal(result.match?.product, 'DIESEL');
    assert.equal(result.noFuelLine, false);
    assert.equal(result.hasNonFuelItems, false);
  });

  it('KARMA fiste yalnizca yakit satirini secer', () => {
    const result = selectFuelLine([
      line({ description: 'Diesel', totalPrice: 79.72 }),
      line({ description: 'Kaffee', quantity: 1, unitPrice: 2.5, totalPrice: 2.5 }),
      line({ description: 'Autowäsche', quantity: 1, unitPrice: 9, totalPrice: 9 }),
    ]);
    assert.equal(result.selected?.totalPrice, 79.72);
    assert.equal(result.hasNonFuelItems, true, 'yakit disi kalem isaretlenmeli');
  });

  it('AdBlue yakit satiri SAYILMAZ — dizel tek aday kalir', () => {
    // Aksi halde dizel + AdBlue alan her fis "belirsiz" olurdu.
    const result = selectFuelLine([
      line({ description: 'Diesel' }),
      line({ description: 'AdBlue', quantity: 10, unitPrice: 0.99, totalPrice: 9.9 }),
    ]);
    assert.equal(result.selected?.description, 'Diesel');
    assert.equal(result.candidates.length, 1);
  });

  it('birden fazla yakit satirinda OTOMATIK SECIM YAPMAZ', () => {
    const result = selectFuelLine([
      line({ description: 'Diesel' }),
      line({ description: 'Super E10' }),
    ]);
    assert.equal(result.selected, null, 'sunucu hangisinin arac yakiti oldugunu bilemez');
    assert.equal(result.candidates.length, 2);
  });

  it('belirsiz yakit satiri da aday sayilir', () => {
    const result = selectFuelLine([line({ description: 'Super' })]);
    assert.equal(result.selected?.description, 'Super');
    assert.equal(result.match?.ambiguous, true);
    assert.equal(result.match?.product, null);
  });

  it('yakit satiri yoksa fis REDDEDILMEZ', () => {
    const result = selectFuelLine([line({ description: 'Kaffee' })]);
    assert.equal(result.noFuelLine, true);
    assert.equal(result.selected, null);
    // Manuel girise birakilir.
  });

  it('bos kalem listesi yakit disi urun uyarisi TETIKLEMEZ', () => {
    const result = selectFuelLine([]);
    assert.equal(result.hasNonFuelItems, false);
    assert.equal(result.noFuelLine, true);
  });

  it('bos etiketli satir yakit disi sayilmaz', () => {
    const result = selectFuelLine([line({ description: 'Diesel' }), line({ description: '  ' })]);
    assert.equal(result.hasNonFuelItems, false, 'okuma artigi uyari uretmemeli');
  });
});

describe('tutarlilik kontrolu', () => {
  it('gercek bir dolum tutarlidir', () => {
    // 45,32 x 1,759 = 79,7079 → fiste 79,71
    const check = checkFuelLineConsistency(45.32, 1.759, 79.71);
    assert.equal(check.checked, true);
    assert.equal(check.consistent, true);
  });

  it('float artigi yanlis alarm URETMEZ', () => {
    // 45.32 * 1.759 JS'te 79.71788000000001 verir.
    const check = checkFuelLineConsistency(45.32, 1.759, 79.72);
    assert.equal(check.consistent, true);
  });

  it('gercek uyusmazligi yakalar', () => {
    const check = checkFuelLineConsistency(45.32, 1.759, 12.5);
    assert.equal(check.consistent, false);
    assert.ok(Number(check.difference) > 60);
  });

  it('eksik veri TUTARSIZLIK sayilmaz', () => {
    // Bilinmeyen sey yanlis degildir.
    assert.equal(checkFuelLineConsistency(null, 1.759, 79.71).checked, false);
    assert.equal(checkFuelLineConsistency(null, 1.759, 79.71).consistent, true);
  });

  it('buyuk dolumda yuzde toleransi kullanilir', () => {
    // 500 L x 1,70 = 850; fiste 851 → %0,12 fark, kabul.
    assert.equal(checkFuelLineConsistency(500, 1.7, 851).consistent, true);
  });

  it('kucuk dolumda mutlak tolerans kullanilir', () => {
    // 2 L x 1,50 = 3,00; fiste 3,03 → yuzde olarak %1 asar ama 3 kurus.
    assert.equal(checkFuelLineConsistency(2, 1.5, 3.03).consistent, true);
  });
});

describe('karma fis farki', () => {
  it('fis toplami yakit toplamindan buyukse isaretlenir', () => {
    assert.equal(hasNonFuelDifference(92.22, 79.72), true);
  });

  it('esitse isaretlenmez', () => {
    assert.equal(hasNonFuelDifference(79.72, 79.72), false);
  });

  it('kurus farki isaretlenmez', () => {
    assert.equal(hasNonFuelDifference(79.74, 79.72), false);
  });

  it('fis toplami KUCUKSE isaretlenmez', () => {
    // Okuma hatasi olasiligi yuksek; "market urunu var" demek yanlis olur.
    assert.equal(hasNonFuelDifference(50, 79.72), false);
  });

  it('eksik veride isaretlenmez', () => {
    assert.equal(hasNonFuelDifference(null, 79.72), false);
  });
});

describe('guven siniflari', () => {
  it('esikleri dogru uygular', () => {
    assert.equal(classifyConfidence(0.95), 'high');
    assert.equal(classifyConfidence(CONFIDENCE_HIGH), 'high');
    assert.equal(classifyConfidence(0.7), 'review');
    assert.equal(classifyConfidence(CONFIDENCE_REVIEW), 'review');
    assert.equal(classifyConfidence(0.2), 'low_or_missing');
  });

  it('guven bilinmiyorsa DUSUK sayilir', () => {
    // Saglayici guven vermiyorsa "yuksek" varsaymak, kontrolsuz bir degeri
    // onaylanmis gibi gosterirdi.
    assert.equal(classifyConfidence(null), 'low_or_missing');
    assert.equal(classifyConfidence(undefined), 'low_or_missing');
    assert.equal(classifyConfidence(Number.NaN), 'low_or_missing');
  });
});
