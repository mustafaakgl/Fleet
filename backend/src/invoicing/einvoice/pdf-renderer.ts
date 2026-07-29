/**
 * Human-readable invoice PDF with the CII XML embedded as a Factur-X / ZUGFeRD attachment.
 *
 * The layout carries every field § 14 UStG makes mandatory:
 *  - full name and address of supplier and customer (BT-27/28, BT-44/45)
 *  - the supplier's Steuernummer or USt-IdNr (BT-31/32)
 *  - invoice number and issue date (BT-1, BT-2)
 *  - quantity and description of the service (BT-129, BT-153)
 *  - the service period (BT-73/74)
 *  - net amount, rate and tax amount per VAT rate (BG-23)
 *  - the gross total (BT-112)
 * plus the § 13b reverse-charge statement and the § 19 small business note when they apply.
 *
 * PDF/A-3b: the file embeds its font programs (Liberation Sans, SIL OFL 1.1), carries an
 * sRGB OutputIntent (CC0-1.0 profile), declares the PDF/A identification and the Factur-X
 * extension schema in XMP, writes a trailer /ID, and attaches the CII XML with
 * AFRelationship=Alternative. See pdf-assets.ts for the asset provenance and licences.
 */
import { createHash } from 'node:crypto';
import fontkit from '@pdf-lib/fontkit';
import {
  AFRelationship,
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFPage,
  rgb,
} from 'pdf-lib';
import {
  loadBoldFont,
  loadRegularFont,
  loadSrgbProfile,
  SRGB_OUTPUT_CONDITION,
} from './pdf-assets';
import {
  mergeTaxGroups,
  unitLabelDe,
  type EInvoiceDocument,
  type EInvoiceTaxGroup,
} from './document-model';
import { CII_ATTACHMENT_FILE_NAME } from './cii-xml';
import {
  formatGermanAmount,
  formatGermanCurrency,
  formatGermanDate,
  formatGermanPercent,
  formatGermanQuantity,
} from './format';
import { escapeXml } from './xml';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 56;
const MARGIN_RIGHT = PAGE_WIDTH - 56;
const BOTTOM_LIMIT = 96;

const COLUMN_POSITION = MARGIN_LEFT;
const COLUMN_DESCRIPTION = MARGIN_LEFT + 28;
const COLUMN_QUANTITY_RIGHT = MARGIN_LEFT + 300;
const COLUMN_UNIT = MARGIN_LEFT + 308;
const COLUMN_UNIT_PRICE_RIGHT = MARGIN_LEFT + 400;
const COLUMN_TAX_RIGHT = MARGIN_LEFT + 440;
const COLUMN_AMOUNT_RIGHT = MARGIN_RIGHT;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.78, 0.8, 0.84);

export type InvoicePdfInput = {
  document: EInvoiceDocument;
  /** CII XML to embed. Omit for XRechnung-only invoices, where the UBL file is the original. */
  ciiXml?: string;
  /** Passed in rather than read from the clock so the same invoice always renders the same. */
  renderedAt: Date;
};

type Cursor = { page: PDFPage; y: number };

type Fonts = { regular: PDFFont; bold: PDFFont; encodable: Set<number> };

/**
 * The embedded font covers Latin including German and Turkish, but not every script a
 * company name might use. Anything the font has no glyph for is replaced rather than
 * allowed to abort the render — an invoice must always be producible.
 */
let activeFonts: Fonts | null = null;

function safe(value: string): string {
  const encodable = activeFonts?.encodable;
  if (!encodable) return value;
  let result = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    result += codePoint !== undefined && encodable.has(codePoint) ? char : '?';
  }
  return result;
}

function drawLeft(
  cursor: Cursor,
  text: string,
  x: number,
  size: number,
  font: PDFFont,
  color = INK,
): void {
  cursor.page.drawText(safe(text), { x, y: cursor.y, size, font, color });
}

function drawRight(
  cursor: Cursor,
  text: string,
  right: number,
  size: number,
  font: PDFFont,
  color = INK,
): void {
  const content = safe(text);
  const width = font.widthOfTextAtSize(content, size);
  cursor.page.drawText(content, { x: right - width, y: cursor.y, size, font, color });
}

function drawRule(cursor: Cursor, color = RULE): void {
  cursor.page.drawLine({
    start: { x: MARGIN_LEFT, y: cursor.y },
    end: { x: MARGIN_RIGHT, y: cursor.y },
    thickness: 0.6,
    color,
  });
}

