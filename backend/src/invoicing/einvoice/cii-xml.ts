/**
 * EN 16931 Cross Industry Invoice (CII) — the XML that ZUGFeRD 2.3 / Factur-X embeds
 * into the PDF. Profile: EN 16931 (COMFORT).
 *
 * Pure function: invoice document in, XML string out. No I/O, no clock, no randomness.
 *
 * CII is sequence-bound, not name-bound: every element must appear in the order the
 * schema declares or a validator rejects the file. The ordering below mirrors
 * urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100.
 */
import {
  exemptionReason,
  mergeTaxGroups,
  unitCode,
  vatCategoryCode,
  type EInvoiceDocument,
  type EInvoiceLine,
  type EInvoiceSupplier,
  type EInvoiceCustomer,
} from './document-model';
import {
  formatCiiDate,
  formatXmlAmount,
  formatXmlPercent,
  formatXmlQuantity,
} from './format';
import { element, optionalTextElement, textElement, xmlDocument } from './xml';

/** Guideline ID of the EN 16931 profile (ZUGFeRD 2.x "EN 16931" / Factur-X "EN 16931"). */
export const CII_EN16931_GUIDELINE_ID = 'urn:cen.eu:en16931:2017';

/** UNCL1001 document type 380 = commercial invoice. */
const INVOICE_TYPE_CODE = '380';

/** File name Factur-X / ZUGFeRD 2.1+ requires for the embedded XML. */
export const CII_ATTACHMENT_FILE_NAME = 'factur-x.xml';

