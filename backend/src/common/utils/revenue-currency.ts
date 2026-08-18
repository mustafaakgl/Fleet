import { DEFAULT_BASE_CURRENCY, matchesBaseCurrency, normalizeCurrency } from './currency';

/**
 * GELIR PARA BIRIMI — cozumleme ve toplama (denetim duzeltmesi).
 *
 * NEDEN AYRI BIR MODUL: `Assignment.expectedDailyRevenue` bes ayri tuketici
 * tarafindan toplaniyor (dashboard, maliyet paneli, sirket kirilimi, fatura
 * onerisi, siparis tahsisi). Kural her birinde ayri yazilsaydi, biri
 * guncellenmediginde toplam sessizce yanlis olurdu — ve yanlis toplam,
 * yokluktan daha tehlikelidir cunku dogru gorunur.
 */

/**
 * Gorevin para birimini cozer.
 *
 * SIRA: siparis varsa ONUN para birimi (gorev o revizyondan uretiliyor),
 * yoksa kiracinin tabani. Kodda SABIT `EUR` YOK — TRY tabanli bir kiraciya
 * EUR yazmak, bu duzeltmenin engellemek icin var oldugu hatanin ta kendisi.
 *
 * Cozum GOREV YAZILIRKEN bir kez yapilir ve `Assignment.currency`ye
 * DONDURULUR; sonraki siparis amendment'i bu degeri degistirmez.
 */
export interface AssignmentCurrencySource {
  /** Gorev bir siparisten uretiliyorsa o siparisin GUNCEL para birimi. */
  orderCurrency?: string | null;
  /** Kiracinin temel para birimi. */
  tenantBaseCurrency?: string | null;
}

export function resolveAssignmentCurrency(source: AssignmentCurrencySource): string {
  return (
    normalizeCurrency(source.orderCurrency) ??
    normalizeCurrency(source.tenantBaseCurrency) ??
    DEFAULT_BASE_CURRENCY
  );
}

export interface CurrencySplitEntry {
  currency: string;
  amount: number;
  count: number;
}

export interface CurrencySplit<T> {
  /** Temel para birimindeki kayitlar — TOPLANABILIR olanlar. */
  included: T[];
  /**
   * Temel para birimi DISINDAKILER. Toplama KATILMAZ, SILINMEZ, ayri durur.
   * `FleetFuelEntry`in maliyet panelindeki `unconvertedByCurrency` deseniyle
   * ayni: kur uydurmaktansa ayri gostermek.
   */
  excluded: T[];
  unconvertedByCurrency: CurrencySplitEntry[];
}

/**
 * Kayitlari temel para birimine gore ayirir.
 *
 * FX DONUSUMU YOK ve olmayacak: guvenilir bir kur altyapisi olmadan
 * `100 EUR + 500 TRY` icin bir sayi uretmek, kur uydurmaktir. Uydurulmus bir
 * kur, raporu yanlis yapmakla kalmaz — YANLIS OLDUGUNU DA GIZLER.
 */
export function splitByBaseCurrency<T>(
  rows: T[],
  baseCurrency: string,
  read: (row: T) => { currency: string | null | undefined; amount: number | null },
): CurrencySplit<T> {
  const included: T[] = [];
  const excluded: T[] = [];
  const buckets = new Map<string, CurrencySplitEntry>();

  for (const row of rows) {
    const { currency, amount } = read(row);
    if (matchesBaseCurrency(currency, baseCurrency)) {
      included.push(row);
      continue;
    }
    excluded.push(row);

    const code = normalizeCurrency(currency) ?? DEFAULT_BASE_CURRENCY;
    const bucket = buckets.get(code) ?? { currency: code, amount: 0, count: 0 };
    // `null` tutar da SAYILIR: kaydin varligi gorunmeli, tutari bilinmese de.
    bucket.amount = Number((bucket.amount + (amount ?? 0)).toFixed(2));
    bucket.count += 1;
    buckets.set(code, bucket);
  }

  return {
    included,
    excluded,
    unconvertedByCurrency: [...buckets.values()].sort((left, right) =>
      left.currency.localeCompare(right.currency),
    ),
  };
}

/**
 * Toplam + kirilim.
 *
 * Cagiran tarafin "topladim ama neyi disarida biraktim" sorusunu ayrica
 * sormasi gerekmesin diye ikisi BIRLIKTE donuyor.
 */
export interface RevenueTotal {
  /** YALNIZCA temel para birimindeki toplam. */
  total: number;
  baseCurrency: string;
  includedCount: number;
  excludedCount: number;
  unconvertedByCurrency: CurrencySplitEntry[];
}

export function sumRevenueInBaseCurrency<T>(
  rows: T[],
  baseCurrency: string,
  read: (row: T) => { currency: string | null | undefined; amount: number | null },
): RevenueTotal {
  const split = splitByBaseCurrency(rows, baseCurrency, read);
  const total = split.included.reduce((sum, row) => sum + (read(row).amount ?? 0), 0);

  return {
    total: Number(total.toFixed(2)),
    baseCurrency: normalizeCurrency(baseCurrency) ?? DEFAULT_BASE_CURRENCY,
    includedCount: split.included.length,
    excludedCount: split.excluded.length,
    unconvertedByCurrency: split.unconvertedByCurrency,
  };
}
