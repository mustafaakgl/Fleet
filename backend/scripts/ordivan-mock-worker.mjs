#!/usr/bin/env node
/**
 * Mock Ordivan Worker (Faz 12).
 *
 * GERCEK PROTOKOLU KULLANIR: bu surec Fleet'in veritabanina ya da servis
 * katmanina HIC dokunmaz — yalnizca connector HTTP uclarini cagirir. Boylece
 * gercek Ordivan geldiginde degisen tek sey bu dosyanin yerine gecmesi olur;
 * protokolde tek satir degismez.
 *
 * DETERMINISTIK: hicbir AI/OCR cagrisi yok. Ayni girdi her zaman ayni sonucu
 * verir, yani testler sahte bir modelin gunune bagli degildir.
 *
 * URETIMDE CALISMAZ: sahte bir ajanin oneri uretmesi, insanin "sistem baktı"
 * sanmasi demektir.
 *
 * Kullanim:
 *   node scripts/ordivan-mock-worker.mjs --enroll <kod> [--once]
 *   ORDIVAN_CREDENTIAL=<anahtar> node scripts/ordivan-mock-worker.mjs --once
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE =
  process.env.FLEET_API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

/**
 * SOZLESME DOGRULAMASI.
 *
 * Worker gonderdigi her oneriyi, SUNUCUYA GITMEDEN ONCE diskteki JSON
 * Schema'ya karsi dogrular. Bu, sozlesmenin "yasayan" olmasinin worker
 * tarafindaki karsiligi: protokol degisip worker guncellenmezse hata
 * sunucudan degil BURADAN gelir ve nerede oldugu bellidir.
 */
const CONTRACT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../contracts/ordivan',
);

function loadSchema(name) {
  return JSON.parse(readFileSync(path.join(CONTRACT_DIR, name), 'utf8'));
}

/** Kucuk, bagimsizlik gerektirmeyen dogrulayici — sunucudaki kuralin aynisi. */
function validateAgainstSchema(schema, value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}: not an object`);
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) {
        throw new Error(`${label}: unexpected field "${key}"`);
      }
    }
  }

  for (const required of schema.required ?? []) {
    if (value[required] === undefined || value[required] === null) {
      throw new Error(`${label}: missing required "${required}"`);
    }
  }

  for (const [key, spec] of Object.entries(schema.properties)) {
    const item = value[key];
    if (item === undefined || item === null) continue;

    if (spec.type === 'string' && typeof item !== 'string') {
      throw new Error(`${label}.${key}: expected string`);
    }
    if ((spec.type === 'number' || spec.type === 'integer') && typeof item !== 'number') {
      throw new Error(`${label}.${key}: expected number`);
    }
    if (spec.type === 'integer' && !Number.isInteger(item)) {
      throw new Error(`${label}.${key}: expected integer`);
    }
    if (spec.type === 'boolean' && typeof item !== 'boolean') {
      throw new Error(`${label}.${key}: expected boolean`);
    }
    if (spec.enum && !spec.enum.includes(item)) {
      throw new Error(`${label}.${key}: "${item}" not in enum`);
    }
    if (spec.maxLength !== undefined && String(item).length > spec.maxLength) {
      throw new Error(`${label}.${key}: too long`);
    }
    if (spec.minimum !== undefined && item < spec.minimum) {
      throw new Error(`${label}.${key}: below minimum`);
    }
    if (spec.maximum !== undefined && item > spec.maximum) {
      throw new Error(`${label}.${key}: above maximum`);
    }
  }
}

const CONTRACT_INDEX = loadSchema('index.json');
const CONNECTOR_VERSION = '0.1.0-mock';
const PROTOCOL_VERSION = '1';
const POLL_INTERVAL_MS = Number(process.env.ORDIVAN_MOCK_POLL_MS || 2000);

if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
  console.error('[ordivan-mock] refusing to run with NODE_ENV=production');
  process.exit(2);
}

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const runOnce = args.includes('--once');

async function call(path, { method = 'POST', body, credential } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(credential ? { 'x-ordivan-credential': credential } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status}`);
    error.status = response.status;
    error.body = parsed;
    throw error;
  }
  return parsed;
}

/**
 * Belge turunu DOSYA ADINDAN, sabit kurallarla belirler.
 *
 * Belge ICERIGI hic okunmuyor — bu bir tasarim tercihi: Faz 12'nin amaci
 * protokolu kanitlamak, sinifllandirma yapmak degil. Icerik okunsaydi mock,
 * gercek OCR'in yerine gecmis gibi gorunurdu.
 */
function classifyDocument(documentName) {
  const name = String(documentName ?? '').toLowerCase();
  const rules = [
    { match: 'rechnung', kind: 'invoice', confidence: 0.93 },
    { match: 'invoice', kind: 'invoice', confidence: 0.93 },
    { match: 'lieferschein', kind: 'delivery_note', confidence: 0.88 },
    { match: 'tank', kind: 'fuel_receipt', confidence: 0.9 },
    { match: 'versicherung', kind: 'insurance', confidence: 0.85 },
  ];
  const hit = rules.find((rule) => name.includes(rule.match));
  return hit
    ? { documentKind: hit.kind, confidence: hit.confidence }
    : // Eslesme yoksa DUSUK guvenle "other": uydurma bir tur secmek, insanin
      // dogrulamasi gereken yerde sahte bir kesinlik uretirdi.
      { documentKind: 'other', confidence: 0.42 };
}

