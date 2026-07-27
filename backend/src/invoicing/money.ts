export type InvoiceTaxCategoryValue =
  | 'standard'
  | 'reduced'
  | 'exempt'
  | 'reverse_charge';

export type MoneyLineInput = {
  quantityMilliunits: number;
  unitPriceCents: number;
  taxRateBasisPoints: number;
  taxCategory: InvoiceTaxCategoryValue;
};

export type MoneyLineResult = MoneyLineInput & {
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type TaxBreakdownEntry = {
  taxCategory: InvoiceTaxCategoryValue;
  taxRateBasisPoints: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type InvoiceTotals = {
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxBreakdown: TaxBreakdownEntry[];
};

const MILLIUNITS_PER_UNIT = 1_000n;
const BASIS_POINTS_PER_WHOLE = 10_000n;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > MAX_SAFE_INTEGER_BIGINT || value < -MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError(`${label} exceeds JavaScript safe integer range`);
  }
  return Number(value);
}

/** Kaufmännisches Runden for non-negative integer fractions. */
function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError('Rounding expects a non-negative numerator and positive denominator');
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function parseQuantityToMilliunits(value: string): number {
  const normalized = value.trim();
  const match = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(normalized);
  if (!match) {
    throw new RangeError('quantity must be a positive decimal with at most three decimal places');
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(3, '0'));
  const milliunits = whole * MILLIUNITS_PER_UNIT + fraction;
  if (milliunits <= 0n) {
    throw new RangeError('quantity must be greater than zero');
  }
  return toSafeNumber(milliunits, 'quantity');
}

export function formatMilliunits(value: number): string {
  assertNonNegativeSafeInteger(value, 'quantityMilliunits');
  const whole = Math.floor(value / 1_000);
  const fraction = String(value % 1_000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function calculateLine(input: MoneyLineInput): MoneyLineResult {
  assertNonNegativeSafeInteger(input.quantityMilliunits, 'quantityMilliunits');
  if (input.quantityMilliunits === 0) {
    throw new RangeError('quantityMilliunits must be greater than zero');
  }
  assertNonNegativeSafeInteger(input.unitPriceCents, 'unitPriceCents');
  assertNonNegativeSafeInteger(input.taxRateBasisPoints, 'taxRateBasisPoints');
  if (input.taxRateBasisPoints > 10_000) {
    throw new RangeError('taxRateBasisPoints must be between 0 and 10000');
  }
  if (
    (input.taxCategory === 'exempt' || input.taxCategory === 'reverse_charge') &&
    input.taxRateBasisPoints !== 0
  ) {
    throw new RangeError(`${input.taxCategory} lines must have a zero tax rate`);
  }

  const net = divideAndRoundHalfUp(
    BigInt(input.quantityMilliunits) * BigInt(input.unitPriceCents),
    MILLIUNITS_PER_UNIT,
  );
  const tax = divideAndRoundHalfUp(
    net * BigInt(input.taxRateBasisPoints),
    BASIS_POINTS_PER_WHOLE,
  );

  const netCents = toSafeNumber(net, 'netCents');
  const taxCents = toSafeNumber(tax, 'taxCents');
  return {
    ...input,
    netCents,
    taxCents,
    grossCents: toSafeNumber(net + tax, 'grossCents'),
  };
}

export function calculateInvoiceTotals(inputs: MoneyLineInput[]): InvoiceTotals {
  if (inputs.length === 0) {
    throw new RangeError('An invoice must contain at least one line');
  }

  const breakdown = new Map<string, TaxBreakdownEntry>();
  let netCents = 0;
  let taxCents = 0;
  let grossCents = 0;

  for (const input of inputs) {
    const line = calculateLine(input);
    netCents += line.netCents;
    taxCents += line.taxCents;
    grossCents += line.grossCents;
    assertNonNegativeSafeInteger(netCents, 'invoice netCents');
    assertNonNegativeSafeInteger(taxCents, 'invoice taxCents');
    assertNonNegativeSafeInteger(grossCents, 'invoice grossCents');

    const key = `${line.taxCategory}:${line.taxRateBasisPoints}`;
    const current = breakdown.get(key) ?? {
      taxCategory: line.taxCategory,
      taxRateBasisPoints: line.taxRateBasisPoints,
      netCents: 0,
      taxCents: 0,
      grossCents: 0,
    };
    current.netCents += line.netCents;
    current.taxCents += line.taxCents;
    current.grossCents += line.grossCents;
    breakdown.set(key, current);
  }

  return {
    netCents,
    taxCents,
    grossCents,
    taxBreakdown: [...breakdown.values()].sort(
      (left, right) =>
        right.taxRateBasisPoints - left.taxRateBasisPoints ||
        left.taxCategory.localeCompare(right.taxCategory),
    ),
  };
}