/** Greedy wrap against the real glyph widths so long descriptions never overflow a column. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  lines.push(current);
  return lines;
}

function addressLines(party: {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
}): string[] {
  const cityLine = [party.postalCode, party.city].filter(Boolean).join(' ');
  return [party.name, party.street ?? '', cityLine, party.countryCode === 'DE' ? '' : party.countryCode]
    .map((line) => line.trim())
    .filter(Boolean);
}

function newPage(pdf: PDFDocument): Cursor {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { page, y: PAGE_HEIGHT - 64 };
}

function ensureSpace(pdf: PDFDocument, cursor: Cursor, needed: number, fonts: Fonts): void {
  if (cursor.y - needed >= BOTTOM_LIMIT) return;
  const next = newPage(pdf);
  cursor.page = next.page;
  cursor.y = next.y;
  drawTableHeader(cursor, fonts);
}

function drawTableHeader(cursor: Cursor, fonts: Fonts): void {
  drawLeft(cursor, 'Pos.', COLUMN_POSITION, 8.5, fonts.bold, MUTED);
  drawLeft(cursor, 'Bezeichnung', COLUMN_DESCRIPTION, 8.5, fonts.bold, MUTED);
  drawRight(cursor, 'Menge', COLUMN_QUANTITY_RIGHT, 8.5, fonts.bold, MUTED);
  drawLeft(cursor, 'Einheit', COLUMN_UNIT, 8.5, fonts.bold, MUTED);
  drawRight(cursor, 'Einzelpreis', COLUMN_UNIT_PRICE_RIGHT, 8.5, fonts.bold, MUTED);
  drawRight(cursor, 'USt.', COLUMN_TAX_RIGHT, 8.5, fonts.bold, MUTED);
  drawRight(cursor, 'Betrag netto', COLUMN_AMOUNT_RIGHT, 8.5, fonts.bold, MUTED);
  cursor.y -= 6;
  drawRule(cursor);
  cursor.y -= 14;
}

function drawHeader(cursor: Cursor, fonts: Fonts, document: EInvoiceDocument): void {
  const { supplier } = document;
  drawLeft(cursor, supplier.name, MARGIN_LEFT, 15, fonts.bold);
  drawRight(cursor, 'Rechnung', MARGIN_RIGHT, 20, fonts.bold);
  cursor.y -= 16;

  const supplierBlock = addressLines(supplier).slice(1);
  const rightMeta: Array<[string, string]> = [
    ['Rechnungsnummer', document.number],
    ['Rechnungsdatum', formatGermanDate(document.invoiceDate)],
    ['Fällig am', formatGermanDate(document.dueDate)],
  ];

  const blockTop = cursor.y;
  supplierBlock.forEach((line, index) => {
    cursor.y = blockTop - index * 11;
    drawLeft(cursor, line, MARGIN_LEFT, 9, fonts.regular, MUTED);
  });

  rightMeta.forEach(([label, value], index) => {
    cursor.y = blockTop - index * 13;
    drawRight(cursor, `${label}:`, MARGIN_RIGHT - 118, 9, fonts.regular, MUTED);
    drawRight(cursor, value, MARGIN_RIGHT, 9, fonts.bold);
  });

  cursor.y = blockTop - Math.max(supplierBlock.length * 11, rightMeta.length * 13) - 26;
}

function drawParties(cursor: Cursor, fonts: Fonts, document: EInvoiceDocument): void {
  drawLeft(cursor, 'Rechnungsempfänger', MARGIN_LEFT, 8.5, fonts.bold, MUTED);
  drawRight(cursor, 'Leistungserbringer', MARGIN_RIGHT, 8.5, fonts.bold, MUTED);
  cursor.y -= 14;

  const customerLines = addressLines(document.customer);
  const supplierTaxLines = [
    document.supplier.vatId ? `USt-IdNr.: ${document.supplier.vatId}` : '',
    document.supplier.taxNumber ? `Steuernummer: ${document.supplier.taxNumber}` : '',
  ].filter(Boolean);

  const top = cursor.y;
  customerLines.forEach((line, index) => {
    cursor.y = top - index * 12;
    drawLeft(cursor, line, MARGIN_LEFT, 10, index === 0 ? fonts.bold : fonts.regular);
  });
  supplierTaxLines.forEach((line, index) => {
    cursor.y = top - index * 12;
    drawRight(cursor, line, MARGIN_RIGHT, 9, fonts.regular);
  });

  cursor.y = top - Math.max(customerLines.length, supplierTaxLines.length) * 12 - 8;
  if (document.customer.vatId) {
    drawLeft(cursor, `USt-IdNr.: ${document.customer.vatId}`, MARGIN_LEFT, 9, fonts.regular, MUTED);
    cursor.y -= 12;
  }
  if (document.buyerReference) {
    drawLeft(cursor, `Leitweg-ID: ${document.buyerReference}`, MARGIN_LEFT, 9, fonts.regular, MUTED);
    cursor.y -= 12;
  }

  cursor.y -= 10;
  const period = `Leistungszeitraum: ${formatGermanDate(document.servicePeriodStart)} – ${formatGermanDate(document.servicePeriodEnd)}`;
  drawLeft(cursor, period, MARGIN_LEFT, 10, fonts.bold);
  cursor.y -= 24;
}

function drawLines(pdf: PDFDocument, cursor: Cursor, fonts: Fonts, document: EInvoiceDocument): void {
  drawTableHeader(cursor, fonts);

  for (const line of document.lines) {
    const descriptionWidth = COLUMN_QUANTITY_RIGHT - COLUMN_DESCRIPTION - 60;
    const wrapped = wrapText(line.description, fonts.regular, 9.5, descriptionWidth);
    const serviceDate = line.serviceDate
      ? `Leistungsdatum: ${formatGermanDate(line.serviceDate)}`
      : null;
    const height = wrapped.length * 12 + (serviceDate ? 11 : 0) + 8;
    ensureSpace(pdf, cursor, height, fonts);

    const rowTop = cursor.y;
    drawLeft(cursor, String(line.position), COLUMN_POSITION, 9.5, fonts.regular);
    drawRight(cursor, formatGermanQuantity(line.quantityMilliunits), COLUMN_QUANTITY_RIGHT, 9.5, fonts.regular);
    drawLeft(cursor, unitLabelDe(line.unit), COLUMN_UNIT, 9.5, fonts.regular);
    drawRight(cursor, formatGermanAmount(line.unitPriceCents), COLUMN_UNIT_PRICE_RIGHT, 9.5, fonts.regular);
    drawRight(cursor, `${formatGermanPercent(line.taxRateBasisPoints)} %`, COLUMN_TAX_RIGHT, 9.5, fonts.regular);
    drawRight(cursor, formatGermanAmount(line.netCents), COLUMN_AMOUNT_RIGHT, 9.5, fonts.regular);

    wrapped.forEach((text, index) => {
      cursor.y = rowTop - index * 12;
      drawLeft(cursor, text, COLUMN_DESCRIPTION, 9.5, fonts.regular);
    });
    cursor.y = rowTop - wrapped.length * 12;
    if (serviceDate) {
      drawLeft(cursor, serviceDate, COLUMN_DESCRIPTION, 8, fonts.regular, MUTED);
      cursor.y -= 11;
    }
    cursor.y -= 8;
  }

  cursor.y += 2;
  drawRule(cursor);
  cursor.y -= 18;
}

function taxRowLabel(group: EInvoiceTaxGroup): string {
  if (group.taxCategory === 'reverse_charge') {
    return 'Umsatzsteuer (Reverse Charge, 0 %)';
  }
  if (group.taxCategory === 'exempt') {
    return 'Umsatzsteuerfrei (0 %)';
  }
  return `zzgl. ${formatGermanPercent(group.taxRateBasisPoints)} % USt. auf ${formatGermanAmount(group.netCents)}`;
}

function drawTotals(
  pdf: PDFDocument,
  cursor: Cursor,
  fonts: Fonts,
  document: EInvoiceDocument,
): void {
  const groups = mergeTaxGroups(document.taxBreakdown);
  ensureSpace(pdf, cursor, 40 + groups.length * 14, fonts);

  drawRight(cursor, 'Nettobetrag', COLUMN_TAX_RIGHT, 10, fonts.regular);
  drawRight(cursor, formatGermanCurrency(document.netCents, document.currency), COLUMN_AMOUNT_RIGHT, 10, fonts.regular);
  cursor.y -= 14;

  for (const group of groups) {
    drawRight(cursor, taxRowLabel(group), COLUMN_TAX_RIGHT, 10, fonts.regular);
    drawRight(cursor, formatGermanCurrency(group.taxCents, document.currency), COLUMN_AMOUNT_RIGHT, 10, fonts.regular);
    cursor.y -= 14;
  }

  cursor.y -= 2;
  cursor.page.drawLine({
    start: { x: COLUMN_TAX_RIGHT - 160, y: cursor.y },
    end: { x: MARGIN_RIGHT, y: cursor.y },
    thickness: 0.8,
    color: RULE,
  });
  cursor.y -= 16;
  drawRight(cursor, 'Gesamtbetrag', COLUMN_TAX_RIGHT, 11.5, fonts.bold);
  drawRight(cursor, formatGermanCurrency(document.grossCents, document.currency), COLUMN_AMOUNT_RIGHT, 11.5, fonts.bold);
  cursor.y -= 26;
}

function drawNotes(pdf: PDFDocument, cursor: Cursor, fonts: Fonts, document: EInvoiceDocument): void {
  const notes: string[] = [];
  if (document.taxBreakdown.some((group) => group.taxCategory === 'reverse_charge')) {
    notes.push('Steuerschuldnerschaft des Leistungsempfängers');
  }
  if (document.smallBusinessRule) {
    notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).');
  }
  notes.push(
    `Zahlbar innerhalb von ${document.paymentTermDays} Tagen ohne Abzug bis zum ${formatGermanDate(document.dueDate)}.`,
  );
  const bank = [
    document.supplier.bankName ? `Bank: ${document.supplier.bankName}` : '',
    `IBAN: ${document.supplier.iban}`,
    document.supplier.bic ? `BIC: ${document.supplier.bic}` : '',
  ].filter(Boolean);
  notes.push(bank.join('   '));
  notes.push(`Verwendungszweck: ${document.number}`);

  const free = document.notes?.trim();
  if (free) notes.push(free);
  const footer = document.supplier.footerText?.trim();
  if (footer) notes.push(footer);

  for (const note of notes) {
    for (const paragraph of note.split('\n')) {
      const wrapped = wrapText(paragraph, fonts.regular, 9, MARGIN_RIGHT - MARGIN_LEFT);
      ensureSpace(pdf, cursor, wrapped.length * 11 + 6, fonts);
      for (const text of wrapped) {
        drawLeft(cursor, text, MARGIN_LEFT, 9, fonts.regular, MUTED);
        cursor.y -= 11;
      }
    }
    cursor.y -= 5;
  }
}

/**
 * PDF/A-3 identification plus the Factur-X extension schema. Readers use the fx: block to
 * discover that the attachment is a structured invoice and which profile it follows.
 */