function buildResult(job) {
  if (job.jobType === 'system.echo') {
    return {
      proposalType: 'system.echo_result',
      proposalSchemaVersion: 1,
      payload: { echoed: String(job.payload?.message ?? '') },
      confidence: { echoed: 1 },
      evidence: { source: 'job_payload' },
      checks: [
        {
          code: 'echo_roundtrip',
          status: 'verified',
          messageKey: 'automation.checks.echo_roundtrip.verified',
        },
      ],
    };
  }

  if (job.jobType === 'document.mock_classification') {
    const classified = classifyDocument(job.payload?.documentName);
    return {
      proposalType: 'document.classification',
      proposalSchemaVersion: 1,
      payload: classified,
      confidence: { documentKind: classified.confidence },
      evidence: { source: 'file_name_rules', documentName: job.payload?.documentName ?? null },
      checks: [
        {
          code: 'document_kind_rule',
          status: classified.documentKind === 'other' ? 'unknown' : 'verified',
          messageKey: `automation.checks.document_kind_rule.${
            classified.documentKind === 'other' ? 'unknown' : 'verified'
          }`,
          // `unknown` GEREKCESIZ OLAMAZ — sozlesme bunu reddediyor.
          ...(classified.documentKind === 'other'
            ? { unknownReason: 'no_matching_rule' }
            : {}),
        },
        {
          // Icerik okunmadigi surece bu kontrol dogrulanamaz. "Sorun yok"
          // demek yerine acikca "bilinmiyor" diyoruz.
          code: 'content_consistency',
          status: 'unknown',
          messageKey: 'automation.checks.content_consistency.unknown',
          unknownReason: 'content_not_read_in_mock_mode',
        },
      ],
    };
  }

  return null;
}

async function main() {
  let credential = process.env.ORDIVAN_CREDENTIAL?.trim();
  const enrollmentCode = arg('--enroll') ?? process.env.ORDIVAN_ENROLLMENT_CODE?.trim();

  if (!credential && enrollmentCode) {
    const enrolled = await call('/ordivan/connector/enroll', {
      body: {
        enrollmentCode,
        connectorVersion: CONNECTOR_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        platform: process.platform,
        architecture: process.arch,
      },
    });
    credential = enrolled.credential;
    // Anahtar BIR KEZ doner; kullanici kalicilastirmak isterse kendisi saklar.
    console.log(`[ordivan-mock] enrolled connector=${enrolled.connectorId}`);
    console.log(`[ordivan-mock] credential=${credential}`);
  }

  if (!credential) {
    console.error('[ordivan-mock] no credential — pass --enroll <code> or set ORDIVAN_CREDENTIAL');
    process.exit(2);
  }

  let idleRounds = 0;

  for (;;) {
    const beat = await call('/ordivan/connector/heartbeat', {
      body: {
        connectorVersion: CONNECTOR_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        platform: process.platform,
        architecture: process.arch,
      },
      credential,
    });
    if (beat.protocolCompatibility !== 'ok') {
      console.warn(`[ordivan-mock] protocol compatibility: ${beat.protocolCompatibility}`);
    }
    // Sunucunun konustugu protokol, sozlesme dosyasindakiyle ayni mi.
    if (beat.protocol?.current !== CONTRACT_INDEX.protocol.current) {
      throw new Error(
        `contract drift: server protocol ${beat.protocol?.current} != contract ${CONTRACT_INDEX.protocol.current}`,
      );
    }

    const leased = await call('/ordivan/connector/jobs/lease', { credential });
    const job = leased.job;

    if (!job) {
      idleRounds += 1;
      if (runOnce) {
        console.log('[ordivan-mock] no job available');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    idleRounds = 0;
    console.log(`[ordivan-mock] leased job=${job.jobId} type=${job.jobType} attempt=${job.attempt}`);

    await call(`/ordivan/connector/jobs/${job.jobId}/running`, {
      body: { leaseToken: job.leaseToken },
      credential,
    });

    const result = buildResult(job);
    if (!result) {
      await call(`/ordivan/connector/jobs/${job.jobId}/fail`, {
        body: { leaseToken: job.leaseToken, failureClass: 'unsupported_job_type' },
        credential,
      });
      console.log(`[ordivan-mock] unsupported job type=${job.jobType}`);
      if (runOnce) return;
      continue;
    }

    // SOZLESMEYE KARSI DOGRULA — sunucuya gitmeden once.
    validateAgainstSchema(
      loadSchema(`proposal.${result.proposalType}.v${result.proposalSchemaVersion}.schema.json`),
      result.payload,
      result.proposalType,
    );

    const completed = await call(`/ordivan/connector/jobs/${job.jobId}/complete`, {
      body: {
        leaseToken: job.leaseToken,
        ...result,
        modelVersion: 'mock-rules-1',
        promptVersion: 'mock-none',
      },
      credential,
    });

    console.log(
      `[ordivan-mock] completed job=${job.jobId} proposal=${completed.proposalId} repeated=${completed.repeated}`,
    );

    if (runOnce) {
      return;
    }
  }
}

main().catch((error) => {
  console.error(`[ordivan-mock] failed: ${error.message}`);
  if (error.body) {
    console.error(`[ordivan-mock] detail: ${JSON.stringify(error.body)}`);
  }
  process.exit(1);
});