const NAMESPACES = {
  'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  'xmlns:ram':
    'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  'xmlns:qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

function dateTimeString(name: string, date: Date): string {
  return element(name, {}, [
    textElement('udt:DateTimeString', formatCiiDate(date), { format: '102' }),
  ]);
}

function postalAddress(party: { street: string | null; postalCode: string | null; city: string | null; countryCode: string }): string {
  return element('ram:PostalTradeAddress', {}, [
    optionalTextElement('ram:PostcodeCode', party.postalCode),
    optionalTextElement('ram:LineOne', party.street),
    optionalTextElement('ram:CityName', party.city),
    textElement('ram:CountryID', party.countryCode),
  ]);
}

function sellerParty(supplier: EInvoiceSupplier): string {
  return element('ram:SellerTradeParty', {}, [
    textElement('ram:Name', supplier.name),
    postalAddress(supplier),
    supplier.email
      ? element('ram:URIUniversalCommunication', {}, [
          textElement('ram:URIID', supplier.email, { schemeID: 'EM' }),
        ])
      : null,
    // schemeID VA = VAT identifier, FC = national tax number (Steuernummer).
    supplier.vatId
      ? element('ram:SpecifiedTaxRegistration', {}, [
          textElement('ram:ID', supplier.vatId, { schemeID: 'VA' }),
        ])
      : null,
    supplier.taxNumber
      ? element('ram:SpecifiedTaxRegistration', {}, [
          textElement('ram:ID', supplier.taxNumber, { schemeID: 'FC' }),
        ])
      : null,
  ]);
}

function buyerParty(customer: EInvoiceCustomer): string {
  return element('ram:BuyerTradeParty', {}, [
    textElement('ram:Name', customer.name),
    postalAddress(customer),
    customer.email
      ? element('ram:URIUniversalCommunication', {}, [
          textElement('ram:URIID', customer.email, { schemeID: 'EM' }),
        ])
      : null,
    customer.vatId
      ? element('ram:SpecifiedTaxRegistration', {}, [
          textElement('ram:ID', customer.vatId, { schemeID: 'VA' }),
        ])
      : null,
  ]);
}

function tradeLineItem(line: EInvoiceLine, smallBusinessRule: boolean): string {
  const reason = exemptionReason(line.taxCategory, smallBusinessRule);
  return element('ram:IncludedSupplyChainTradeLineItem', {}, [
    element('ram:AssociatedDocumentLineDocument', {}, [
      textElement('ram:LineID', String(line.position)),
    ]),
    element('ram:SpecifiedTradeProduct', {}, [
      textElement('ram:Name', line.description),
    ]),
    element('ram:SpecifiedLineTradeAgreement', {}, [
      element('ram:NetPriceProductTradePrice', {}, [
        textElement('ram:ChargeAmount', formatXmlAmount(line.unitPriceCents)),
      ]),
    ]),
    element('ram:SpecifiedLineTradeDelivery', {}, [
      textElement('ram:BilledQuantity', formatXmlQuantity(line.quantityMilliunits), {
        unitCode: unitCode(line.unit),
      }),
    ]),
    element('ram:SpecifiedLineTradeSettlement', {}, [
      element('ram:ApplicableTradeTax', {}, [
        textElement('ram:TypeCode', 'VAT'),
        reason ? textElement('ram:ExemptionReason', reason) : null,
        textElement('ram:CategoryCode', vatCategoryCode(line.taxCategory)),
        textElement('ram:RateApplicablePercent', formatXmlPercent(line.taxRateBasisPoints)),
      ]),
      line.serviceDate
        ? element('ram:BillingSpecifiedPeriod', {}, [
            dateTimeString('ram:StartDateTime', line.serviceDate),
            dateTimeString('ram:EndDateTime', line.serviceDate),
          ])
        : null,
      element('ram:SpecifiedTradeSettlementLineMonetarySummation', {}, [
        textElement('ram:LineTotalAmount', formatXmlAmount(line.netCents)),
      ]),
    ]),
  ]);
}

function headerTradeSettlement(document: EInvoiceDocument): string {
  const taxGroups = mergeTaxGroups(document.taxBreakdown);
  return element('ram:ApplicableHeaderTradeSettlement', {}, [
    textElement('ram:InvoiceCurrencyCode', document.currency),
    element('ram:SpecifiedTradeSettlementPaymentMeans', {}, [
      // UNCL4461 code 58 = SEPA credit transfer.
      textElement('ram:TypeCode', '58'),
      element('ram:PayeePartyCreditorFinancialAccount', {}, [
        textElement('ram:IBANID', document.supplier.iban),
        optionalTextElement('ram:AccountName', document.supplier.name),
      ]),
      document.supplier.bic
        ? element('ram:PayeeSpecifiedCreditorFinancialInstitution', {}, [
            textElement('ram:BICID', document.supplier.bic),
          ])
        : null,
    ]),
    ...taxGroups.map((group) => {
      const reason = exemptionReason(group.taxCategory, document.smallBusinessRule);
      return element('ram:ApplicableTradeTax', {}, [
        textElement('ram:CalculatedAmount', formatXmlAmount(group.taxCents)),
        textElement('ram:TypeCode', 'VAT'),
        reason ? textElement('ram:ExemptionReason', reason) : null,
        textElement('ram:BasisAmount', formatXmlAmount(group.netCents)),
        textElement('ram:CategoryCode', vatCategoryCode(group.taxCategory)),
        textElement('ram:RateApplicablePercent', formatXmlPercent(group.taxRateBasisPoints)),
      ]);
    }),
    element('ram:BillingSpecifiedPeriod', {}, [
      dateTimeString('ram:StartDateTime', document.servicePeriodStart),
      dateTimeString('ram:EndDateTime', document.servicePeriodEnd),
    ]),
    element('ram:SpecifiedTradePaymentTerms', {}, [
      textElement(
        'ram:Description',
        `Zahlbar innerhalb von ${document.paymentTermDays} Tagen ohne Abzug.`,
      ),
      dateTimeString('ram:DueDateDateTime', document.dueDate),
    ]),
    element('ram:SpecifiedTradeSettlementHeaderMonetarySummation', {}, [
      textElement('ram:LineTotalAmount', formatXmlAmount(document.netCents)),
      textElement('ram:TaxBasisTotalAmount', formatXmlAmount(document.netCents)),
      textElement('ram:TaxTotalAmount', formatXmlAmount(document.taxCents), {
        currencyID: document.currency,
      }),
      textElement('ram:GrandTotalAmount', formatXmlAmount(document.grossCents)),
      textElement('ram:DuePayableAmount', formatXmlAmount(document.grossCents)),
    ]),
  ]);
}

/** Notes carried into BT-22, including the statements German law makes mandatory. */
function documentNotes(document: EInvoiceDocument): string[] {
  const notes: string[] = [];
  if (document.taxBreakdown.some((group) => group.taxCategory === 'reverse_charge')) {
    notes.push('Steuerschuldnerschaft des Leistungsempfängers');
  }
  if (document.smallBusinessRule) {
    notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).');
  }
  const free = document.notes?.trim();
  if (free) notes.push(free);
  return notes;
}

export function buildCiiXml(document: EInvoiceDocument): string {
  const root = element('rsm:CrossIndustryInvoice', NAMESPACES, [
    element('rsm:ExchangedDocumentContext', {}, [
      element('ram:GuidelineSpecifiedDocumentContextParameter', {}, [
        textElement('ram:ID', CII_EN16931_GUIDELINE_ID),
      ]),
    ]),
    element('rsm:ExchangedDocument', {}, [
      textElement('ram:ID', document.number),
      textElement('ram:TypeCode', INVOICE_TYPE_CODE),
      dateTimeString('ram:IssueDateTime', document.invoiceDate),
      ...documentNotes(document).map((note) =>
        element('ram:IncludedNote', {}, [textElement('ram:Content', note)]),
      ),
    ]),
    element('rsm:SupplyChainTradeTransaction', {}, [
      ...document.lines.map((line) => tradeLineItem(line, document.smallBusinessRule)),
      element('ram:ApplicableHeaderTradeAgreement', {}, [
        optionalTextElement('ram:BuyerReference', document.buyerReference),
        sellerParty(document.supplier),
        buyerParty(document.customer),
      ]),
      element('ram:ApplicableHeaderTradeDelivery', {}, [
        element('ram:ActualDeliverySupplyChainEvent', {}, [
          dateTimeString('ram:OccurrenceDateTime', document.servicePeriodEnd),
        ]),
      ]),
      headerTradeSettlement(document),
    ]),
  ]);

  return xmlDocument(root);
}
