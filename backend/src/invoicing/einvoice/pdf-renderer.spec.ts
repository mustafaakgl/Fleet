import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { buildCiiXml } from './cii-xml';
import { renderInvoicePdf } from './pdf-renderer';
import { sampleDocument, sampleLines } from './test-helpers';
import type { EInvoiceDocument } from './document-model';

const RENDERED_AT = new Date('2026-07-27T10:00:00.000Z');

async function render(document: EInvoiceDocument, withXml = true): Promise<Uint8Array> {
  return renderInvoicePdf({
    document,
    ciiXml: withXml ? buildCiiXml(document) : undefined,
    renderedAt: RENDERED_AT,
  });
}

/**
 * Text extraction for embedded subset fonts: the content stream carries glyph ids, so the
 * font's ToUnicode CMap has to be applied to get characters back. Each font resource has
 * its own subset, hence the per-resource maps and the `Tf` tracking.
 */
type UnicodeMap = Map<number, string>;

function decodeStream(object: PDFRawStream): string | null {
  try {
    return Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
  } catch {
    return null;
  }
}

function parseToUnicode(stream: PDFRawStream): UnicodeMap {
  const map: UnicodeMap = new Map();
  const text = decodeStream(stream) ?? '';
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const codePoints = entry[2].match(/.{4}/g) ?? [];
      map.set(
        parseInt(entry[1], 16),
        String.fromCharCode(...codePoints.map((hex) => parseInt(hex, 16))),
      );
    }
  }
  return map;
}

