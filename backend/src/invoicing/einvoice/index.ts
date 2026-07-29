/**
 * Entry point for legal invoice document generation.
 *
 * Everything below this module is pure: given the same finalized invoice it always
 * produces the same bytes. That is what lets the finalize flow render once and store
 * forever without ever needing to re-render.
 */
import { buildCiiXml } from './cii-xml';
import {
  EInvoiceValidationError,
  type EInvoiceDocument,
  type EInvoiceLine,
  type EInvoiceTaxCategory,
  type EInvoiceTaxGroup,
  type EInvoiceUnit,
} from './document-model';
import { renderInvoicePdf } from './pdf-renderer';
import { buildUblXml } from './ubl-xml';

export * from './document-model';
export * from './format';
export { buildCiiXml, CII_ATTACHMENT_FILE_NAME, CII_EN16931_GUIDELINE_ID } from './cii-xml';
export { buildUblXml, XRECHNUNG_CUSTOMIZATION_ID, XRECHNUNG_PROFILE_ID } from './ubl-xml';
export { renderInvoicePdf } from './pdf-renderer';

/** Mirrors the Prisma `EInvoicePreference` enum without importing the client. */
export type EInvoicePreferenceValue = 'zugferd' | 'xrechnung' | 'both';

/** Invoice columns the document writers rely on — all of them snapshots, never live joins. */
export type FinalizedInvoiceSnapshot = {
  number: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
  paymentTermDays: number;
  currency: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  notes: string | null;
  leitwegId: string | null;
  customerName: string | null;
  customerStreet: string | null;
  customerPostalCode: string | null;
  customerCity: string | null;
  customerCountryCode: string | null;
  customerVatId: string | null;
  customerEmail: string | null;
};

export type SupplierSnapshot = {
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  taxNumber: string | null;
  vatId: string | null;
  registrationNumber: string | null;
  phone: string | null;
  iban: string;
  bic: string | null;
  bankName: string | null;
  smallBusinessRule: boolean;
  invoiceFooterText: string | null;
  invoiceEmailCc: string | null;
};

export type FinalizedLineSnapshot = {
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

export function buildEInvoiceDocument(params: {
  invoice: FinalizedInvoiceSnapshot;
  supplier: SupplierSnapshot;
  lines: FinalizedLineSnapshot[];
  taxBreakdown: EInvoiceTaxGroup[];
}): EInvoiceDocument {
  const { invoice, supplier, lines, taxBreakdown } = params;

  if (!invoice.number) {
    throw new EInvoiceValidationError('An invoice number is required before documents can be issued');
  }
  if (!invoice.dueDate) {
    throw new EInvoiceValidationError('A due date is required before documents can be issued');
  }
  if (!invoice.customerName) {
    throw new EInvoiceValidationError('The customer snapshot is missing on the invoice');
  }
  if (lines.length === 0) {
    throw new EInvoiceValidationError('An invoice needs at least one line');
  }

  const documentLines: EInvoiceLine[] = lines.map((line) => ({
    position: line.position,
    description: line.description,
    quantityMilliunits: line.quantityMilliunits,
    unit: line.unit,
    unitPriceCents: line.unitPriceCents,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxCategory: line.taxCategory,
    netCents: line.netCents,
    serviceDate: line.serviceDate,
  }));

  return {
    number: invoice.number,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    servicePeriodStart: invoice.servicePeriodStart,
    servicePeriodEnd: invoice.servicePeriodEnd,
    paymentTermDays: invoice.paymentTermDays,
    currency: invoice.currency,
    supplier: {
      name: supplier.legalName,
      street: supplier.street,
      postalCode: supplier.postalCode,
      city: supplier.city,
      countryCode: supplier.countryCode,
      vatId: supplier.vatId,
      taxNumber: supplier.taxNumber,
      registrationNumber: supplier.registrationNumber,
      email: supplier.invoiceEmailCc,
      phone: supplier.phone,
      iban: supplier.iban,
      bic: supplier.bic,
      bankName: supplier.bankName,
      footerText: supplier.invoiceFooterText,
    },
    customer: {
      name: invoice.customerName,
      street: invoice.customerStreet,
      postalCode: invoice.customerPostalCode,
      city: invoice.customerCity,
      countryCode: invoice.customerCountryCode ?? 'DE',
      vatId: invoice.customerVatId,
      email: invoice.customerEmail,
    },
    buyerReference: invoice.leitwegId,
    lines: documentLines,
    taxBreakdown,
    netCents: invoice.netCents,
    taxCents: invoice.taxCents,
    grossCents: invoice.grossCents,
    smallBusinessRule: supplier.smallBusinessRule,
    notes: invoice.notes,
  };
}

export type RenderedInvoiceDocuments = {
  pdf: Uint8Array;
  /** ZUGFeRD / Factur-X CII, also embedded in the PDF. */
  ciiXml: string | null;
  /** XRechnung UBL, the legally original document for public-sector customers. */
  ublXml: string | null;
};

export function requiresCii(preference: EInvoicePreferenceValue): boolean {
  return preference === 'zugferd' || preference === 'both';
}

export function requiresUbl(preference: EInvoicePreferenceValue): boolean {
  return preference === 'xrechnung' || preference === 'both';
}

/**
 * Renders every document the customer's e-invoicing preference calls for.
 * `renderedAt` is injected so the output stays reproducible in tests.
 */
export async function renderInvoiceDocuments(params: {
  document: EInvoiceDocument;
  preference: EInvoicePreferenceValue;
  renderedAt: Date;
}): Promise<RenderedInvoiceDocuments> {
  const { document, preference, renderedAt } = params;
  const ciiXml = requiresCii(preference) ? buildCiiXml(document) : null;
  const ublXml = requiresUbl(preference) ? buildUblXml(document) : null;
  const pdf = await renderInvoicePdf({
    document,
    ciiXml: ciiXml ?? undefined,
    renderedAt,
  });
  return { pdf, ciiXml, ublXml };
}
