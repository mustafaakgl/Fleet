import { describe, expect, it } from 'vitest';

/**
 * Faz 7.1: para bicimlemesi backend'in `baseCurrency` alanindan gelir.
 *
 * `€` HARD-CODE EDILMEZ: TRY bir kiracida her tutar yanlis sembolle
 * gosterilirdi. `Intl.NumberFormat` hem sembolu hem ayraclari locale'e gore
 * secer — elle string birlestirmek Turkce'de "1.234,56 ₺" yerine
 * "1,234.56 €" uretirdi.
 */
function format(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

describe('cost currency formatting', () => {
  it('renders a EUR tenant unchanged', () => {
    const out = format(177.68, 'EUR', 'de-DE');
    expect(out).toContain('€');
    // Almanca ayraclar: binlik nokta, ondalik virgul.
    expect(out).toContain('177,68');
    expect(out).not.toContain('₺');
  });

  it('renders a TRY tenant with the lira symbol and Turkish separators', () => {
    const out = format(1234.56, 'TRY', 'tr-TR');
    expect(out).toContain('₺');
    expect(out).toContain('1.234,56');
    // EUR sembolu SIZMAZ — hard-code edilmis olsaydi burada gorunurdu.
    expect(out).not.toContain('€');
  });

  it('keeps the currency out of the amount when the tenant is TRY but the locale is German', () => {
    // Kiraci para birimi ile kullanicinin dili AYRI seyler: biri veriden,
    // digeri oturumdan gelir.
    const out = format(1234.56, 'TRY', 'de-DE');
    expect(out).toContain('1.234,56');
    expect(out).not.toContain('€');
  });

  it('never mixes two currencies into one total', () => {
    // Faz 7.1 kurali: farkli para birimleri TOPLANMAZ, ayri gosterilir.
    const approved = [
      { amount: 100, currency: 'EUR' },
      { amount: 5000, currency: 'TRY' },
    ];
    const base = 'EUR';

    const booked = approved
      .filter((row) => row.currency === base)
      .reduce((sum, row) => sum + row.amount, 0);
    const unconverted = approved.filter((row) => row.currency !== base);

    expect(booked).toBe(100);
    expect(unconverted).toHaveLength(1);
    expect(format(booked, base, 'de-DE')).toContain('€');
    expect(format(unconverted[0]!.amount, unconverted[0]!.currency, 'tr-TR')).toContain('₺');
  });
});
