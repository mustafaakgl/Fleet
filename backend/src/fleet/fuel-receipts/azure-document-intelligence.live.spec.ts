import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AzureDocumentIntelligenceFuelReceiptOcrProvider } from './azure-document-intelligence-fuel-receipt-ocr.provider';
import {
  ALLOWED_EU_REGIONS,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_AZURE_MODEL_ID,
  normalizeEndpoint,
} from './azure-document-intelligence.config';

/**
 * OPSIYONEL canli Azure kapisi.
 *
 * NORMAL TESTLER DIS AGA CIKMAZ. Bu dosya yalnizca `*_LIVE_*` degiskenleri
 * verildiginde calisir; verilmediginde ACIK BIR SEBEPLE atlanir — sessizce
 * gecen bir test, calismis gibi gorunup hicbir sey kanitlamazdi.
 *
 * NE SINANIR: baglanti, kimlik dogrulama, operasyon polling'i ve normalize
 * cevabin SEMASI. NE SINANMAZ: alan duzeyinde okuma dogrulugu. Sentetik bir
 * fisin kusursuz okunacagini varsaymak yanlis olurdu; dogruluk olcumu gercek
 * DE/TR fis veri setinin isi (bkz. docs/PILOT-LAUNCH-CHECKLIST.md, O8–O10).
 *
 * Gercek anahtar bu dosyaya, fixture'a ya da snapshot'a YAZILMAZ; yalnizca
 * ortamdan okunur.
 */

const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_LIVE_ENDPOINT?.trim();
const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_LIVE_API_KEY?.trim();
const region = process.env.AZURE_DOCUMENT_INTELLIGENCE_LIVE_REGION?.trim();

const configured = Boolean(endpoint && apiKey && region);
const skipReason =
  'AZURE_DOCUMENT_INTELLIGENCE_LIVE_{ENDPOINT,API_KEY,REGION} verilmedi — canli kapi atlandi.';

/**
 * Sentetik fis — KISISEL VERI ICERMEZ.
 *
 * Gercek bir fis kullanmak, test calistiran herkesin bir surucunun konumunu
 * ve odeme bilgisini Azure'a gondermesi demek olurdu.
 */
async function syntheticReceipt(text: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fleet-ocr-live-'));
  const file = join(dir, 'synthetic-receipt.pdf');

  // Minimal, gecerli tek sayfalik PDF. Harici bir uretici kutuphane
  // eklemiyoruz — canli kapinin amaci sozlesme, tipografi degil.
  const content = `BT /F1 12 Tf 40 760 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  await writeFile(file, pdf, 'latin1');
  return file;
}

describe('canli Azure kapisi', { skip: configured ? false : skipReason }, () => {
  const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider({
    endpoint: normalizeEndpoint(endpoint, true),
    apiKey: apiKey!,
    region: (region as (typeof ALLOWED_EU_REGIONS)[number]) ?? 'westeurope',
    modelId: DEFAULT_AZURE_MODEL_ID,
    apiVersion: DEFAULT_AZURE_API_VERSION,
    timeoutMs: 60_000,
  });

  it('bolge AB listesinde', () => {
    assert.ok(
      (ALLOWED_EU_REGIONS as readonly string[]).includes(region ?? ''),
      'canli kapi AB disi bir bolgeyle calistirilmamali',
    );
  });

  it('Almanca sentetik fisle baglanir ve sozlesmeye uyar', async () => {
    const file = await syntheticReceipt(
      'Tankstelle Musterstadt  Diesel  45,32 L  1,759 EUR/L  Gesamt 79,72 EUR',
    );
    const result = await provider.analyze({
      absolutePath: file,
      originalName: 'synthetic-de.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 0,
    });

    // BAGLANTI ve SEMA kapisi: model bu sentetik belgeden alan cikaramayabilir
    // ve bu bir BASARISIZLIK DEGIL. Sinanan sey, adaptorun her iki durumda da
    // sozlesmeye uygun bir sonuc dondurmesi.
    if (!result.ok) {
      assert.ok(
        ['unreadable', 'not_a_fuel_receipt'].includes(result.errorClass),
        `beklenmeyen hata sinifi: ${result.errorClass}`,
      );
      return;
    }

    const extraction = result.extraction;
    for (const field of ['stationName', 'liters', 'pricePerLiter', 'fuelGrossAmount'] as const) {
      assert.ok('value' in extraction[field], `${field} sozlesmeye uymali`);
      assert.ok('confidence' in extraction[field]);
    }
    assert.equal(typeof extraction.hasNonFuelItems, 'boolean');
    // Kart bilgisi ASLA tasinmaz.
    assert.ok(!JSON.stringify(extraction).includes('CardNumber'));
  });

  it('Turkce sentetik fisle baglanir ve sozlesmeye uyar', async () => {
    const file = await syntheticReceipt(
      'Petrol Ofisi Ornek  MOTORIN  50,00 L  49,015 TL/L  TOPLAM 2.450,75 TL',
    );
    const result = await provider.analyze({
      absolutePath: file,
      originalName: 'synthetic-tr.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 0,
    });

    if (!result.ok) {
      assert.ok(['unreadable', 'not_a_fuel_receipt'].includes(result.errorClass));
      return;
    }
    assert.equal(typeof result.extraction.hasNonFuelItems, 'boolean');
  });
});