/**
 * PDF/A only permits XMP properties from schemas it knows, so any custom namespace has to
 * ship its own description in the pdfaExtension schema container. Without this block
 * veraPDF rejects the file on clause 6.6.2.3.1 even though the fx: values are correct.
 */
const FACTUR_X_EXTENSION_SCHEMA = `
      <rdf:Description rdf:about=""
          xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
          xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
          xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
        <pdfaExtension:schemas>
          <rdf:Bag>
            <rdf:li rdf:parseType="Resource">
              <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
              <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
              <pdfaSchema:prefix>fx</pdfaSchema:prefix>
              <pdfaSchema:property>
                <rdf:Seq>
                  <rdf:li rdf:parseType="Resource">
                    <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                    <pdfaProperty:category>external</pdfaProperty:category>
                    <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                  </rdf:li>
                  <rdf:li rdf:parseType="Resource">
                    <pdfaProperty:name>DocumentType</pdfaProperty:name>
                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                    <pdfaProperty:category>external</pdfaProperty:category>
                    <pdfaProperty:description>INVOICE</pdfaProperty:description>
                  </rdf:li>
                  <rdf:li rdf:parseType="Resource">
                    <pdfaProperty:name>Version</pdfaProperty:name>
                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                    <pdfaProperty:category>external</pdfaProperty:category>
                    <pdfaProperty:description>version of the Factur-X standard</pdfaProperty:description>
                  </rdf:li>
                  <rdf:li rdf:parseType="Resource">
                    <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                    <pdfaProperty:category>external</pdfaProperty:category>
                    <pdfaProperty:description>conformance level of the embedded invoice data</pdfaProperty:description>
                  </rdf:li>
                </rdf:Seq>
              </pdfaSchema:property>
            </rdf:li>
          </rdf:Bag>
        </pdfaExtension:schemas>
      </rdf:Description>`;

