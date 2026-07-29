/**
 * Number and date formatting. German conventions for the human-readable PDF,
 * ISO/XML Schema conventions for the machine-readable documents.
 *
 * Implemented by hand rather than through Intl so the output cannot shift with the
 * runtime's ICU build — a finalized invoice must always render byte-identically.
 */

function assertSafeCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('amount must be a safe integer number of cents');
  }
}

function splitCents(value: number): { sign: string; whole: string; fraction: string } {
  assertSafeCents(value);
  const absolute = Math.abs(value);
  return {
    sign: value < 0 ? '-' : '',
    whole: String(Math.floor(absolute / 100)),
    fraction: String(absolute % 100).padStart(2, '0'),
  };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 123456 → "1.234,56" */
export function formatGermanAmount(cents: number): string {
  const { sign, whole, fraction } = splitCents(cents);
  return `${sign}${groupThousands(whole)},${fraction}`;
}

/** 123456 → "1.234,56 €" */
export function formatGermanCurrency(cents: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency;
  return `${formatGermanAmount(cents)} ${symbol}`;
}

/** 2026-07-27 → "27.07.2026" */
export function formatGermanDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

/** 1900 → "19", 750 → "7,5" */
export function formatGermanPercent(basisPoints: number): string {
  const percent = basisPoints / 100;
  if (Number.isInteger(percent)) return String(percent);
  return percent.toFixed(2).replace(/0$/, '').replace('.', ',');
}

/** 1000 milliunits → "1", 1500 → "1,5" */
export function formatGermanQuantity(milliunits: number): string {
  const whole = Math.floor(milliunits / 1_000);
  const fraction = String(milliunits % 1_000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole},${fraction}` : String(whole);
}

/** 123456 → "1234.56" — EN 16931 amounts carry exactly two decimals. */
export function formatXmlAmount(cents: number): string {
  const { sign, whole, fraction } = splitCents(cents);
  return `${sign}${whole}.${fraction}`;
}

/** 1900 → "19.00" */
export function formatXmlPercent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2);
}

/** 1000 milliunits → "1.000" */
export function formatXmlQuantity(milliunits: number): string {
  if (!Number.isSafeInteger(milliunits) || milliunits < 0) {
    throw new RangeError('quantity must be a non-negative safe integer of milliunits');
  }
  const whole = Math.floor(milliunits / 1_000);
  return `${whole}.${String(milliunits % 1_000).padStart(3, '0')}`;
}

/** UBL / XML Schema date: "2026-07-27" */
export function formatXmlDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** CII udt:DateTimeString with format="102": "20260727" */
export function formatCiiDate(date: Date): string {
  return formatXmlDate(date).replace(/-/g, '');
}
