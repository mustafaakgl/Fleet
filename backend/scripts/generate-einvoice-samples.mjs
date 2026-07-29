#!/usr/bin/env node
/**
 * Renders the three e-invoice scenarios we have to stay compliant on, so external
 * validators have something concrete to chew on.
 *
 *   a) mixed 19 % + 7 % invoice        — the everyday German case
 *   b) reverse charge (§ 13b UStG)     — mandatory statement, no VAT charged
 *   c) small business (§ 19 UStG)      — mandatory note, no VAT charged
 *
 * For each scenario it writes the ZUGFeRD PDF, the CII XML and the XRechnung UBL XML.
 * `renderedAt` is fixed, so re-running produces byte-identical files and a validator
 * report only changes when the generators change.
 *
 * Usage: node scripts/generate-einvoice-samples.mjs [--out <dir>]
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');

const { buildCiiXml } = require('../src/invoicing/einvoice/cii-xml');
const { buildUblXml } = require('../src/invoicing/einvoice/ubl-xml');
const { renderInvoicePdf } = require('../src/invoicing/einvoice/pdf-renderer');

/** Fixed so the samples — and therefore the validator reports — are reproducible. */
const RENDERED_AT = new Date('2026-01-15T09:00:00.000Z');

/** Official XRechnung test route id, published by KoSIT for exactly this purpose. */
const TEST_LEITWEG_ID = '991-33333TEST-33';

const SUPPLIER = {
  name: 'Fleet Transporte GmbH',
  street: 'Musterstraße 1',
  postalCode: '10115',
  city: 'Berlin',
  countryCode: 'DE',
  vatId: 'DE123456789',
  taxNumber: '30/123/45678',
  // BT-30, the identifier a § 19 seller without a VAT id has to fall back on (BR-CO-26).
  registrationNumber: 'HRB 12345 B',
  email: 'rechnung@fleet-transporte.example',
  phone: '+49 30 1234567',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  bankName: 'Deutsche Kreditbank',
  footerText: 'Geschäftsführer: Max Mustermann — Amtsgericht Berlin HRB 12345',
};

const CUSTOMER = {
  name: 'Acme Logistik GmbH',
  street: 'Hafenstraße 12',
  postalCode: '20457',
  city: 'Hamburg',
  countryCode: 'DE',
  vatId: 'DE987654321',
  email: 'rechnung@acme-logistik.example',
};

function baseDocument(overrides) {
  return {
    number: 'RE-2026-00001',
    invoiceDate: new Date('2026-01-15T00:00:00.000Z'),
    dueDate: new Date('2026-01-29T00:00:00.000Z'),
    servicePeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    servicePeriodEnd: new Date('2026-01-14T00:00:00.000Z'),
    paymentTermDays: 14,
    currency: 'EUR',
    supplier: SUPPLIER,
    customer: CUSTOMER,
    buyerReference: TEST_LEITWEG_ID,
    lines: [],
    taxBreakdown: [],
    netCents: 0,
    taxCents: 0,
    grossCents: 0,
    smallBusinessRule: false,
    notes: null,
    ...overrides,
  };
}

/** (a) One 19 % transport line and one 7 % line. */
function mixedRatesScenario() {
  return baseDocument({
    number: 'RE-2026-00001',
    lines: [
      {
        position: 1,
        description: 'Transport Berlin – Hamburg',
        quantityMilliunits: 1_000,
        unit: 'tour',
        unitPriceCents: 100_000,
        taxRateBasisPoints: 1_900,
        taxCategory: 'standard',
        netCents: 100_000,
        serviceDate: new Date('2026-01-05T00:00:00.000Z'),
      },
      {
        position: 2,
        description: 'Lebensmitteltransport (ermäßigter Steuersatz)',
        quantityMilliunits: 2_000,
        unit: 'day',
        unitPriceCents: 25_000,
        taxRateBasisPoints: 700,
        taxCategory: 'reduced',
        netCents: 50_000,
        serviceDate: new Date('2026-01-08T00:00:00.000Z'),
      },
    ],
    taxBreakdown: [
      { taxCategory: 'standard', taxRateBasisPoints: 1_900, netCents: 100_000, taxCents: 19_000, grossCents: 119_000 },
      { taxCategory: 'reduced', taxRateBasisPoints: 700, netCents: 50_000, taxCents: 3_500, grossCents: 53_500 },
    ],
    netCents: 150_000,
    taxCents: 22_500,
    grossCents: 172_500,
  });
}

