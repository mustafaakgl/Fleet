import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { validateProposal } from './job-type-registry';
import { SchemaValidationError } from './schema-validation';

/**
 * Versiyonlu eval setlerini kural motoruna karsi kosar.
 *
 * IKI SET AYRI SKORLANIR:
 *   - `functional`      → dogruluk. Beklenen davranis uretiliyor mu.
 *   - `security-red-team` → CONTAINMENT. Burada olculen sey dogruluk degil,
 *     savunmanin tutup tutmadigi. TEK BIR KACAK setin tamamini dusurur.
 *
 * Setler SESSIZCE DEGISEMEZ: manifest surumu de burada dogrulaniyor, yani
 * bir vaka eklenip surum artirilmadiginda test kirmizi olur.
 */

const EVALS_ROOT = path.resolve(__dirname, '../../../../evals');

type EvalCase = {
  id: string;
  jobType: string;
  proposalType: string;
  schemaVersion: number;
  payload?: Record<string, unknown>;
  payloadGenerator?: { field: string; repeat: string; times: number };
  expect: 'accepted' | 'rejected';
  expectedReason?: string;
};

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(EVALS_ROOT, ...segments), 'utf8')) as T;
}

function payloadOf(testCase: EvalCase): unknown {
  if (testCase.payloadGenerator) {
    const { field, repeat, times } = testCase.payloadGenerator;
    return { [field]: repeat.repeat(times) };
  }
  return testCase.payload;
}

describe('evals — surum ve manifest butunlugu', () => {
  it('kok manifest iki seti de surumuyle birlikte tanimlar', () => {
    const root = readJson<{ version: string; sets: Array<{ id: string; version: string; scoring: string }> }>(
      'manifest.json',
    );
    assert.match(root.version, /^\d+\.\d+\.\d+$/);
    const ids = root.sets.map((set) => set.id).sort();
    // Faz 12'nin iki seti KAYBOLAMAZ; sonraki fazlar set EKLEYEBILIR
    // (Faz 13: service-invoice-v1). Bu yuzden "iceriyor" diye bakiliyor,
    // "tam olarak bunlar" diye degil.
    assert.ok(ids.includes('functional'), 'functional seti kayboldu');
    assert.ok(ids.includes('security-red-team'), 'security-red-team seti kayboldu');
    for (const set of root.sets) {
      assert.match(set.version, /^\d+\.\d+\.\d+$/, `${set.id} surumsuz`);
      assert.ok(set.scoring, `${set.id} skorlama bicimi yok`);
    }

    // Adversarial set fonksiyonel skorla KARISTIRILMAZ.
    const redTeam = root.sets.find((set) => set.id === 'security-red-team')!;
    assert.equal(redTeam.scoring, 'containment');
    const functional = root.sets.find((set) => set.id === 'functional')!;
    assert.equal(functional.scoring, 'accuracy');
  });

  it('manifest vaka listesi dosyadaki vakalarla birebir ortusur', () => {
    for (const set of ['functional', 'security-red-team']) {
      const manifest = readJson<{ version: string; cases: Array<{ id: string }> }>(set, 'manifest.json');
      const cases = readJson<EvalCase[]>(set, 'cases.json');

      assert.match(manifest.version, /^\d+\.\d+\.\d+$/, `${set} surumsuz`);
      assert.deepEqual(
        manifest.cases.map((item) => item.id).sort(),
        cases.map((item) => item.id).sort(),
        `${set}: manifest ile vakalar ayrismis — set sessizce degistirilmis olabilir`,
      );
    }
  });
});

describe('evals/functional — dogruluk seti', () => {
  const cases = readJson<EvalCase[]>('functional', 'cases.json');

  it('bos degil', () => {
    assert.ok(cases.length >= 4);
  });

  for (const testCase of cases) {
    it(`kabul edilir: ${testCase.id}`, () => {
      assert.equal(testCase.expect, 'accepted');
      const result = validateProposal(
        testCase.jobType,
        testCase.proposalType,
        testCase.schemaVersion,
        payloadOf(testCase),
      );
      assert.ok(result);
    });
  }
});

describe('evals/security-red-team — containment seti', () => {
  const cases = readJson<EvalCase[]>('security-red-team', 'cases.json');

  it('bos degil', () => {
    assert.ok(cases.length >= 10);
  });

  for (const testCase of cases) {
    it(`REDDEDILIR: ${testCase.id}`, () => {
      assert.equal(testCase.expect, 'rejected');

      let thrown: unknown;
      try {
        validateProposal(
          testCase.jobType,
          testCase.proposalType,
          testCase.schemaVersion,
          payloadOf(testCase),
        );
      } catch (error) {
        thrown = error;
      }

      assert.ok(
        thrown instanceof SchemaValidationError,
        `KACAK: "${testCase.id}" savunmadan gecti`,
      );
      if (testCase.expectedReason) {
        assert.equal(
          (thrown as SchemaValidationError).reason,
          testCase.expectedReason,
          `${testCase.id}: beklenen red sebebi tutmadi`,
        );
      }
    });
  }

  it('containment skoru: hicbir vaka kabul edilmemeli', () => {
    const leaked = cases.filter((testCase) => {
      try {
        validateProposal(
          testCase.jobType,
          testCase.proposalType,
          testCase.schemaVersion,
          payloadOf(testCase),
        );
        return true;
      } catch {
        return false;
      }
    });

    assert.deepEqual(
      leaked.map((item) => item.id),
      [],
      'adversarial vakalar savunmadan gecti — set DUSTU',
    );
  });
});
