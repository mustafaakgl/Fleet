/**
 * Shared sample invoice for the e-invoice document tests.
 *
 * Test-only module: nothing in the running application imports it.
 */
import type { EInvoiceDocument, EInvoiceLine, EInvoiceTaxGroup } from './document-model';

export const SAMPLE_INVOICE_DATE = new Date('2026-07-27T00:00:00.000Z');
export const SAMPLE_DUE_DATE = new Date('2026-08-10T00:00:00.000Z');

/** One 19 % line and one 7 % line — the mixed-rate case German invoices hit constantly. */
export function sampleLines(): EInvoiceLine[] {
  return [
    {
      position: 1,
      description: 'Transport Berlin – Hamburg',
      quantityMilliunits: 1_000,
      unit: 'tour',
      unitPriceCents: 100_000,
      taxRateBasisPoints: 1_900,
      taxCategory: 'standard',
      netCents: 100_000,
      serviceDate: new Date('2026-07-02T00:00:00.000Z'),
    },
    {
      position: 2,
      description: 'Lebensmitteltransport (ermäßigt)',
      quantityMilliunits: 2_000,
      unit: 'day',
      unitPriceCents: 25_000,
      taxRateBasisPoints: 700,
      taxCategory: 'reduced',
      netCents: 50_000,
      serviceDate: null,
    },
  ];
}

export function sampleTaxBreakdown(): EInvoiceTaxGroup[] {
  return [
    {
      taxCategory: 'standard',
      taxRateBasisPoints: 1_900,
      netCents: 100_000,
      taxCents: 19_000,
      grossCents: 119_000,
    },
    {
      taxCategory: 'reduced',
      taxRateBasisPoints: 700,
      netCents: 50_000,
      taxCents: 3_500,
      grossCents: 53_500,
    },
  ];
}

export function sampleDocument(overrides: Partial<EInvoiceDocument> = {}): EInvoiceDocument {
  return {
    number: 'RE-2026-00001',
    invoiceDate: SAMPLE_INVOICE_DATE,
    dueDate: SAMPLE_DUE_DATE,
    servicePeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    servicePeriodEnd: new Date('2026-07-26T00:00:00.000Z'),
    paymentTermDays: 14,
    currency: 'EUR',
    supplier: {
      name: 'Fleet Transporte GmbH',
      street: 'Musterstr. 1',
      postalCode: '10115',
      city: 'Berlin',
      countryCode: 'DE',
      vatId: 'DE123456789',
      taxNumber: '30/123/45678',
      email: 'rechnung@fleet.example',
      iban: 'DE02120300000000202051',
      bic: 'BYLADEM1001',
      bankName: 'Deutsche Kreditbank',
      footerText: 'Geschäftsführer: Max Mustermann — Amtsgericht Berlin HRB 12345',
    },
    customer: {
      name: 'Acme Logistik GmbH',
      street: 'Hafenstr. 12',
      postalCode: '20457',
      city: 'Hamburg',
      countryCode: 'DE',
      vatId: 'DE987654321',
      email: 'rechnung@acme.example',
    },
    buyerReference: null,
    lines: sampleLines(),
    taxBreakdown: sampleTaxBreakdown(),
    netCents: 150_000,
    taxCents: 22_500,
    grossCents: 172_500,
    smallBusinessRule: false,
    notes: null,
    ...overrides,
  };
}
