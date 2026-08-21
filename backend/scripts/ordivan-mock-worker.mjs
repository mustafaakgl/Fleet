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
import { extractOrderPayload } from './order-intake-mock-extract.mjs';

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

/**
 * Servis faturasi fixture'i — DETERMINISTIK.
 *
 * Hicbir AI/OCR yok. Sonuc dosya ADINDAN sabit kurallarla turetiliyor, yani
 * ayni dosya her zaman ayni sonucu veriyor ve test bir modelin gunune bagli
 * degil.
 *
 * ARAC SECILMIYOR: cikti yalnizca plaka/VIN ADAYI tasiyor. Hangi aracin
 * kastedildigine SUNUCU karar veriyor (deterministik eslestirme).
 */
const SERVICE_INVOICE_FIXTURES = [
  {
    match: 'werkstatt-nord',
    payload: {
      vendorName: 'Werkstatt Nord GmbH',
      invoiceNumber: 'RE-2026-0815',
      invoiceDate: '2026-08-12',
      serviceDate: '2026-08-10',
      plateNumber: 'DU-AB 123',
      vin: 'WDB9634031L123456',
      mileageKm: 412000,
      currency: 'EUR',
      netAmount: 1000,
      taxAmount: 190,
      grossAmount: 1190,
      serviceDescription: 'Inspektion und Bremsenwechsel',
      lineItems: [
        { description: 'Inspektion', quantity: 1, unitPrice: 400, totalPrice: 400 },
        { description: 'Bremsbelaege vorne', quantity: 2, unitPrice: 300, totalPrice: 600 },
      ],
    },
    confidence: { vendorName: 0.97, serviceDate: 0.95, grossAmount: 0.96, vin: 0.93, currency: 0.99 },
  },
  {
    // Tutari tutmayan fatura: net + vergi brute UYMUYOR.
    match: 'summenfehler',
    payload: {
      vendorName: 'Reifen Sued',
      invoiceNumber: 'RE-2026-0999',
      serviceDate: '2026-08-11',
      plateNumber: 'DU-CD 456',
      currency: 'EUR',
      netAmount: 500,
      taxAmount: 95,
      grossAmount: 700,
      serviceDescription: 'Reifenwechsel',
    },
    confidence: { vendorName: 0.9, grossAmount: 0.55, currency: 0.98 },
  },
  {
    // Para birimi ve arac tanimlayicisi OKUNAMADI — uydurulmuyor.
    match: 'unklar',
    payload: {
      vendorName: 'Freie Werkstatt',
      serviceDate: '2026-08-09',
      netAmount: 210,
      serviceDescription: 'Oelwechsel',
    },
    confidence: { vendorName: 0.72, serviceDate: 0.61, netAmount: 0.58 },
  },
];

function extractServiceInvoice(originalName) {
  const name = String(originalName ?? '').toLowerCase();
  const hit = SERVICE_INVOICE_FIXTURES.find((fixture) => name.includes(fixture.match));
  // Eslesme yoksa ILK fixture: deterministik bir taban sonuc.
  return hit ?? SERVICE_INVOICE_FIXTURES[0];
}

