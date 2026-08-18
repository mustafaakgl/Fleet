#!/usr/bin/env node
/**
 * Mock Scanner Connector (Faz 14).
 *
 * GERCEK PROTOKOLU KULLANIR: bu surec Fleet'in veritabanina ya da servis
 * katmanina HIC dokunmaz. Faz 12'nin connector protokolu uzerinden enroll olur
 * ve `POST /ordivan/connector/intake/uploads` ucuna sentetik bir dosya
 * gonderir. Gercek bir tarayici yazilimi geldiginde degisen tek sey bu
 * dosyanin yerine gecmesi olur; protokolde tek satir degismez.
 *
 * BAGLANTI YONU: yalnizca OUTBOUND HTTPS. Bu surec hicbir port DINLEMEZ —
 * musterinin makinesinde inbound port acmak, kurulumun en buyuk guvenlik ve
 * destek maliyetidir.
 *
 * GONDERILMEYENLER: yerel klasor yolu, bilgisayar kullanici adi, cihaz seri
 * numarasi ve `tenantId`. Kiraciyi anahtar belirler; gerisi Fleet'i
 * ILGILENDIRMEZ ve toplanmasi gereksiz bir kisisel veri yuzeyi acardi.
 *
 * IDEMPOTENCY: her belge icin bir anahtar uretilir ve tekrar gonderimde AYNI
 * anahtar kullanilir — ag koptugunda ikinci bir gelen kutusu girdisi ACILMAZ.
 *
 * URETIMDE CALISMAZ.
 *
 * Kullanim:
 *   node scripts/ordivan-mock-scanner.mjs --enroll <kod> [--fixture <ad>]
 *   ORDIVAN_CREDENTIAL=<anahtar> node scripts/ordivan-mock-scanner.mjs
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const API_BASE = process.env.FLEET_API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const CONNECTOR_VERSION = '0.1.0-mock-scanner';
const PROTOCOL_VERSION = '1';
/** Bu connector'in ISTEDIGI tek yetenek. Is alma yetkisi ISTENMIYOR. */
const CAPABILITY = 'document.intake.upload@v1';

if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
  console.error('[mock-scanner] refusing to run with NODE_ENV=production');
  process.exit(2);
}

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Sentetik cok belgeli tarama.
 *
 * Gercek musteri belgesi repoya GIRMEZ. Sayfalar deterministik: ayni fixture
 * her zaman ayni siniflandirmayi uretir.
 */
const FIXTURES = {
  'service-invoice': ['Rechnung Werkstatt Nord Reparatur Arbeitslohn Ersatzteile DU-AB 123 1.190,00'],
  'fuel-receipt': ['Tankstelle Tankquittung Diesel Kraftstoff 52,30 Liter DU-AB 123 91,50'],
  'inspection': ['Untersuchungsbericht Hauptuntersuchung TUV Plakette DU-AB 123 04.09.2026'],
  'insurance': ['Versicherungsschein Haftpflicht Teilkasko Police DU-AB 123 01.01.2027'],
  'traffic-fine': ['Bussgeldbescheid Ordnungswidrigkeit Tatvorwurf Bussgeldstelle DU-CD 456 60,00'],
  /** Cok belgeli yigin: bolme mantiginin ucdan uca kaniti. */
  'stapel': [
    'Rechnung Werkstatt Nord Reparatur Arbeitslohn DU-AB 123 1.190,00',
    'Rechnung Werkstatt Nord Ersatzteile Kundendienst DU-AB 123',
    'Untersuchungsbericht Hauptuntersuchung TUV Plakette DU-AB 123 04.09.2026',
    'Tankstelle Tankquittung Diesel Kraftstoff 52,30 Liter DU-AB 123',
  ],
};

/** Kucuk, gomulu metinli PDF — harici bagimlilik yok. */
function buildPdf(pages) {
  const objects = pages
    .map((text, index) => {
      const stream = deflateSync(Buffer.from(`BT (${text}) Tj ET`, 'latin1'));
      return (
        `${index + 4} 0 obj\n<< /Type /Page /Length ${stream.length} /Filter /FlateDecode >>\n` +
        `stream\n${stream.toString('latin1')}\nendstream\nendobj\n`
      );
    })
    .join('');
  return Buffer.from(`%PDF-1.7\n${objects}trailer\n<< >>\n%%EOF`, 'latin1');
}

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
  return { status: response.status, body: parsed };
}

