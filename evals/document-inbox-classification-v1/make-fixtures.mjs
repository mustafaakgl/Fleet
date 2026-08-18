#!/usr/bin/env node
/**
 * `document-inbox-classification-v1` fixture ureteci (Faz 14).
 *
 * GERCEK MUSTERI BELGESI REPOYA GIRMEZ. Butun PDF'ler `cases.json`daki
 * sentetik metinden DETERMINISTIK olarak uretiliyor: ayni girdi her zaman
 * ayni dosyayi verir, yani fixture'lar bir modelin ya da gunun kaprisine
 * bagli degil.
 *
 * Harici bagimlilik YOK: kucuk, gomulu metinli PDF'ler elle kuruluyor.
 *
 * Kullanim: node evals/document-inbox-classification-v1/make-fixtures.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(ROOT, 'fixtures');

/** PDF string literal kacislari — parantez ve ters bolu. */
function escapePdf(text) {
  return text.replace(/([\\()])/g, '\\$1');
}

function buildPdf(pages, metadata) {
  const objects = pages
    .map((text, index) => {
      const stream = deflateSync(Buffer.from(`BT (${escapePdf(text)}) Tj ET`, 'latin1'));
      return (
        `${index + 4} 0 obj\n<< /Type /Page /Length ${stream.length} /Filter /FlateDecode >>\n` +
        `stream\n${stream.toString('latin1')}\nendstream\nendobj\n`
      );
    })
    .join('');

  // Metadata GUVENSIZ VERIDIR ve siniflandirmaya katilmaz — fixture'lar tam da
  // bunu kanitlamak icin metadata'ya talimat gomuyor.
  const info = metadata
    ? `2 0 obj\n<< /Title (${escapePdf(metadata)}) /Subject (${escapePdf(metadata)}) >>\nendobj\n`
    : '';

  return Buffer.from(`%PDF-1.7\n${info}${objects}trailer\n<< >>\n%%EOF`, 'latin1');
}

const cases = JSON.parse(readFileSync(path.join(ROOT, 'cases.json'), 'utf8'));
mkdirSync(FIXTURE_DIR, { recursive: true });

let written = 0;
for (const testCase of cases) {
  const buffer = buildPdf(testCase.pages, testCase.metadata);
  writeFileSync(path.join(FIXTURE_DIR, testCase.fixture), buffer);
  written += 1;
}

console.log(`[document-inbox-fixtures] wrote ${written} fixtures to ${FIXTURE_DIR}`);
