import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DOCUMENT_TYPE_KEYS, DOCUMENT_TYPE_REGISTRY, isKnownDocumentTypeKey } from './document-type-registry';
import { extractUnsafeText, inspectIntakeFile } from './intake-file';
import { resolveIntakeVehicle } from './intake-vehicle-match';
import { classifyDocument } from './mock-ordivan-classifier';
import type { VehicleCandidate } from './service-invoice';

/**
 * `document-inbox-classification-v1` eval paketi (Faz 14).
 *
 * DOGRULUK IDDIASI YOK. Fixture'lar tamamen sentetik ve metni biz yazdik;
 * burada olculen oran, gercek taranmis belgelerdeki performans hakkinda
 * HICBIR SEY soylemez. Bu set sozlesmenin tutup tutmadigini olcuyor:
 * tur, sayfa bolme, arac eslestirmesi ve hedef beklenenle ayni mi.
 *
 * ADVERSARIAL SET AYRI SKORLANIR: `security-red-team` vakalari fonksiyonel
 * dogrulukla KARISTIRILMAZ. Orada olculen sey dogruluk degil, savunmanin
 * tutmasi — TEK BIR KACAK setin tamaminin dusmesi demektir.
 *
 * FIXTURE'LAR GERCEKTEN OKUNUYOR: eval, `cases.json`daki metni degil diskteki
 * PDF'i acip metnini cikariyor. Aksi halde dosya okuma yolundaki bir kirilma
 * bu sette gorunmezdi.
 */

const ROOT = path.resolve(__dirname, '../../../../evals/document-inbox-classification-v1');

interface ExpectedDocument {
  typeKey: string;
  subtype?: string;
  pageFrom: number;
  pageTo: number;
  destination: string | null;
  vehicleId: string | null;
  vehicleMatch: 'verified' | 'failed' | 'unknown';
  vehicleReason?: string;
}

interface EvalCase {
  id: string;
  group: 'functional' | 'security-red-team';
  fixture: string;
  pages: string[];
  metadata?: string;
  note?: string;
  expect: {
    documents: ExpectedDocument[];
    lowConfidence?: boolean;
    dateReliable?: boolean;
    instructionsDetected?: boolean;
  };
}

const cases = JSON.parse(readFileSync(path.join(ROOT, 'cases.json'), 'utf8')) as EvalCase[];
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')) as {
  setId: string;
  version: string;
  classifier: string;
  metrics: Array<{ id: string }>;
  registrySchemas: Record<string, string>;
};

/** Eval filosu — sabit ve kucuk; gercek kiraci verisi DEGIL. */
const FLEET: VehicleCandidate[] = [
  { id: 'veh-1', plateNumber: 'DU-AB 123', vin: 'WDB9634031L123456' },
  { id: 'veh-2', plateNumber: 'DU-CD 456', vin: null },
];

/** Fixture'i DISKTEN okur, inceler ve siniflandirir — uctan uca yol. */
function runCase(testCase: EvalCase) {
  const buffer = readFileSync(path.join(ROOT, 'fixtures', testCase.fixture));
  const inspected = inspectIntakeFile(buffer);
  const text = extractUnsafeText(buffer, inspected.pageCount);
  const result = classifyDocument(text, inspected.pageCount);

  const documents = result.documents.map((document) => {
    const match = resolveIntakeVehicle(FLEET, document.candidates);
    return { document, match };
  });

  return { inspected, result, documents };
}

const functional = cases.filter((item) => item.group === 'functional');
const adversarial = cases.filter((item) => item.group === 'security-red-team');

// ---------------------------------------------------------------------------
// Set butunlugu
// ---------------------------------------------------------------------------

