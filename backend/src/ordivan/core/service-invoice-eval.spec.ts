import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { summarizeChecks } from './automation-check.contract';
import { validateProposal } from './job-type-registry';
import { SchemaValidationError } from './schema-validation';
import { buildServiceInvoiceChecks, matchVehicle, type VehicleCandidate } from './service-invoice';

/**
 * `service-invoice-v1` eval paketi (Faz 13).
 *
 * DOGRULUK IDDIASI YOK: fixture'lar tamamen uydurma. Bu set sozlesmenin
 * sizdirmadigini ve kontrollerin dogru durumu urettigini olcuyor. Gercek
 * Ordivan ya da otomatik onay, DONDURULMUS GERCEK bir golden dataset olmadan
 * acilamaz — bunu manifest de yaziyor.
 */

const ROOT = path.resolve(__dirname, '../../../../evals/service-invoice-v1');

type EvalCase = {
  id: string;
  fixture: string;
  expect: 'accepted' | 'rejected';
  expectedReason?: string;
  payload?: Record<string, unknown>;
  lineItemCount?: number;
  expectedChecks?: Record<string, string>;
};

const cases = JSON.parse(readFileSync(path.join(ROOT, 'cases.json'), 'utf8')) as EvalCase[];
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')) as {
  version: string;
  extractionSchema: string;
  cases: Array<{ id: string }>;
};

const FLEET: VehicleCandidate[] = [
  { id: 'veh-1', plateNumber: 'DU-AB 123', vin: 'WDB9634031L123456' },
  { id: 'veh-2', plateNumber: 'DU-CD 456', vin: null },
];

function payloadOf(testCase: EvalCase): unknown {
  if (testCase.lineItemCount) {
    return {
      vendorName: 'Werkstatt Nord GmbH',
      lineItems: Array.from({ length: testCase.lineItemCount }, (_, index) => ({
        description: `Position ${index + 1}`,
      })),
    };
  }
  return testCase.payload;
}

describe('evals/service-invoice-v1 — paket butunlugu', () => {
  it('manifest surumlu ve vaka listesi dosyayla ortusur', () => {
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(
      manifest.cases.map((item) => item.id).sort(),
      cases.map((item) => item.id).sort(),
      'manifest ile vakalar ayrismis — set sessizce degistirilmis olabilir',
    );
  });

  it('sabit extraction semasina isaret eder ve o sema gercekten vardir', () => {
    const schemaPath = path.resolve(ROOT, '../..', manifest.extractionSchema);
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as { additionalProperties: boolean };
    assert.equal(schema.additionalProperties, false);
  });

  it('fixture PDF ve yalnizca PDF icerir', () => {
    const files = readdirSync(path.join(ROOT, 'fixtures'));
    assert.ok(files.length >= 4);
    for (const file of files) {
      assert.match(file, /\.pdf$/, `PDF olmayan fixture: ${file}`);
      const head = readFileSync(path.join(ROOT, 'fixtures', file)).subarray(0, 5).toString('ascii');
      assert.equal(head, '%PDF-', `${file} gecerli PDF degil`);
    }
  });
});

describe('evals/service-invoice-v1 — sema', () => {
  for (const testCase of cases) {
    it(`${testCase.expect === 'accepted' ? 'kabul' : 'RED'}: ${testCase.id}`, () => {
      let thrown: unknown;
      try {
        validateProposal(
          'document.service_invoice.extract',
          'service_invoice.draft',
          1,
          payloadOf(testCase),
        );
      } catch (error) {
        thrown = error;
      }

      if (testCase.expect === 'accepted') {
        assert.equal(thrown, undefined, `beklenmedik red: ${testCase.id}`);
        return;
      }

      assert.ok(
        thrown instanceof SchemaValidationError,
        `KACAK: "${testCase.id}" savunmadan gecti`,
      );
      if (testCase.expectedReason) {
        assert.equal((thrown as SchemaValidationError).reason, testCase.expectedReason);
      }
    });
  }

  it('injection vakalarinin HICBIRI kabul edilmiyor', () => {
    const leaked = cases
      .filter((item) => item.id.startsWith('injection-'))
      .filter((item) => {
        try {
          validateProposal(
            'document.service_invoice.extract',
            'service_invoice.draft',
            1,
            payloadOf(item),
          );
          return true;
        } catch {
          return false;
        }
      });
    assert.deepEqual(leaked.map((item) => item.id), []);
  });
});

describe('evals/service-invoice-v1 — kontroller', () => {
  for (const testCase of cases.filter((item) => item.expectedChecks)) {
    it(`kontrol durumlari: ${testCase.id}`, () => {
      const draft = testCase.payload as Record<string, unknown>;
      const vehicleMatch = matchVehicle(FLEET, {
        vin: (draft.vin as string) ?? null,
        plateNumber: (draft.plateNumber as string) ?? null,
      });
      const checks = buildServiceInvoiceChecks({ draft, vehicleMatch });

      for (const [code, expected] of Object.entries(testCase.expectedChecks!)) {
        const check = checks.find((item) => item.code === code);
        assert.ok(check, `${testCase.id}: ${code} kontrolu uretilmedi`);
        assert.equal(check!.status, expected, `${testCase.id}: ${code}`);
      }

      // Eksik ya da tutarsiz veride ASLA "hepsi dogrulandi" denmiyor.
      if (Object.values(testCase.expectedChecks!).some((status) => status !== 'verified')) {
        assert.equal(summarizeChecks(checks).allVerified, false);
      }
    });
  }
});
