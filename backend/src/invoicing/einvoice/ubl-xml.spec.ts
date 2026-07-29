import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { EInvoiceValidationError } from './document-model';
import { buildUblXml, XRECHNUNG_CUSTOMIZATION_ID } from './ubl-xml';
import { sampleDocument, sampleLines } from './test-helpers';

const LEITWEG_ID = '991-33333TEST-33';

function readGolden(name: string): string {
  return readFileSync(join(__dirname, '__golden__', name), 'utf8');
}

function values(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]*)</${tagName}>`, 'g');
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function positionOf(xml: string, tagName: string): number {
  // The trailing character guard keeps `<ram:ID>` from matching `<ram:IDs>` and
  // `<rsm:ExchangedDocument>` from matching `<rsm:ExchangedDocumentContext>`.
  const index = xml.search(new RegExp(`<${tagName}[\\s>/]`));
  assert.notEqual(index, -1, `expected ${tagName} to be present`);
  return index;
}

describe('UBL (XRechnung) generation', () => {
  it('matches the golden XRechnung document', () => {
    assert.equal(
      buildUblXml(sampleDocument({ buyerReference: LEITWEG_ID })),
      readGolden('ubl-xrechnung.xml'),
    );
  });

  it('refuses to build without a Leitweg-ID', () => {
    assert.throws(
      () => buildUblXml(sampleDocument({ buyerReference: null })),
      (error: unknown) =>
        error instanceof EInvoiceValidationError &&
        error.message ===
          'XRechnung requires a Leitweg-ID (BT-10) on the customer before the invoice can be issued',
    );
  });

  it('treats a blank Leitweg-ID as missing', () => {
    assert.throws(
      () => buildUblXml(sampleDocument({ buyerReference: '   ' })),
      (error: unknown) => error instanceof EInvoiceValidationError,
    );
  });

  it('identifies itself as XRechnung 3.0 and routes on the Leitweg-ID', () => {
    const xml = buildUblXml(sampleDocument({ buyerReference: LEITWEG_ID }));

    assert.ok(xml.includes(`<cbc:CustomizationID>${XRECHNUNG_CUSTOMIZATION_ID}</cbc:CustomizationID>`));
    assert.ok(xml.includes(`<cbc:BuyerReference>${LEITWEG_ID}</cbc:BuyerReference>`));
    assert.ok(xml.includes('<cbc:ID>RE-2026-00001</cbc:ID>'));
    assert.ok(xml.includes('<cbc:IssueDate>2026-07-27</cbc:IssueDate>'));
    assert.ok(xml.includes('<cbc:DueDate>2026-08-10</cbc:DueDate>'));
    assert.ok(xml.includes('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>'));
    assert.ok(xml.includes('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>'));
  });

  it('keeps the UBL schema element sequence', () => {
    const xml = buildUblXml(sampleDocument({ buyerReference: LEITWEG_ID }));

    assert.ok(positionOf(xml, 'cbc:CustomizationID') < positionOf(xml, 'cbc:ProfileID'));
    assert.ok(positionOf(xml, 'cbc:ProfileID') < positionOf(xml, 'cbc:ID'));
    assert.ok(positionOf(xml, 'cbc:DocumentCurrencyCode') < positionOf(xml, 'cbc:BuyerReference'));
    assert.ok(positionOf(xml, 'cbc:BuyerReference') < positionOf(xml, 'cac:InvoicePeriod'));
    assert.ok(positionOf(xml, 'cac:InvoicePeriod') < positionOf(xml, 'cac:AccountingSupplierParty'));
    assert.ok(
      positionOf(xml, 'cac:AccountingSupplierParty') < positionOf(xml, 'cac:AccountingCustomerParty'),
    );
    assert.ok(positionOf(xml, 'cac:AccountingCustomerParty') < positionOf(xml, 'cac:PaymentMeans'));
    assert.ok(positionOf(xml, 'cac:PaymentMeans') < positionOf(xml, 'cac:PaymentTerms'));
    assert.ok(positionOf(xml, 'cac:PaymentTerms') < positionOf(xml, 'cac:TaxTotal'));
    assert.ok(positionOf(xml, 'cac:TaxTotal') < positionOf(xml, 'cac:LegalMonetaryTotal'));
    assert.ok(positionOf(xml, 'cac:LegalMonetaryTotal') < positionOf(xml, 'cac:InvoiceLine'));
  });

  it('writes one tax subtotal per rate on a mixed 19% and 7% invoice', () => {
    const xml = buildUblXml(sampleDocument({ buyerReference: LEITWEG_ID }));
    const taxTotal = xml.slice(xml.indexOf('<cac:TaxTotal>'), xml.indexOf('<cac:LegalMonetaryTotal>'));

    assert.deepEqual(values(taxTotal, 'cbc:TaxableAmount'), ['1000.00', '500.00']);
    assert.deepEqual(values(taxTotal, 'cbc:TaxAmount'), ['225.00', '190.00', '35.00']);
    assert.deepEqual(values(taxTotal, 'cbc:Percent'), ['19.00', '7.00']);
    assert.deepEqual(values(taxTotal, 'cbc:ID'), ['S', 'VAT', 'S', 'VAT']);
    assert.ok(taxTotal.includes('<cbc:TaxAmount currencyID="EUR">225.00</cbc:TaxAmount>'));
  });

  it('balances the monetary totals', () => {
    const xml = buildUblXml(sampleDocument({ buyerReference: LEITWEG_ID }));
    const totals = xml.slice(xml.indexOf('<cac:LegalMonetaryTotal>'));

    assert.deepEqual(values(totals, 'cbc:LineExtensionAmount'), ['1500.00', '1000.00', '500.00']);
    assert.deepEqual(values(totals, 'cbc:TaxExclusiveAmount'), ['1500.00']);
    assert.deepEqual(values(totals, 'cbc:TaxInclusiveAmount'), ['1725.00']);
    assert.deepEqual(values(totals, 'cbc:PayableAmount'), ['1725.00']);
  });

  it('writes each invoice line with its quantity, unit code and tax category', () => {
    const xml = buildUblXml(sampleDocument({ buyerReference: LEITWEG_ID }));
    const lines = xml.slice(xml.indexOf('<cac:InvoiceLine>'));

    assert.ok(lines.includes('<cbc:InvoicedQuantity unitCode="C62">1.000</cbc:InvoicedQuantity>'));
    assert.ok(lines.includes('<cbc:InvoicedQuantity unitCode="DAY">2.000</cbc:InvoicedQuantity>'));
    assert.ok(lines.includes('<cbc:Name>Transport Berlin – Hamburg</cbc:Name>'));
    assert.ok(lines.includes('<cbc:PriceAmount currencyID="EUR">1000.00</cbc:PriceAmount>'));
    assert.ok(lines.includes('<cbc:PriceAmount currencyID="EUR">250.00</cbc:PriceAmount>'));
  });

  it('states the reverse charge reason on § 13b invoices', () => {
    const lines = sampleLines().slice(0, 1);
    lines[0] = { ...lines[0], taxCategory: 'reverse_charge', taxRateBasisPoints: 0 };
    const xml = buildUblXml(
      sampleDocument({
        buyerReference: LEITWEG_ID,
        lines,
        taxBreakdown: [
          { taxCategory: 'reverse_charge', taxRateBasisPoints: 0, netCents: 100_000, taxCents: 0, grossCents: 100_000 },
        ],
        netCents: 100_000,
        taxCents: 0,
        grossCents: 100_000,
      }),
    );

    assert.ok(
      xml.includes(
        '<cbc:TaxExemptionReason>Steuerschuldnerschaft des Leistungsempfängers</cbc:TaxExemptionReason>',
      ),
    );
    assert.ok(xml.includes('<cbc:Note>Steuerschuldnerschaft des Leistungsempfängers</cbc:Note>'));
  });

  it('states the § 19 UStG reason on small business invoices', () => {
    const lines = sampleLines().map((line) => ({
      ...line,
      taxCategory: 'exempt' as const,
      taxRateBasisPoints: 0,
    }));
    const xml = buildUblXml(
      sampleDocument({
        buyerReference: LEITWEG_ID,
        lines,
        smallBusinessRule: true,
        taxBreakdown: [
          { taxCategory: 'exempt', taxRateBasisPoints: 0, netCents: 150_000, taxCents: 0, grossCents: 150_000 },
        ],
        taxCents: 0,
        grossCents: 150_000,
      }),
    );

    assert.ok(xml.includes('Kleinunternehmer gemäß § 19 UStG'));
    assert.ok(
      xml.includes(
        '<cbc:Note>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</cbc:Note>',
      ),
    );
  });
});