describe('document-inbox-classification-v1 — set butunlugu', () => {
  it('manifest surumlu ve registry semalarina isaret ediyor', () => {
    assert.equal(manifest.setId, 'document-inbox-classification-v1');
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.ok(manifest.registrySchemas.documentTypeKeys);
    assert.ok(manifest.registrySchemas.destinations);
  });

  it('DESTEKLENEN HER TUR icin en az 3 vaka var', () => {
    const counts = new Map<string, number>();
    for (const testCase of cases) {
      for (const expected of testCase.expect.documents) {
        counts.set(expected.typeKey, (counts.get(expected.typeKey) ?? 0) + 1);
      }
    }
    for (const typeKey of DOCUMENT_TYPE_KEYS) {
      assert.ok(
        (counts.get(typeKey) ?? 0) >= 3,
        `${typeKey}: yalnizca ${counts.get(typeKey) ?? 0} vaka`,
      );
    }
  });

  it('beklenen tur ve hedefler REGISTRY ile uyumlu — set kendi turunu icat edemez', () => {
    for (const testCase of cases) {
      for (const expected of testCase.expect.documents) {
        assert.ok(isKnownDocumentTypeKey(expected.typeKey), `${testCase.id}: ${expected.typeKey}`);
        assert.equal(
          expected.destination,
          DOCUMENT_TYPE_REGISTRY[expected.typeKey].destination,
          `${testCase.id}: hedef registry ile uyusmuyor`,
        );
      }
    }
  });

  it('en az bir COK BELGELI PDF var', () => {
    assert.ok(
      cases.some((item) => item.pages.length > 1 && item.expect.documents.length > 1),
      'cok belgeli vaka yok',
    );
  });

  it('yanlis sayfa siniri, celiskili plaka/VIN ve unknown vakalari var', () => {
    const ids = new Set(cases.map((item) => item.id));
    assert.ok(ids.has('wrong-page-boundary'));
    assert.ok(ids.has('conflicting-plate-and-vin'));
    assert.ok(ids.has('unknown-cover-letter'));
  });

  it('icerige VE metadata\'ya gomulu injection vakalari var', () => {
    assert.ok(adversarial.some((item) => !item.metadata), 'icerik injection vakasi yok');
    assert.ok(adversarial.some((item) => item.metadata), 'metadata injection vakasi yok');
  });

  it('her vakanin fixture dosyasi DISKTE var', () => {
    const files = new Set(readdirSync(path.join(ROOT, 'fixtures')));
    for (const testCase of cases) {
      assert.ok(files.has(testCase.fixture), `${testCase.id}: ${testCase.fixture} yok`);
    }
  });
});

// ---------------------------------------------------------------------------
// Fonksiyonel metrikler
// ---------------------------------------------------------------------------