function buildXmpMetadata(
  document: EInvoiceDocument,
  hasCiiAttachment: boolean,
  renderedAt: Date,
): string {
  const title = `Rechnung ${document.number}`;
  const timestamp = renderedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const facturX = hasCiiAttachment
    ? `${FACTUR_X_EXTENSION_SCHEMA}
      <rdf:Description rdf:about=""
          xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
        <fx:DocumentType>INVOICE</fx:DocumentType>
        <fx:DocumentFileName>${CII_ATTACHMENT_FILE_NAME}</fx:DocumentFileName>
        <fx:Version>1.0</fx:Version>
        <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
      </rdf:Description>`
    : '';

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${escapeXml(document.supplier.name)}</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${escapeXml(`Rechnung ${document.number} an ${document.customer.name}`)}</rdf:li>
        </rdf:Alt>
      </dc:description>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>Fleet Invoicing</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>Fleet Invoicing</xmp:CreatorTool>
      <xmp:CreateDate>${timestamp}</xmp:CreateDate>
      <xmp:ModifyDate>${timestamp}</xmp:ModifyDate>
    </rdf:Description>${facturX}
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * PDF/A-3b forbids unqualified device colour spaces unless the file declares what device
 * they refer to. The sRGB profile is embedded so the colours stay reproducible offline.
 */
function addSrgbOutputIntent(pdf: PDFDocument): void {
  const profile = loadSrgbProfile();
  const profileStream = pdf.context.flateStream(profile, { N: 3 });
  const profileRef = pdf.context.register(profileStream);

  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFHexString.fromText(SRGB_OUTPUT_CONDITION),
    Info: PDFHexString.fromText(SRGB_OUTPUT_CONDITION),
    DestOutputProfile: profileRef,
  });

  pdf.catalog.set(
    PDFName.of('OutputIntents'),
    pdf.context.obj([pdf.context.register(outputIntent)]),
  );
}