/** (b) § 13b UStG — the recipient owes the tax. */
function reverseChargeScenario() {
  return baseDocument({
    number: 'RE-2026-00002',
    lines: [
      {
        position: 1,
        description: 'Grenzüberschreitender Transport Berlin – Wien',
        quantityMilliunits: 1_000,
        unit: 'tour',
        unitPriceCents: 180_000,
        taxRateBasisPoints: 0,
        taxCategory: 'reverse_charge',
        netCents: 180_000,
        serviceDate: new Date('2026-01-09T00:00:00.000Z'),
      },
    ],
    taxBreakdown: [
      { taxCategory: 'reverse_charge', taxRateBasisPoints: 0, netCents: 180_000, taxCents: 0, grossCents: 180_000 },
    ],
    netCents: 180_000,
    taxCents: 0,
    grossCents: 180_000,
  });
}

/** (c) § 19 UStG — small business, no VAT shown at all. */
function smallBusinessScenario() {
  return baseDocument({
    number: 'RE-2026-00003',
    supplier: { ...SUPPLIER, vatId: null },
    lines: [
      {
        position: 1,
        description: 'Kurierfahrt Berlin – Potsdam',
        quantityMilliunits: 3_000,
        unit: 'tour',
        unitPriceCents: 12_000,
        taxRateBasisPoints: 0,
        taxCategory: 'exempt',
        netCents: 36_000,
        serviceDate: new Date('2026-01-12T00:00:00.000Z'),
      },
    ],
    taxBreakdown: [
      { taxCategory: 'exempt', taxRateBasisPoints: 0, netCents: 36_000, taxCents: 0, grossCents: 36_000 },
    ],
    netCents: 36_000,
    taxCents: 0,
    grossCents: 36_000,
    smallBusinessRule: true,
  });
}

export const SCENARIOS = [
  { id: 'a-mixed-rates', title: 'Mixed 19% and 7%', build: mixedRatesScenario },
  { id: 'b-reverse-charge', title: 'Reverse charge (§ 13b UStG)', build: reverseChargeScenario },
  { id: 'c-small-business', title: 'Small business (§ 19 UStG)', build: smallBusinessScenario },
];

export const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'tmp', 'einvoice-samples');

export async function generateSamples(outputDir = DEFAULT_OUTPUT_DIR) {
  mkdirSync(outputDir, { recursive: true });
  const written = [];

  for (const scenario of SCENARIOS) {
    const document = scenario.build();
    const ciiXml = buildCiiXml(document);
    const ublXml = buildUblXml(document);
    const pdf = await renderInvoicePdf({ document, ciiXml, renderedAt: RENDERED_AT });

    const files = [
      { path: join(outputDir, `${scenario.id}-zugferd.pdf`), contents: Buffer.from(pdf) },
      { path: join(outputDir, `${scenario.id}-cii.xml`), contents: Buffer.from(ciiXml, 'utf8') },
      { path: join(outputDir, `${scenario.id}-xrechnung.xml`), contents: Buffer.from(ublXml, 'utf8') },
    ];
    for (const file of files) {
      writeFileSync(file.path, file.contents);
      written.push({ scenario: scenario.id, path: file.path, bytes: file.contents.byteLength });
    }
  }

  return written;
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const outputDir = outIndex >= 0 ? resolve(process.argv[outIndex + 1]) : DEFAULT_OUTPUT_DIR;

  const written = await generateSamples(outputDir);
  for (const file of written) {
    console.log(`[samples] ${file.scenario} ${file.path} (${file.bytes} bytes)`);
  }
  console.log(`[samples] wrote ${written.length} files to ${outputDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[samples] failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
