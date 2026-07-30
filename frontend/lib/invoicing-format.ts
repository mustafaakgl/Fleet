import type { InvoiceTaxCategory } from '@/lib/types';

/** Tax presets the UI offers. Category and rate always travel together because the
 *  backend rejects a non-zero rate on exempt and reverse-charge lines. */
export type InvoiceTaxPreset = {
  key: string;
  taxCategory: InvoiceTaxCategory;
  taxRateBasisPoints: number;
};

export const INVOICE_TAX_PRESETS: InvoiceTaxPreset[] = [
  { key: 'standard', taxCategory: 'standard', taxRateBasisPoints: 1_900 },
  { key: 'reduced', taxCategory: 'reduced', taxRateBasisPoints: 700 },
  { key: 'exempt', taxCategory: 'exempt', taxRateBasisPoints: 0 },
  { key: 'reverse_charge', taxCategory: 'reverse_charge', taxRateBasisPoints: 0 },
];

export function taxPresetKey(category: InvoiceTaxCategory, rateBasisPoints: number): string {
  const match = INVOICE_TAX_PRESETS.find(
    (preset) =>
      preset.taxCategory === category && preset.taxRateBasisPoints === rateBasisPoints,
  );
  return match?.key ?? 'standard';
}

export function taxPresetByKey(key: string): InvoiceTaxPreset {
  return INVOICE_TAX_PRESETS.find((preset) => preset.key === key) ?? INVOICE_TAX_PRESETS[0];
}

export function centsToEuro(cents: number): number {
  return cents / 100;
}

/** Accepts both German ("1.234,56") and plain decimal input and returns whole cents. */
export function euroInputToCents(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  // A comma marks the decimal separator, so any dot left of it groups thousands.
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Parses "1,5" / "1.5" into milliunits, mirroring the backend quantity rules. */
export function quantityToMilliunits(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const milliunits = Number(match[1]) * 1_000 + Number((match[2] ?? '').padEnd(3, '0'));
  return milliunits > 0 ? milliunits : null;
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor(numerator / denominator + 0.5);
}

/** Client-side twin of the backend line math, used for the live preview before saving. */
export function computeLineTotals(
  quantity: string,
  unitPriceCents: number,
  taxRateBasisPoints: number,
): { netCents: number; taxCents: number; grossCents: number } | null {
  const milliunits = quantityToMilliunits(quantity);
  if (milliunits === null) return null;
  const netCents = roundHalfUp(milliunits * unitPriceCents, 1_000);
  const taxCents = roundHalfUp(netCents * taxRateBasisPoints, 10_000);
  return { netCents, taxCents, grossCents: netCents + taxCents };
}

/** Mirrors backend formatInvoiceNumber so the settings page can preview live. */
export function previewInvoiceNumber(format: string, year: number, value = 1): string | null {
  if (!format.includes('{YYYY}')) return null;
  const matches = [...format.matchAll(/\{(0{0,11}1)\}/g)];
  if (matches.length !== 1) return null;

  const width = matches[0][1].length;
  const sequence = String(value);
  if (sequence.length > width) return null;

  return format
    .replace('{YYYY}', String(year))
    .replace(matches[0][0], sequence.padStart(width, '0'));
}