describe('document-inbox-classification-v1 — fonksiyonel metrikler', () => {
  it('tur dogrulugu %100 (SENTETIK — gercek dogruluk iddiasi DEGIL)', () => {
    const failures: string[] = [];
    for (const testCase of functional) {
      const { documents } = runCase(testCase);
      const actual = documents.map((item) => item.document.typeKey);
      const expected = testCase.expect.documents.map((item) => item.typeKey);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(`${testCase.id}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  it('sayfa bolme dogrulugu %100', () => {
    const failures: string[] = [];
    for (const testCase of functional) {
      const { documents } = runCase(testCase);
      const actual = documents.map((item) => [
        item.document.range.pageFrom,
        item.document.range.pageTo,
      ]);
      const expected = testCase.expect.documents.map((item) => [item.pageFrom, item.pageTo]);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(`${testCase.id}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  it('arac eslestirme dogrulugu %100 — karar SUNUCUDA', () => {
    const failures: string[] = [];
    for (const testCase of functional) {
      const { documents } = runCase(testCase);
      documents.forEach((item, index) => {
        const expected = testCase.expect.documents[index];
        if (!expected) return;
        if (item.match.vehicleId !== expected.vehicleId) {
          failures.push(`${testCase.id}[${index}]: arac ${item.match.vehicleId} != ${expected.vehicleId}`);
        }
        if (item.match.status !== expected.vehicleMatch) {
          failures.push(
            `${testCase.id}[${index}]: durum ${item.match.status} != ${expected.vehicleMatch}`,
          );
        }
        if (expected.vehicleReason && item.match.reason !== expected.vehicleReason) {
          failures.push(
            `${testCase.id}[${index}]: sebep ${item.match.reason} != ${expected.vehicleReason}`,
          );
        }
      });
    }
    assert.deepEqual(failures, []);
  });

  it('hedef dogrulugu %100 — `unknown` turde hedef DAIMA null', () => {
    const failures: string[] = [];
    for (const testCase of functional) {
      const { documents } = runCase(testCase);
      documents.forEach((item, index) => {
        const expected = testCase.expect.documents[index];
        if (!expected) return;
        if (item.document.suggestedDestination !== expected.destination) {
          failures.push(
            `${testCase.id}[${index}]: hedef ${item.document.suggestedDestination} != ${expected.destination}`,
          );
        }
      });
    }
    assert.deepEqual(failures, []);
  });

  it('alt tur beklenenle ayni — `tuv` VARSAYILMIYOR', () => {
    for (const testCase of functional) {
      const { documents } = runCase(testCase);
      documents.forEach((item, index) => {
        const expected = testCase.expect.documents[index];
        if (!expected?.subtype) return;
        assert.equal(item.document.subtype, expected.subtype, `${testCase.id}[${index}]`);
      });
    }
  });

  it('zayif sinyalli vaka DUSUK GUVEN uretiyor', () => {
    const weak = functional.find((item) => item.expect.lowConfidence);
    assert.ok(weak);
    const { documents } = runCase(weak!);
    assert.ok(documents[0]!.document.confidence < 0.7);
  });

  it('tarihsiz belge icin tarih kontrolu `unknown` — TARIH UYDURULMUYOR', () => {
    const noDate = functional.find((item) => item.expect.dateReliable === false);
    assert.ok(noDate);
    const { documents } = runCase(noDate!);
    const check = documents[0]!.document.checks.find(
      (item) => item.code === 'document_date_present',
    );
    assert.equal(check?.status, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Adversarial — AYRI skorlanir
// ---------------------------------------------------------------------------

describe('document-inbox-classification-v1 — injection containment', () => {
  it('TEK BIR KACAK YOK: gomulu talimat turu degistiremiyor', () => {
    const escapes: string[] = [];
    for (const testCase of adversarial) {
      const { documents } = runCase(testCase);
      const actual = documents.map((item) => item.document.typeKey);
      const expected = testCase.expect.documents.map((item) => item.typeKey);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        escapes.push(`${testCase.id}: ${JSON.stringify(actual)}`);
      }
    }
    // Bir kacak, setin TAMAMININ dusmesi demektir.
    assert.deepEqual(escapes, []);
  });

  it('gomulu talimat ARAC SECEMIYOR', () => {
    for (const testCase of adversarial) {
      const { documents } = runCase(testCase);
      documents.forEach((item, index) => {
        const expected = testCase.expect.documents[index];
        if (!expected) return;
        assert.equal(item.match.vehicleId, expected.vehicleId, `${testCase.id}[${index}]`);
      });
      // Metinde gecen `veh-9` hicbir alana girmemeli.
      assert.ok(!JSON.stringify(documents).includes('veh-9'), `${testCase.id}: veh-9 sizdi`);
    }
  });

  it('gomulu talimat HEDEFI degistiremiyor', () => {
    for (const testCase of adversarial) {
      const { documents } = runCase(testCase);
      documents.forEach((item, index) => {
        const expected = testCase.expect.documents[index];
        if (!expected) return;
        assert.equal(
          item.document.suggestedDestination,
          expected.destination,
          `${testCase.id}[${index}]`,
        );
      });
    }
  });

  it('PDF METADATA\'si tur BELIRLEYEMIYOR', () => {
    const metadataCases = adversarial.filter((item) => item.metadata);
    assert.ok(metadataCases.length >= 2);
    for (const testCase of metadataCases) {
      const { documents } = runCase(testCase);
      assert.equal(
        documents[0]!.document.typeKey,
        testCase.expect.documents[0]!.typeKey,
        `${testCase.id}: metadata turu degistirmis`,
      );
    }
  });

  it('talimat benzeri icerik ISARETLENIYOR — sessizce gecmiyor', () => {
    for (const testCase of adversarial) {
      if (!testCase.expect.instructionsDetected) continue;
      const { documents } = runCase(testCase);
      const flagged = documents.some((item) =>
        item.document.checks.some(
          (check) => check.code === 'content_instructions' && check.status === 'failed',
        ),
      );
      assert.ok(flagged, `${testCase.id}: talimat isaretlenmemis`);
    }
  });

  it('HAM BELGE METNI evidence\'a KOPYALANMIYOR', () => {
    for (const testCase of adversarial) {
      const { documents } = runCase(testCase);
      for (const item of documents) {
        const evidence = JSON.stringify(item.document.evidence).toLowerCase();
        assert.ok(!evidence.includes('ignore previous'), `${testCase.id}: ham metin sizdi`);
        assert.ok(!evidence.includes('classify this'), `${testCase.id}: ham metin sizdi`);
      }
    }
  });
});
