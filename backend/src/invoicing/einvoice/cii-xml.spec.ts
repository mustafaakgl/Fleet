import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildCiiXml, CII_EN16931_GUIDELINE_ID } from './cii-xml';
import { sampleDocument, sampleLines, sampleTaxBreakdown } from './test-helpers';

function readGolden(name: string): string {
  return readFileSync(join(__dirname, '__golden__', name), 'utf8');
}

/** Pulls the text content of every occurrence of an element, in document order. */
function values(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]*)</${tagName}>`, 'g');
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

/** Index of an element's first occurrence, for asserting schema sequence order. */
function positionOf(xml: string, tagName: string): number {
  // The trailing character guard keeps `<ram:ID>` from matching `<ram:IDs>` and
  // `<rsm:ExchangedDocument>` from matching `<rsm:ExchangedDocumentContext>`.
  const index = xml.search(new RegExp(`<${tagName}[\\s>/]`));
  assert.notEqual(index, -1, `expected ${tagName} to be present`);
  return index;
}

describe('CII (ZUGFeRD / Factur-X) generation', () => {
  it('matches the golden EN 16931 document', () => {
    assert.equal(buildCiiXml(sampleDocument()), readGolden('cii-en16931.xml'));
  });

  it('is deterministic — the same invoice always produces the same bytes', () => {
    assert.equal(buildCiiXml(sampleDocument()), buildCiiXml(sampleDocument()));
  });

  it('carries every field EN 16931 makes mandatory', () => {
    const xml = buildCiiXml(sampleDocument());

    // BT-24 specification identifier
    assert.ok(xml.includes(`<ram:ID>${CII_EN16931_GUIDELINE_ID}</ram:ID>`));
    // BT-1 invoice number, BT-3 type code, BT-2 issue date
    assert.ok(xml.includes('<ram:ID>RE-2026-00001</ram:ID>'));
    assert.ok(xml.includes('<ram:TypeCode>380</ram:TypeCode>'));
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260727</udt:DateTimeString>'));
    // BT-5 currency
    assert.ok(xml.includes('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>'));
    // BT-27/BT-44 party names
    assert.ok(xml.includes('<ram:Name>Fleet Transporte GmbH</ram:Name>'));
    assert.ok(xml.includes('<ram:Name>Acme Logistik GmbH</ram:Name>'));
    // BT-31 seller VAT identifier and BT-32 seller tax registration
    assert.ok(xml.includes('<ram:ID schemeID="VA">DE123456789</ram:ID>'));
    assert.ok(xml.includes('<ram:ID schemeID="FC">30/123/45678</ram:ID>'));
    // BT-48 buyer VAT identifier
    assert.ok(xml.includes('<ram:ID schemeID="VA">DE987654321</ram:ID>'));
    // BG-5/BG-8 postal addresses
    assert.ok(xml.includes('<ram:LineOne>Musterstr. 1</ram:LineOne>'));
    assert.ok(xml.includes('<ram:LineOne>Hafenstr. 12</ram:LineOne>'));
    assert.ok(xml.includes('<ram:PostcodeCode>10115</ram:PostcodeCode>'));
    assert.ok(xml.includes('<ram:PostcodeCode>20457</ram:PostcodeCode>'));
    // BT-73/74 invoicing period
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260701</udt:DateTimeString>'));
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260726</udt:DateTimeString>'));
    // BT-9 due date
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260810</udt:DateTimeString>'));
    // BG-22 document totals
    assert.deepEqual(values(xml, 'ram:LineTotalAmount'), ['1000.00', '500.00', '1500.00']);
    assert.deepEqual(values(xml, 'ram:TaxBasisTotalAmount'), ['1500.00']);
    assert.deepEqual(values(xml, 'ram:TaxTotalAmount'), ['225.00']);
    assert.deepEqual(values(xml, 'ram:GrandTotalAmount'), ['1725.00']);
    assert.deepEqual(values(xml, 'ram:DuePayableAmount'), ['1725.00']);
    // BT-115 payable amount currency is required on the tax total
    assert.ok(xml.includes('<ram:TaxTotalAmount currencyID="EUR">225.00</ram:TaxTotalAmount>'));
  });

  it('keeps the CII schema element sequence', () => {
    const xml = buildCiiXml(sampleDocument({ buyerReference: '991-33333TEST-33' }));

    assert.ok(positionOf(xml, 'rsm:ExchangedDocumentContext') < positionOf(xml, 'rsm:ExchangedDocument'));
    assert.ok(positionOf(xml, 'rsm:ExchangedDocument') < positionOf(xml, 'rsm:SupplyChainTradeTransaction'));
    assert.ok(
      positionOf(xml, 'ram:IncludedSupplyChainTradeLineItem') <
        positionOf(xml, 'ram:ApplicableHeaderTradeAgreement'),
    );
    // BuyerReference (BT-10) opens the trade agreement, before the parties.
    assert.ok(positionOf(xml, 'ram:BuyerReference') < positionOf(xml, 'ram:SellerTradeParty'));
    assert.ok(positionOf(xml, 'ram:SellerTradeParty') < positionOf(xml, 'ram:BuyerTradeParty'));
    assert.ok(
      positionOf(xml, 'ram:ApplicableHeaderTradeAgreement') <
        positionOf(xml, 'ram:ApplicableHeaderTradeDelivery'),
    );
    assert.ok(
      positionOf(xml, 'ram:ApplicableHeaderTradeDelivery') <
        positionOf(xml, 'ram:ApplicableHeaderTradeSettlement'),
    );
  });

  it('writes one tax block per rate on a mixed 19% and 7% invoice', () => {
    const xml = buildCiiXml(sampleDocument());
    const settlement = xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'));

    assert.deepEqual(values(settlement, 'ram:CalculatedAmount'), ['190.00', '35.00']);
    assert.deepEqual(values(settlement, 'ram:BasisAmount'), ['1000.00', '500.00']);
    assert.deepEqual(values(settlement, 'ram:RateApplicablePercent'), ['19.00', '7.00']);
    // Both German rates are "standard rate" category S; the percentage tells them apart.
    assert.deepEqual(values(settlement, 'ram:CategoryCode'), ['S', 'S']);

    const basisTotal = values(settlement, 'ram:BasisAmount')
      .map((value) => Math.round(Number(value) * 100))
      .reduce((sum, value) => sum + value, 0);
    assert.equal(basisTotal, 150_000);
  });

  it('merges breakdown rows that would collapse onto the same tax block', () => {
    const xml = buildCiiXml(
      sampleDocument({
        taxBreakdown: [
          { taxCategory: 'standard', taxRateBasisPoints: 1_900, netCents: 60_000, taxCents: 11_400, grossCents: 71_400 },
          { taxCategory: 'standard', taxRateBasisPoints: 1_900, netCents: 40_000, taxCents: 7_600, grossCents: 47_600 },
        ],
      }),
    );
    const settlement = xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'));

    assert.deepEqual(values(settlement, 'ram:BasisAmount'), ['1000.00']);
    assert.deepEqual(values(settlement, 'ram:CalculatedAmount'), ['190.00']);
  });

  it('states the reverse charge reason on § 13b invoices', () => {
    const lines = sampleLines().slice(0, 1);
    lines[0] = { ...lines[0], taxCategory: 'reverse_charge', taxRateBasisPoints: 0 };
    const xml = buildCiiXml(
      sampleDocument({
        lines,
        taxBreakdown: [
          { taxCategory: 'reverse_charge', taxRateBasisPoints: 0, netCents: 100_000, taxCents: 0, grossCents: 100_000 },
        ],
        netCents: 100_000,
        taxCents: 0,
        grossCents: 100_000,
      }),
    );

    assert.deepEqual(values(xml, 'ram:CategoryCode'), ['AE', 'AE']);
    assert.ok(
      xml.includes('<ram:ExemptionReason>Steuerschuldnerschaft des Leistungsempfängers</ram:ExemptionReason>'),
    );
    assert.ok(
      xml.includes('<ram:Content>Steuerschuldnerschaft des Leistungsempfängers</ram:Content>'),
    );
  });

  it('states the § 19 UStG reason on small business invoices', () => {
    const lines = sampleLines().map((line) => ({
      ...line,
      taxCategory: 'exempt' as const,
      taxRateBasisPoints: 0,
    }));
    const xml = buildCiiXml(
      sampleDocument({
        lines,
        smallBusinessRule: true,
        taxBreakdown: [
          { taxCategory: 'exempt', taxRateBasisPoints: 0, netCents: 150_000, taxCents: 0, grossCents: 150_000 },
        ],
        taxCents: 0,
        grossCents: 150_000,
      }),
    );

    assert.deepEqual(values(xml, 'ram:CategoryCode'), ['E', 'E', 'E']);
    assert.ok(xml.includes('Kleinunternehmer gemäß § 19 UStG'));
    assert.ok(
      xml.includes(
        '<ram:Content>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</ram:Content>',
      ),
    );
  });

  it('escapes characters that would otherwise break the document', () => {
    const xml = buildCiiXml(
      sampleDocument({
        customer: {
          name: 'Müller & Söhne <GmbH>',
          street: 'Haupt"str." 1',
          postalCode: '10115',
          city: 'Berlin',
          countryCode: 'DE',
          vatId: null,
          email: null,
        },
      }),
    );

    assert.ok(xml.includes('<ram:Name>Müller &amp; Söhne &lt;GmbH&gt;</ram:Name>'));
    assert.ok(xml.includes('<ram:LineOne>Haupt&quot;str.&quot; 1</ram:LineOne>'));
    assert.ok(!xml.includes('<GmbH>'));
  });

  it('keeps the golden fixture in sync with the tax breakdown helper', () => {
    // Guards against the fixture drifting away from the amounts the writers are asked for.
    const breakdown = sampleTaxBreakdown();
    const net = breakdown.reduce((sum, group) => sum + group.netCents, 0);
    const tax = breakdown.reduce((sum, group) => sum + group.taxCents, 0);
    assert.equal(net, 150_000);
    assert.equal(tax, 22_500);
  });
});
