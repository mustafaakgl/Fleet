/**
 * Format-neutral view of a finalized invoice. The CII, UBL and PDF writers all read
 * this and nothing else, so they stay pure and testable without a database.
 *
 * Everything here comes from the invoice's own snapshot columns, never from live
 * master data — a finalized invoice must render identically forever (GoBD).
 */

export type EInvoiceTaxCategory = 'standard' | 'reduced' | 'exempt' | 'reverse_charge';

export type EInvoiceUnit = 'day' | 'hour' | 'tour' | 'km' | 'flat';

export type EInvoiceAddress = {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
};

export type EInvoiceSupplier = EInvoiceAddress & {
  vatId: string | null;
  taxNumber: string | null;
  email: string | null;
  iban: string;
  bic: string | null;
  bankName: string | null;
  footerText: string | null;
};

export type EInvoiceCustomer = EInvoiceAddress & {
  vatId: string | null;
  email: string | null;
};

export type EInvoiceLine = {
  position: number;
  description: string;
  quantityMilliunits: number;
  unit: EInvoiceUnit;
  unitPriceCents: number;
  taxRateBasisPoints: number;
  taxCategory: EInvoiceTaxCategory;
  netCents: number;
  serviceDate: Date | null;
};

export type EInvoiceTaxGroup = {
  taxCategory: EInvoiceTaxCategory;
  taxRateBasisPoints: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type EInvoiceDocument = {
  number: string;
  invoiceDate: Date;
  dueDate: Date;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
  paymentTermDays: number;
  currency: string;
  supplier: EInvoiceSupplier;
  customer: EInvoiceCustomer;
  /** Leitweg-ID (BT-10). Mandatory for XRechnung, optional elsewhere. */
  buyerReference: string | null;
  lines: EInvoiceLine[];
  taxBreakdown: EInvoiceTaxGroup[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  smallBusinessRule: boolean;
  notes: string | null;
};

/**
 * Raised when the invoice cannot legally be expressed in the requested format.
 * The service layer maps this onto a 400 so the caller sees the missing field.
 */
export class EInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EInvoiceValidationError';
  }
}

/** UN/ECE Recommendation 20 unit codes, as required by EN 16931 (BT-130). */
const UNIT_CODES: Record<EInvoiceUnit, string> = {
  day: 'DAY',
  hour: 'HUR',
  tour: 'C62',
  km: 'KMT',
  flat: 'LS',
};

const UNIT_LABELS_DE: Record<EInvoiceUnit, string> = {
  day: 'Tag',
  hour: 'Std.',
  tour: 'Tour',
  km: 'km',
  flat: 'Pauschal',
};

export function unitCode(unit: EInvoiceUnit): string {
  return UNIT_CODES[unit];
}

export function unitLabelDe(unit: EInvoiceUnit): string {
  return UNIT_LABELS_DE[unit];
}

/** UNCL5305 VAT category code (BT-118). Reduced rate stays "S"; the rate tells them apart. */
export function vatCategoryCode(category: EInvoiceTaxCategory): 'S' | 'E' | 'AE' {
  if (category === 'reverse_charge') return 'AE';
  if (category === 'exempt') return 'E';
  return 'S';
}

export const REVERSE_CHARGE_NOTE = 'Steuerschuldnerschaft des Leistungsempfängers';

export const SMALL_BUSINESS_EXEMPTION_REASON =
  'Kleinunternehmer gemäß § 19 UStG — keine Umsatzsteuer ausgewiesen';

/** BT-120: why no VAT is charged. Required whenever the category is E or AE. */
export function exemptionReason(
  category: EInvoiceTaxCategory,
  smallBusinessRule: boolean,
): string | null {
  if (category === 'reverse_charge') return REVERSE_CHARGE_NOTE;
  if (category === 'exempt') {
    return smallBusinessRule ? SMALL_BUSINESS_EXEMPTION_REASON : 'Steuerbefreite Leistung';
  }
  return null;
}

/**
 * Two breakdown rows can collapse onto the same EN 16931 tax block (same category code and
 * rate). Emitting both would be a schema violation, so they are merged first.
 */
export function mergeTaxGroups(groups: EInvoiceTaxGroup[]): EInvoiceTaxGroup[] {
  const merged = new Map<string, EInvoiceTaxGroup>();
  for (const group of groups) {
    const key = `${vatCategoryCode(group.taxCategory)}:${group.taxRateBasisPoints}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...group });
      continue;
    }
    current.netCents += group.netCents;
    current.taxCents += group.taxCents;
    current.grossCents += group.grossCents;
  }
  return [...merged.values()].sort(
    (left, right) =>
      right.taxRateBasisPoints - left.taxRateBasisPoints ||
      left.taxCategory.localeCompare(right.taxCategory),
  );
}