function buildOrderExtraction(content, job) {
  const { payload, confidence, entries } = extractOrderPayload(content);
  return {
    proposalType: 'transport_order.extraction',
    proposalSchemaVersion: 1,
    payload,
    confidence,
    // Kanit neyin NEREDEN geldigini tasiyor. Kontrolleri worker URETMIYOR:
    // sunucu onlari saklanan icerikten kendisi uretiyor, cunku
    // `order_instructions_detected` bir guvenlik sinyali ve ele gecirilmis
    // bir worker "enjeksiyon yok" diyebilirdi.
    evidence: { source: 'mock_order_extraction', messageId: job.payload?.messageId ?? null, entries },
    checks: [],
  };
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

  if (job.jobType === 'document.service_invoice.extract') {
    const fixture = extractServiceInvoice(job.payload?.originalName);
    return {
      proposalType: 'service_invoice.draft',
      proposalSchemaVersion: 1,
      payload: fixture.payload,
      confidence: fixture.confidence,
      // Belge METNI evidence'a KOPYALANMIYOR; yalnizca neyin nereden geldigi.
      evidence: { source: 'mock_fixture', documentId: job.payload?.documentId ?? null },
      // Kontroller SUNUCUDA uretiliyor (arac eslestirmesi dahil); worker
      // burada kendi kontrolunu gondermiyor.
      checks: [],
    };
  }

  /**
   * FAZ 17 — DISPATCH SIRALAMASI.
   *
   * AJAN ADAY SECMEZ, SIRALAR. Uygunluk sunucuda deterministik kurallarla
   * belirleniyor; buradan cikan tek sey bir SIRA ve kapali bir gerekce
   * anahtari. Bu yuzden payload'da hicbir Fleet kimligi (arac, surucu,
   * siparis) YOK — yalnizca sunucunun verdigi kisa referanslar.
   *
   * Aday sayisi is payload'indan okunuyor: sunucu kac referans verdiyse o
   * kadar sira uretiliyor. Uydurma bir referans yazsaydik sunucu onu
   * eslestiremez ve baglama sessizce dusserdi.
   */
  if (job.jobType === 'dispatch.plan') {
    const candidateCount = Math.max(1, Math.min(Number(job.payload?.candidateCount ?? 1), 50));
    const orderCount = Math.max(0, Math.min(Number(job.payload?.orderCount ?? 0), 20));
    return {
      proposalType: 'dispatch.plan.suggestion',
      proposalSchemaVersion: 1,
      payload: {
        rankedCandidates: Array.from({ length: candidateCount }, (_item, index) => ({
          candidateRef: `c${index + 1}`,
          rank: index + 1,
          // Deterministik ve KAPALI KUME: serbest metin gerekce yok.
          rationaleKey: index === 0 ? 'capacity_fits_best' : 'no_strong_signal',
        })),
        consolidationRefs: Array.from({ length: orderCount }, (_item, index) => ({
          orderRef: `o${index + 1}`,
        })),
      },
      // Guven skoru SIRALAMAYA ait, bir karara degil.
      confidence: { rankedCandidates: 0.6 },
      evidence: { source: 'mock_dispatch_ranking', dispatchProposalId: job.payload?.dispatchProposalId ?? null },
      // Uygunluk kontrollerini SUNUCU uretiyor; ele gecirilmis bir worker
      // "arac uygun" diyebilirdi.
      checks: [],
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

    // Belgeli isler icin belgeyi indir — bu yol yalnizca LEASE ALDIGI is icin
    // acik. Icerik okunmuyor (mock deterministik); indirme, protokolun
    // gercekten calistigini kanitliyor.
    if (job.jobType === 'document.service_invoice.extract') {
      const response = await fetch(
        `${API_BASE}/ordivan/connector/jobs/${job.jobId}/document`,
        {
          headers: {
            'x-ordivan-credential': credential,
            'x-ordivan-lease-token': job.leaseToken,
          },
        },
      );
      if (!response.ok) {
        throw new Error(`document download failed: ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error('document is not a PDF');
      }
      console.log(`[ordivan-mock] document downloaded bytes=${bytes.length}`);
    }

    let result = buildResult(job);

    // TASIMA EMRI: icerik IS PAYLOAD'INDA DEGIL, ayri ve yetkilendirilmis bir
    // uctan cekiliyor. Kuyruk kaydinda guvensiz e-posta govdesi durmuyor.
    if (job.jobType === 'transport_order.extract') {
      const response = await fetch(
        `${API_BASE}/ordivan/connector/order-intake/messages/${job.payload?.messageId}/content`,
        { headers: { 'x-ordivan-credential': credential } },
      );
      if (!response.ok) {
        throw new Error(`order intake content fetch failed: ${response.status}`);
      }
      result = buildOrderExtraction(await response.json(), job);
      console.log(`[ordivan-mock] order intake extracted intent=${result.payload.intent}`);
    }

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