/**
 * ISO 19005-3 requires a file identifier in the trailer. pdf-lib does not write one, so
 * derive it from the invoice number and render timestamp — stable for a given invoice,
 * which keeps the output byte-identical across re-runs.
 */
function addFileIdentifier(pdf: PDFDocument, document: EInvoiceDocument, renderedAt: Date): void {
  const seed = createHash('sha256')
    .update(`${document.number}|${renderedAt.toISOString()}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
  const identifier = PDFHexString.of(seed);
  pdf.context.trailerInfo.ID = pdf.context.obj([identifier, identifier]) as PDFArray;
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { document, ciiXml, renderedAt } = input;
  const pdf = await PDFDocument.create();
  // PDF/A-3b needs the font programs inside the file; the standard-14 fonts cannot do that.
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(loadRegularFont(), { subset: true });
  const bold = await pdf.embedFont(loadBoldFont(), { subset: true });
  const fonts: Fonts = {
    regular,
    bold,
    encodable: new Set(regular.getCharacterSet()),
  };
  activeFonts = fonts;

  pdf.setTitle(safe(`Rechnung ${document.number}`));
  pdf.setAuthor(safe(document.supplier.name));
  pdf.setSubject(safe(`Rechnung ${document.number} an ${document.customer.name}`));
  pdf.setProducer('Fleet Invoicing');
  pdf.setCreator('Fleet Invoicing');
  pdf.setCreationDate(renderedAt);
  pdf.setModificationDate(renderedAt);

  const cursor = newPage(pdf);
  drawHeader(cursor, fonts, document);
  drawParties(cursor, fonts, document);
  drawLines(pdf, cursor, fonts, document);
  drawTotals(pdf, cursor, fonts, document);
  drawNotes(pdf, cursor, fonts, document);

  if (ciiXml) {
    await pdf.attach(Buffer.from(ciiXml, 'utf8'), CII_ATTACHMENT_FILE_NAME, {
      mimeType: 'application/xml',
      description: 'Factur-X / ZUGFeRD EN 16931 invoice data',
      creationDate: renderedAt,
      modificationDate: renderedAt,
      afRelationship: AFRelationship.Alternative,
    });
  }

  const xmp = buildXmpMetadata(document, Boolean(ciiXml), renderedAt);
  const metadataStream = pdf.context.stream(xmp, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(metadataStream));

  addSrgbOutputIntent(pdf);
  addFileIdentifier(pdf, document, renderedAt);

  try {
    return await pdf.save();
  } finally {
    activeFonts = null;
  }
}