/** Resource name (e.g. "F1") to the CMap of the font bound to it, per page. */
function fontMapsForPage(page: PDFPage): Map<string, UnicodeMap> {
  const maps = new Map<string, UnicodeMap>();
  const resources = page.node.Resources();
  const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) return maps;

  for (const [key] of fonts.entries()) {
    const font = fonts.lookupMaybe(key, PDFDict);
    const toUnicode = font?.lookup(PDFName.of('ToUnicode'));
    if (toUnicode instanceof PDFRawStream) {
      maps.set(key.asString().replace(/^\//, ''), parseToUnicode(toUnicode));
    }
  }
  return maps;
}

function pageContent(page: PDFPage): string {
  const contents = page.node.Contents();
  if (contents instanceof PDFRawStream) return decodeStream(contents) ?? '';
  if (contents instanceof PDFArray) {
    let combined = '';
    for (let index = 0; index < contents.size(); index += 1) {
      const part = contents.lookup(index);
      if (part instanceof PDFRawStream) combined += decodeStream(part) ?? '';
    }
    return combined;
  }
  return '';
}

/** The text a human actually sees on the page. */
function visibleText(pdf: PDFDocument): string {
  const parts: string[] = [];
  for (const page of pdf.getPages()) {
    const maps = fontMapsForPage(page);
    let active: UnicodeMap | undefined;
    const content = pageContent(page);

    for (const token of content.matchAll(/\/([^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g)) {
      if (token[1] !== undefined) {
        active = maps.get(token[1]);
        continue;
      }
      const hex = token[2];
      const codes = hex.match(/.{4}/g) ?? [];
      parts.push(
        codes
          .map((code) => active?.get(parseInt(code, 16)) ?? '')
          .join(''),
      );
    }
  }
  return parts.join('\n');
}

type Attachment = { fileName: string; relationship: string; contents: string };

function attachments(pdf: PDFDocument): Attachment[] {
  const names = pdf.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const embeddedFiles = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const entries = embeddedFiles?.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (!entries) return [];

  const result: Attachment[] = [];
  for (let index = 0; index < entries.size(); index += 2) {
    const nameObject = entries.lookup(index);
    const spec = entries.lookup(index + 1, PDFDict);
    const embedded = spec.lookup(PDFName.of('EF'), PDFDict);
    const stream = embedded.lookup(PDFName.of('F'));
    assert.ok(stream instanceof PDFRawStream, 'embedded file must be a stream');
    result.push({
      fileName: nameObject instanceof PDFHexString ? nameObject.decodeText() : String(nameObject),
      relationship: String(spec.get(PDFName.of('AFRelationship'))),
      contents: Buffer.from(decodePDFRawStream(stream).decode()).toString('utf8'),
    });
  }
  return result;
}

function xmpMetadata(pdf: PDFDocument): string {
  const stream = pdf.catalog.lookup(PDFName.of('Metadata'));
  assert.ok(stream instanceof PDFRawStream, 'metadata must be an uncompressed stream');
  return Buffer.from(stream.getContents()).toString('utf8');
}

describe('invoice PDF rendering', () => {
  it('produces a loadable PDF', async () => {
    const bytes = await render(sampleDocument());

    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getTitle(), 'Rechnung RE-2026-00001');
  });

  it('is deterministic — the same invoice always renders the same bytes', async () => {
    const first = await render(sampleDocument());
    const second = await render(sampleDocument());
    assert.deepEqual(Buffer.from(first), Buffer.from(second));
  });

  it('embeds the CII XML as a Factur-X attachment', async () => {
    const document = sampleDocument();
    const pdf = await PDFDocument.load(await render(document));
    const embedded = attachments(pdf);

    assert.equal(embedded.length, 1);
    assert.equal(embedded[0].fileName, 'factur-x.xml');
    // AFRelationship "Alternative" is what marks the XML as an equivalent rendition.
    assert.equal(embedded[0].relationship, '/Alternative');
    assert.equal(embedded[0].contents, buildCiiXml(document));
    assert.ok(embedded[0].contents.includes('<rsm:CrossIndustryInvoice'));

    // PDF/A-3 also requires the file to be referenced from the catalog's /AF array.
    const associated = pdf.catalog.lookup(PDFName.of('AF'), PDFArray);
    assert.equal(associated.size(), 1);
  });

  it('omits the attachment when no CII XML is generated', async () => {
    const pdf = await PDFDocument.load(await render(sampleDocument(), false));

    assert.deepEqual(attachments(pdf), []);
    assert.ok(!xmpMetadata(pdf).includes('fx:DocumentType'));
  });

  it('declares PDF/A-3 and the Factur-X profile in its XMP metadata', async () => {
    const xmp = xmpMetadata(await PDFDocument.load(await render(sampleDocument())));

    assert.ok(xmp.includes('<pdfaid:part>3</pdfaid:part>'));
    assert.ok(xmp.includes('<pdfaid:conformance>B</pdfaid:conformance>'));
    assert.ok(xmp.includes('<fx:DocumentType>INVOICE</fx:DocumentType>'));
    assert.ok(xmp.includes('<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>'));
    assert.ok(xmp.includes('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>'));
  });

  it('shows every field § 14 UStG requires', async () => {
    const text = visibleText(await PDFDocument.load(await render(sampleDocument())));

    // Supplier name and full address
    assert.ok(text.includes('Fleet Transporte GmbH'));
    assert.ok(text.includes('Musterstr. 1'));
    assert.ok(text.includes('10115 Berlin'));
    // Customer name and full address
    assert.ok(text.includes('Acme Logistik GmbH'));
    assert.ok(text.includes('Hafenstr. 12'));
    assert.ok(text.includes('20457 Hamburg'));
    // Supplier tax number and VAT identifier
    assert.ok(text.includes('Steuernummer: 30/123/45678'));
    assert.ok(text.includes('USt-IdNr.: DE123456789'));
    // Invoice number and issue date
    assert.ok(text.includes('RE-2026-00001'));
    assert.ok(text.includes('Rechnungsnummer:'));
    assert.ok(text.includes('Rechnungsdatum:'));
    // Service period
    assert.ok(text.includes('Leistungszeitraum: 01.07.2026 – 26.07.2026'));
    // Quantity and description of each service
    assert.ok(text.includes('Transport Berlin – Hamburg'));
    assert.ok(text.includes('Lebensmitteltransport (ermäßigt)'));
    assert.ok(text.includes('Tour'));
    assert.ok(text.includes('Tag'));
    // Net amount and tax per rate
    assert.ok(text.includes('zzgl. 19 % USt. auf 1.000,00'));
    assert.ok(text.includes('zzgl. 7 % USt. auf 500,00'));
    assert.ok(text.includes('190,00 €'));
    assert.ok(text.includes('35,00 €'));
    // Gross total
    assert.ok(text.includes('Gesamtbetrag'));
    assert.ok(text.includes('1.725,00 €'));
  });

  it('uses German number and date formatting throughout', async () => {
    const text = visibleText(await PDFDocument.load(await render(sampleDocument())));

    assert.ok(text.includes('27.07.2026'));
    assert.ok(text.includes('10.08.2026'));
    assert.ok(text.includes('1.500,00 €'));
    assert.ok(text.includes('1.725,00 €'));
    // The Anglo-Saxon forms must not leak through anywhere.
    assert.ok(!text.includes('2026-07-27'));
    assert.ok(!text.includes('1,725.00'));
    assert.ok(!text.includes('1500.00'));
  });

  it('prints the § 13b reverse charge statement', async () => {
    const lines = sampleLines().slice(0, 1);
    lines[0] = { ...lines[0], taxCategory: 'reverse_charge', taxRateBasisPoints: 0 };
    const text = visibleText(
      await PDFDocument.load(
        await render(
          sampleDocument({
            lines,
            taxBreakdown: [
              { taxCategory: 'reverse_charge', taxRateBasisPoints: 0, netCents: 100_000, taxCents: 0, grossCents: 100_000 },
            ],
            netCents: 100_000,
            taxCents: 0,
            grossCents: 100_000,
          }),
        ),
      ),
    );

    assert.ok(text.includes('Steuerschuldnerschaft des Leistungsempfängers'));
    assert.ok(text.includes('Umsatzsteuer (Reverse Charge, 0 %)'));
  });

  it('prints the § 19 UStG small business note', async () => {
    const lines = sampleLines().map((line) => ({
      ...line,
      taxCategory: 'exempt' as const,
      taxRateBasisPoints: 0,
    }));
    const text = visibleText(
      await PDFDocument.load(
        await render(
          sampleDocument({
            lines,
            smallBusinessRule: true,
            taxBreakdown: [
              { taxCategory: 'exempt', taxRateBasisPoints: 0, netCents: 150_000, taxCents: 0, grossCents: 150_000 },
            ],
            taxCents: 0,
            grossCents: 150_000,
          }),
        ),
      ),
    );

    assert.ok(text.includes('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet'));
    assert.ok(text.includes('Umsatzsteuerfrei (0 %)'));
    assert.ok(text.includes('1.500,00 €'));
  });

  it('breaks long invoices across pages and repeats the table header', async () => {
    const template = sampleLines()[0];
    const lines = Array.from({ length: 60 }, (_, index) => ({
      ...template,
      position: index + 1,
      description: `Transport Berlin – Hamburg, Fahrt ${index + 1}`,
    }));
    const pdf = await PDFDocument.load(
      await render(
        sampleDocument({
          lines,
          netCents: 6_000_000,
          taxCents: 1_140_000,
          grossCents: 7_140_000,
          taxBreakdown: [
            { taxCategory: 'standard', taxRateBasisPoints: 1_900, netCents: 6_000_000, taxCents: 1_140_000, grossCents: 7_140_000 },
          ],
        }),
      ),
    );

    assert.ok(pdf.getPageCount() > 1);
    const text = visibleText(pdf);
    assert.ok(text.includes('Transport Berlin – Hamburg, Fahrt 1'));
    assert.ok(text.includes('Transport Berlin – Hamburg, Fahrt 60'));
    // The column header must reappear on every continuation page.
    const headerCount = text.split('Betrag netto').length - 1;
    assert.equal(headerCount, pdf.getPageCount());
    assert.ok(text.includes('71.400,00 €'));
  });

  it('renders Turkish characters properly now that the font is embedded', async () => {
    const text = visibleText(
      await PDFDocument.load(
        await render(
          sampleDocument({
            customer: {
              name: 'Aşkın Nakliyat Ltd. Şti.',
              street: 'Bağdat Cad. 1',
              postalCode: '34000',
              city: 'İstanbul',
              countryCode: 'TR',
              vatId: null,
              email: null,
            },
          }),
        ),
      ),
    );

    // Liberation Sans covers Latin Extended, so these are no longer degraded to "?".
    assert.ok(text.includes('Aşkın Nakliyat Ltd. Şti.'));
    assert.ok(text.includes('İstanbul'));
    assert.ok(text.includes('Bağdat Cad. 1'));
  });

  it('substitutes glyphs the font does not have instead of failing', async () => {
    const text = visibleText(
      await PDFDocument.load(
        await render(
          sampleDocument({
            customer: {
              name: '株式会社テスト',
              street: 'Teststr. 1',
              postalCode: '10115',
              city: 'Berlin',
              countryCode: 'DE',
              vatId: null,
              email: null,
            },
          }),
        ),
      ),
    );

    assert.ok(text.includes('???????'));
    assert.ok(text.includes('Teststr. 1'));
  });

  it('embeds the font programs PDF/A-3b requires', async () => {
    const pdf = await PDFDocument.load(await render(sampleDocument()));
    let embeddedFontFiles = 0;

    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue;
      if (object.get(PDFName.of('Type'))?.toString() !== '/FontDescriptor') continue;
      // A subset TrueType program lives in FontFile2.
      if (object.get(PDFName.of('FontFile2'))) embeddedFontFiles += 1;
    }

    // One descriptor for the regular face, one for the bold face.
    assert.equal(embeddedFontFiles, 2);
  });

  it('declares an sRGB output intent so device colours are unambiguous', async () => {
    const pdf = await PDFDocument.load(await render(sampleDocument()));
    const intents = pdf.catalog.lookup(PDFName.of('OutputIntents'), PDFArray);

    assert.equal(intents.size(), 1);
    const intent = intents.lookup(0, PDFDict);
    assert.equal(intent.get(PDFName.of('S'))?.toString(), '/GTS_PDFA1');

    const profile = intent.lookup(PDFName.of('DestOutputProfile'));
    assert.ok(profile instanceof PDFRawStream, 'the ICC profile must be embedded');
    assert.equal(profile.dict.get(PDFName.of('N'))?.toString(), '3');
  });

  it('writes the trailer file identifier ISO 19005-3 requires', async () => {
    const bytes = await render(sampleDocument());
    const pdf = await PDFDocument.load(bytes);
    const id = pdf.context.trailerInfo.ID;

    assert.ok(id instanceof PDFArray);
    assert.equal(id.size(), 2);
    // Both halves are equal for a first-generation file, and stable across renders.
    assert.equal(id.lookup(0)?.toString(), id.lookup(1)?.toString());

    const again = await PDFDocument.load(await render(sampleDocument()));
    assert.equal(
      (again.context.trailerInfo.ID as PDFArray).lookup(0)?.toString(),
      id.lookup(0)?.toString(),
    );
  });

  it('declares the Factur-X XMP extension schema PDF/A demands for custom namespaces', async () => {
    const xmp = xmpMetadata(await PDFDocument.load(await render(sampleDocument())));

    assert.ok(xmp.includes('pdfaExtension:schemas'));
    assert.ok(xmp.includes('<pdfaSchema:prefix>fx</pdfaSchema:prefix>'));
    assert.ok(
      xmp.includes(
        '<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>',
      ),
    );
    for (const property of ['DocumentFileName', 'DocumentType', 'Version', 'ConformanceLevel']) {
      assert.ok(
        xmp.includes(`<pdfaProperty:name>${property}</pdfaProperty:name>`),
        `${property} must be declared in the extension schema`,
      );
    }
  });
});