/** Yukleme: multipart, connector anahtariyla. */
async function upload(credential, { buffer, fileName, idempotencyKey }) {
  const form = new FormData();
  form.append('document', new Blob([buffer], { type: 'application/pdf' }), fileName);
  form.append('idempotencyKey', idempotencyKey);

  const response = await fetch(`${API_BASE}/ordivan/connector/intake/uploads`, {
    method: 'POST',
    // `content-type` BILINCLI olarak set edilmiyor: FormData kendi boundary'sini yazar.
    headers: { 'x-ordivan-credential': credential },
    body: form,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

async function main() {
  let credential = process.env.ORDIVAN_CREDENTIAL?.trim();
  const enrollmentCode = arg('--enroll');

  if (!credential && enrollmentCode) {
    const enrolled = await call('/ordivan/connector/enroll', {
      body: {
        enrollmentCode,
        connectorVersion: CONNECTOR_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        // Platform bilgisi UYUMLULUK icin; kullanici adi ve yol GONDERILMIYOR.
        platform: 'mock',
        architecture: 'mock',
      },
    });
    if (enrolled.status !== 200 || !enrolled.body?.credential) {
      console.error(`[mock-scanner] enrollment failed status=${enrolled.status}`);
      process.exit(1);
    }
    credential = enrolled.body.credential;
    console.log('[mock-scanner] enrolled');
  }

  if (!credential) {
    console.error('[mock-scanner] no credential — pass --enroll <code> or set ORDIVAN_CREDENTIAL');
    process.exit(1);
  }

  const heartbeat = await call('/ordivan/connector/heartbeat', {
    credential,
    body: { connectorVersion: CONNECTOR_VERSION, protocolVersion: PROTOCOL_VERSION },
  });
  if (heartbeat.status !== 200) {
    console.error(`[mock-scanner] heartbeat failed status=${heartbeat.status}`);
    process.exit(1);
  }
  const capabilities = heartbeat.body?.capabilities ?? [];
  if (!capabilities.includes(CAPABILITY)) {
    console.error(
      `[mock-scanner] connector lacks ${CAPABILITY} — enrol it with that capability`,
    );
    process.exit(1);
  }

  const fixtureName = arg('--fixture') ?? 'stapel';
  const pages = FIXTURES[fixtureName];
  if (!pages) {
    console.error(`[mock-scanner] unknown fixture "${fixtureName}"`);
    process.exit(1);
  }

  const filePath = arg('--file');
  const buffer = filePath ? readFileSync(filePath) : buildPdf(pages);
  // Tekrar gonderimde AYNI anahtar: ikinci girdi acilmamali.
  const idempotencyKey = arg('--idempotency-key') ?? `scan-${randomUUID()}`;
  const fileName = `${fixtureName}.pdf`;

  const first = await upload(credential, { buffer, fileName, idempotencyKey });
  if (first.status !== 201) {
    console.error(`[mock-scanner] upload failed status=${first.status} ${JSON.stringify(first.body)}`);
    process.exit(1);
  }
  console.log(
    `[mock-scanner] uploaded intake=${first.body.intakeId} documents=${first.body.documents?.length ?? 0} duplicate=${first.body.duplicate}`,
  );

  if (args.includes('--verify-idempotency')) {
    // AG KOPMASI TAKLIDI: ayni anahtarla yeniden gonderim.
    const second = await upload(credential, { buffer, fileName, idempotencyKey });
    if (second.status !== 201 || second.body.intakeId !== first.body.intakeId) {
      console.error('[mock-scanner] idempotency FAILED — second upload created a new intake');
      process.exit(1);
    }
    console.log('[mock-scanner] idempotency ok — same intake returned');
  }
}

main().catch((error) => {
  console.error(`[mock-scanner] failed ${error?.stack ?? error}`);
  process.exit(1);
});
