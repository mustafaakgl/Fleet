/**
 * XRechnung 3.x (UBL 2.1 Invoice) — the format German public-sector buyers must receive.
 *
 * Pure function: invoice document in, XML string out.
 *
 * Like CII, UBL is sequence-bound; the element order below follows the UBL 2.1
 * Invoice schema. The Leitweg-ID (BT-10 BuyerReference) is what routes the invoice to
 * the right authority, so XRechnung makes it mandatory and this writer refuses without it.
 */
import {
  EInvoiceValidationError,
  exemptionReason,
  mergeTaxGroups,
  unitCode,
  vatCategoryCode,
  type EInvoiceCustomer,
  type EInvoiceDocument,
  type EInvoiceLine,
  type EInvoiceSupplier,
  type EInvoiceTaxGroup,
} from './document-model';
import { formatXmlAmount, formatXmlDate, formatXmlPercent, formatXmlQuantity } from './format';
import { element, optionalTextElement, textElement, xmlDocument } from './xml';

/** Identifies the document as XRechnung 3.0, which is EN 16931 plus the German CIUS. */
export const XRECHNUNG_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0';

export const XRECHNUNG_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const INVOICE_TYPE_CODE = '380';
const VAT_TAX_SCHEME = 'VAT';

const NAMESPACES = {
  xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

function amount(name: string, cents: number, currency: string): string {
  return textElement(name, formatXmlAmount(cents), { currencyID: currency });
}

function taxScheme(): string {
  return element('cac:TaxScheme', {}, [textElement('cbc:ID', VAT_TAX_SCHEME)]);
}

function postalAddress(party: {
  street: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
}): string {
  return element('cac:PostalAddress', {}, [
    optionalTextElement('cbc:StreetName', party.street),
    optionalTextElement('cbc:CityName', party.city),
    optionalTextElement('cbc:PostalZone', party.postalCode),
    element('cac:Country', {}, [
      textElement('cbc:IdentificationCode', party.countryCode),
    ]),
  ]);
}

function supplierParty(supplier: EInvoiceSupplier): string {
  return element('cac:AccountingSupplierParty', {}, [
    element('cac:Party', {}, [
      // EAS scheme "EM" = electronic mail (BT-34).
      supplier.email
        ? textElement('cbc:EndpointID', supplier.email, { schemeID: 'EM' })
        : null,
      element('cac:PartyName', {}, [textElement('cbc:Name', supplier.name)]),
      postalAddress(supplier),
      supplier.vatId
        ? element('cac:PartyTaxScheme', {}, [
            textElement('cbc:CompanyID', supplier.vatId),
            taxScheme(),
          ])
        : null,
      supplier.taxNumber
        ? element('cac:PartyTaxScheme', {}, [
            textElement('cbc:CompanyID', supplier.taxNumber),
            element('cac:TaxScheme', {}, [textElement('cbc:ID', 'FC')]),
          ])
        : null,
      element('cac:PartyLegalEntity', {}, [
        textElement('cbc:RegistrationName', supplier.name),
      ]),
      element('cac:Contact', {}, [
        textElement('cbc:Name', supplier.name),
        optionalTextElement('cbc:ElectronicMail', supplier.email),
      ]),
    ]),
  ]);
}

function customerParty(customer: EInvoiceCustomer): string {
  return element('cac:AccountingCustomerParty', {}, [
    element('cac:Party', {}, [
      customer.email
        ? textElement('cbc:EndpointID', customer.email, { schemeID: 'EM' })
        : null,
      element('cac:PartyName', {}, [textElement('cbc:Name', customer.name)]),
      postalAddress(customer),
      customer.vatId
        ? element('cac:PartyTaxScheme', {}, [
            textElement('cbc:CompanyID', customer.vatId),
            taxScheme(),
          ])
        : null,
      element('cac:PartyLegalEntity', {}, [
        textElement('cbc:RegistrationName', customer.name),
      ]),
    ]),
  ]);
}

function taxCategory(group: EInvoiceTaxGroup, smallBusinessRule: boolean): string {
  const reason = exemptionReason(group.taxCategory, smallBusinessRule);
  return element('cac:TaxCategory', {}, [
    textElement('cbc:ID', vatCategoryCode(group.taxCategory)),
    textElement('cbc:Percent', formatXmlPercent(group.taxRateBasisPoints)),
    reason ? textElement('cbc:TaxExemptionReason', reason) : null,
    taxScheme(),
  ]);
}

function taxTotal(document: EInvoiceDocument): string {
  const groups = mergeTaxGroups(document.taxBreakdown);
  return element('cac:TaxTotal', {}, [
    amount('cbc:TaxAmount', document.taxCents, document.currency),
    ...groups.map((group) =>
      element('cac:TaxSubtotal', {}, [
        amount('cbc:TaxableAmount', group.netCents, document.currency),
        amount('cbc:TaxAmount', group.taxCents, document.currency),
        taxCategory(group, document.smallBusinessRule),
      ]),
    ),
  ]);
}

function invoiceLine(
  line: EInvoiceLine,
  document: EInvoiceDocument,
): string {
  return element('cac:InvoiceLine', {}, [
    textElement('cbc:ID', String(line.position)),
    textElement('cbc:InvoicedQuantity', formatXmlQuantity(line.quantityMilliunits), {
      unitCode: unitCode(line.unit),
    }),
    amount('cbc:LineExtensionAmount', line.netCents, document.currency),
    line.serviceDate
      ? element('cac:InvoicePeriod', {}, [
          textElement('cbc:StartDate', formatXmlDate(line.serviceDate)),
          textElement('cbc:EndDate', formatXmlDate(line.serviceDate)),
        ])
      : null,
    element('cac:Item', {}, [
      textElement('cbc:Name', line.description),
      element('cac:ClassifiedTaxCategory', {}, [
        textElement('cbc:ID', vatCategoryCode(line.taxCategory)),
        textElement('cbc:Percent', formatXmlPercent(line.taxRateBasisPoints)),
        taxScheme(),
      ]),
    ]),
    element('cac:Price', {}, [
      amount('cbc:PriceAmount', line.unitPriceCents, document.currency),
    ]),
  ]);
}

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

export function buildUblXml(document: EInvoiceDocument): string {
  const buyerReference = document.buyerReference?.trim();
  if (!buyerReference) {
    throw new EInvoiceValidationError(
      'XRechnung requires a Leitweg-ID (BT-10) on the customer before the invoice can be issued',
    );
  }

  const root = element('Invoice', NAMESPACES, [
    textElement('cbc:CustomizationID', XRECHNUNG_CUSTOMIZATION_ID),
    textElement('cbc:ProfileID', XRECHNUNG_PROFILE_ID),
    textElement('cbc:ID', document.number),
    textElement('cbc:IssueDate', formatXmlDate(document.invoiceDate)),
    textElement('cbc:DueDate', formatXmlDate(document.dueDate)),
    textElement('cbc:InvoiceTypeCode', INVOICE_TYPE_CODE),
    ...documentNotes(document).map((note) => textElement('cbc:Note', note)),
    textElement('cbc:DocumentCurrencyCode', document.currency),
    textElement('cbc:BuyerReference', buyerReference),
    element('cac:InvoicePeriod', {}, [
      textElement('cbc:StartDate', formatXmlDate(document.servicePeriodStart)),
      textElement('cbc:EndDate', formatXmlDate(document.servicePeriodEnd)),
    ]),
    supplierParty(document.supplier),
    customerParty(document.customer),
    element('cac:PaymentMeans', {}, [
      // UNCL4461 code 58 = SEPA credit transfer.
      textElement('cbc:PaymentMeansCode', '58'),
      textElement('cbc:PaymentDueDate', formatXmlDate(document.dueDate)),
      element('cac:PayeeFinancialAccount', {}, [
        textElement('cbc:ID', document.supplier.iban),
        optionalTextElement('cbc:Name', document.supplier.bankName),
        document.supplier.bic
          ? element('cac:FinancialInstitutionBranch', {}, [
              textElement('cbc:ID', document.supplier.bic),
            ])
          : null,
      ]),
    ]),
    element('cac:PaymentTerms', {}, [
      textElement(
        'cbc:Note',
        `Zahlbar innerhalb von ${document.paymentTermDays} Tagen ohne Abzug.`,
      ),
    ]),
    taxTotal(document),
    element('cac:LegalMonetaryTotal', {}, [
      amount('cbc:LineExtensionAmount', document.netCents, document.currency),
      amount('cbc:TaxExclusiveAmount', document.netCents, document.currency),
      amount('cbc:TaxInclusiveAmount', document.grossCents, document.currency),
      amount('cbc:PayableAmount', document.grossCents, document.currency),
    ]),
    ...document.lines.map((line) => invoiceLine(line, document)),
  ]);

  return xmlDocument(root);
}
