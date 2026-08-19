#!/usr/bin/env node
/**
 * `transport-order-agent-v1` fixture ureteci (Faz 16).
 *
 * GERCEK MUSTERI E-POSTASI REPOYA GIRMEZ. Butun `.eml` dosyalari
 * `cases.json`daki sentetik metinden DETERMINISTIK olarak uretiliyor: ayni
 * girdi her zaman ayni dosyayi verir, yani fixture'lar bir modelin ya da
 * gunun kaprisine bagli degil.
 *
 * Harici bagimlilik YOK: MIME zarflari ve PDF ekleri elle kuruluyor —
 * ayristirici de elde yazildigi icin (bkz. core/order-intake-eml.ts) her iki
 * uc da ayni, dar sozlesmeye bakiyor.
 *
 * Kullanim: node evals/transport-order-agent-v1/make-fixtures.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(ROOT, 'fixtures');
const CRLF = '\r\n';
const BOUNDARY = 'FLEET-EVAL-SINIR';

/** PDF string literal kacislari — parantez ve ters bolu. */
function escapePdf(text) {
  return text.replace(/([\\()])/g, '\\$1');
}

/** Tek sayfalik, gomulu metinli kucuk bir PDF. */
function buildPdf(text) {
  const stream = deflateSync(Buffer.from(`BT (${escapePdf(text)}) Tj ET`, 'latin1'));
  const page =
    `4 0 obj\n<< /Type /Page /Length ${stream.length} /Filter /FlateDecode >>\n` +
    `stream\n${stream.toString('latin1')}\nendstream\nendobj\n`;
  return Buffer.from(`%PDF-1.7\n${page}trailer\n<< >>\n%%EOF`, 'latin1');
}

function buildEml(testCase) {
  const headers = [
    `From: ${testCase.from}`,
    'To: auftrag@fleet.example',
    `Subject: ${testCase.subject}`,
    'Date: Tue, 01 Sep 2026 09:15:00 +0200',
    `Message-ID: <${testCase.id}@fleet-eval.example>`,
  ];
  if (testCase.inReplyTo) {
    headers.push(`In-Reply-To: <${testCase.inReplyTo}>`);
  }
  headers.push(`Content-Type: multipart/mixed; boundary="${BOUNDARY}"`);

  const parts = [
    [
      `--${BOUNDARY}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      testCase.body.join('\n'),
    ].join(CRLF),
  ];

  if (testCase.html) {
    parts.push(
      [`--${BOUNDARY}`, 'Content-Type: text/html; charset=utf-8', '', testCase.html].join(CRLF),
    );
  }

  if (testCase.attachmentText) {
    parts.push(
      [
        `--${BOUNDARY}`,
        'Content-Type: application/pdf; name="auftrag.pdf"',
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="auftrag.pdf"',
        '',
        buildPdf(testCase.attachmentText).toString('base64'),
      ].join(CRLF),
    );
  }

  return Buffer.from(
    `${headers.join(CRLF)}${CRLF}${CRLF}${parts.join(CRLF)}${CRLF}--${BOUNDARY}--${CRLF}`,
    'utf8',
  );
}

const cases = JSON.parse(readFileSync(path.join(ROOT, 'cases.json'), 'utf8'));
mkdirSync(FIXTURE_DIR, { recursive: true });

let written = 0;
for (const testCase of cases) {
  writeFileSync(path.join(FIXTURE_DIR, testCase.fixture), buildEml(testCase));
  written += 1;
}

console.log(`[transport-order-fixtures] wrote ${written} fixtures to ${FIXTURE_DIR}`);
