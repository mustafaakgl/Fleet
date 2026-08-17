import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AzureDocumentIntelligenceFuelReceiptOcrProvider } from './azure-document-intelligence-fuel-receipt-ocr.provider';
import {
  ALLOWED_EU_REGIONS,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_AZURE_MODEL_ID,
  normalizeEndpoint,
  resolveAzureDocumentIntelligenceConfig,
  type AzureDocumentIntelligenceConfig,
} from './azure-document-intelligence.config';
import { resolveFuelReceiptOcrProviderKind } from './fuel-receipt-ocr.config';

/**
 * Azure adaptoru — GERCEK bir yerel HTTP sunucusuna karsi.
 *
 * `fetch` mock'lanmadi: gercek sorular "hangi header'da ne gitti", "farkli
 * origin'e anahtar sizdi mi", "yonlendirme takip edildi mi" ve bunlarin
 * cevabi ancak GERCEK bir istek yapilirsa alinir. Dis aga CIKILMIYOR;
 * sunucu 127.0.0.1'de.
 */

const API_KEY = 'test-key-0123456789abcdef';

interface Recorded {
  method: string;
  url: string;
  key: string | undefined;
  contentType: string | undefined;
}

interface Stub {
  server: Server;
  origin: string;
  requests: Recorded[];
  close: () => Promise<void>;
}

async function startStub(
  handler: (req: IncomingMessage, res: ServerResponse, stub: { origin: string; requests: Recorded[] }) => void,
): Promise<Stub> {
  const requests: Recorded[] = [];
  const server = createServer((req, res) => {
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      key: req.headers['ocp-apim-subscription-key'] as string | undefined,
      contentType: req.headers['content-type'] as string | undefined,
    });
    handler(req, res, { origin, requests });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const origin = `http://127.0.0.1:${port}`;

  return {
    server,
    origin,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function receiptFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fleet-ocr-'));
  const file = join(dir, 'beleg.jpg');
  await writeFile(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
  return file;
}

function config(over: Partial<AzureDocumentIntelligenceConfig> = {}): AzureDocumentIntelligenceConfig {
  return {
    endpoint: 'http://127.0.0.1:1',
    apiKey: API_KEY,
    region: 'westeurope',
    modelId: DEFAULT_AZURE_MODEL_ID,
    apiVersion: DEFAULT_AZURE_API_VERSION,
    timeoutMs: 5_000,
    ...over,
  };
}

function input(absolutePath: string) {
  return { absolutePath, originalName: 'beleg.jpg', mimeType: 'image/jpeg', sizeBytes: 8 };
}

/** Basarili Azure govdesi — Alman dizel fisi. */
function germanDieselBody() {
  return {
    status: 'succeeded',
    analyzeResult: {
      documents: [
        {
          fields: {
            MerchantName: { valueString: 'Aral Tankstelle Duisburg', confidence: 0.95 },
            TransactionDate: { valueDate: '2026-08-13', confidence: 0.93 },
            TransactionTime: { valueTime: '08:42:00', confidence: 0.9 },
            Total: { valueCurrency: { amount: 79.72, currencyCode: 'EUR' }, content: '79,72 €', confidence: 0.97 },
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Description: { valueString: 'Diesel', confidence: 0.94 },
                    Quantity: { valueNumber: 45.32 },
                    Price: { valueNumber: 1.759 },
                    TotalPrice: { valueNumber: 79.72 },
                  },
                },
              ],
            },
          },
        },
      ],
    },
  };
}

const openStubs: Stub[] = [];
after(async () => {
  await Promise.all(openStubs.map((stub) => stub.close()));
});

async function stubFor(
  handler: Parameters<typeof startStub>[0],
): Promise<Stub> {
  const stub = await startStub(handler);
  openStubs.push(stub);
  return stub;
}

describe('saglayici secimi', () => {
  it('azure secilebilir', () => {
    assert.equal(
      resolveFuelReceiptOcrProviderKind('azure_document_intelligence', false),
      'azure_document_intelligence',
    );
  });

  it('azure URETIMDE de secilebilir', () => {
    assert.equal(
      resolveFuelReceiptOcrProviderKind('azure_document_intelligence', true),
      'azure_document_intelligence',
    );
  });

  it('mock uretimde HALA yasak', () => {
    assert.throws(() => resolveFuelReceiptOcrProviderKind('mock', true));
  });

  it('varsayilan DEGISMEDI — ucretli servis sessizce devreye girmez', () => {
    // DIKKAT: `undefined` gecmek fonksiyonun varsayilanini, yani
    // process.env'i tetikler. Bos string gercek "ayarlanmamis" durumudur.
    assert.equal(resolveFuelReceiptOcrProviderKind('', false), 'disabled');
  });

  it('taninmayan deger reddedilir', () => {
    assert.throws(() => resolveFuelReceiptOcrProviderKind('azure', false));
  });
});

describe('yapilandirma', () => {
  const base = {
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://fleet.cognitiveservices.azure.com',
    AZURE_DOCUMENT_INTELLIGENCE_API_KEY: API_KEY,
    AZURE_DOCUMENT_INTELLIGENCE_REGION: 'westeurope',
  };

  it('gecerli yapilandirmayi cozer', () => {
    const resolved = resolveAzureDocumentIntelligenceConfig(base as NodeJS.ProcessEnv, true);
    assert.equal(resolved.modelId, DEFAULT_AZURE_MODEL_ID);
    assert.equal(resolved.apiVersion, DEFAULT_AZURE_API_VERSION);
  });

  it('anahtar eksikse FAIL-FAST', () => {
    assert.throws(() =>
      resolveAzureDocumentIntelligenceConfig(
        { ...base, AZURE_DOCUMENT_INTELLIGENCE_API_KEY: '' } as NodeJS.ProcessEnv,
        true,
      ),
    );
  });

  it('endpoint eksikse FAIL-FAST', () => {
    assert.throws(() =>
      resolveAzureDocumentIntelligenceConfig(
        { ...base, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: '' } as NodeJS.ProcessEnv,
        true,
      ),
    );
  });

  it('hata mesaji ANAHTARI ICERMEZ', () => {
    try {
      resolveAzureDocumentIntelligenceConfig(
        { ...base, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'not-a-url' } as NodeJS.ProcessEnv,
        true,
      );
      assert.fail('firlatmaliydi');
    } catch (error) {
      assert.ok(!String(error).includes(API_KEY), 'anahtar hata mesajina sizmamali');
    }
  });

  it('uretimde HTTP endpoint reddedilir', () => {
    assert.throws(() => normalizeEndpoint('http://fleet.example.com', true));
    // Testte yerel stub'a izin var — adaptorun kendisi sinanabilsin diye.
    assert.equal(normalizeEndpoint('http://127.0.0.1:9', false), 'http://127.0.0.1:9');
  });

  it('endpoint sorgu dizesi tasiyamaz', () => {
    // Icinde anahtar tasiyan bir URL yanlislikla yapistirilirsa kullanilmasin.
    assert.throws(() => normalizeEndpoint('https://fleet.example.com?key=secret', true));
  });

  it('AB disi bolge reddedilir', () => {
    assert.throws(() =>
      resolveAzureDocumentIntelligenceConfig(
        { ...base, AZURE_DOCUMENT_INTELLIGENCE_REGION: 'eastus' } as NodeJS.ProcessEnv,
        true,
      ),
    );
    assert.ok(ALLOWED_EU_REGIONS.includes('westeurope'));
  });

  it('sondaki egik cizgi normalize edilir', () => {
    assert.equal(
      normalizeEndpoint('https://fleet.example.com/', true),
      'https://fleet.example.com',
    );
  });
});

describe('analyze ve polling', () => {
  it('basarili akis normalize okuma dondurur', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(germanDieselBody()));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    const result = await provider.analyze(input(await receiptFile()));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.extraction.stationName.value, 'Aral Tankstelle Duisburg');
    assert.equal(result.extraction.fuelProduct.value, 'DIESEL');
    assert.equal(result.extraction.liters.value, 45.32);
    assert.equal(result.extraction.pricePerLiter.value, 1.759);
    assert.equal(result.extraction.fuelGrossAmount.value, 79.72);
    assert.equal(result.extraction.currency.value, 'EUR');
    assert.equal(result.extraction.purchasedAt.value, '2026-08-13T08:42:00');
  });

  it('anahtar YALNIZCA header\'da gider, URL\'ye konmaz', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(germanDieselBody()));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    await provider.analyze(input(await receiptFile()));

    for (const request of stub.requests) {
      assert.equal(request.key, API_KEY, 'anahtar header\'da olmali');
      assert.ok(!request.url.includes(API_KEY), 'anahtar URL\'de OLMAMALI');
    }
  });

  it('sayfa siniri gonderilir — sayfa basina ucret', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(germanDieselBody()));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    await provider.analyze(input(await receiptFile()));

    const post = stub.requests.find((r) => r.method === 'POST');
    assert.ok(post?.url.includes('pages=1'), '30 sayfalik PDF icin 30 sayfa odenmemeli');
    assert.ok(post?.url.includes(`api-version=${DEFAULT_AZURE_API_VERSION}`));
  });

  it('FARKLI ORIGIN\'e anahtar GONDERILMEZ', async () => {
    // Ele gecirilmis bir yanit, Operation-Location ile anahtari disari
    // sizdirmaya calisabilir.
    const attacker = await stubFor((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(germanDieselBody()));
    });
    const stub = await stubFor((req, res) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${attacker.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(500).end();
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    const result = await provider.analyze(input(await receiptFile()));

    assert.equal(result.ok, false);
    assert.equal(attacker.requests.length, 0, 'saldirgan origin HIC istek almamali');
  });

  it('Operation-Location yoksa saglayici kullanilamaz sayilir', async () => {
    const stub = await stubFor((req, res) => {
      if (req.method === 'POST') {
        res.writeHead(202).end();
        return;
      }
      res.writeHead(500).end();
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    const result = await provider.analyze(input(await receiptFile()));
    assert.deepEqual(result, { ok: false, errorClass: 'provider_unavailable' });
  });

  it('yonlendirme TAKIP EDILMEZ', async () => {
    const elsewhere = await stubFor((_req, res) => {
      res.writeHead(202).end();
    });
    const stub = await stubFor((_req, res) => {
      res.writeHead(302, { location: `${elsewhere.origin}/analyze` }).end();
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    const result = await provider.analyze(input(await receiptFile()));

    assert.equal(result.ok, false);
    assert.equal(elsewhere.requests.length, 0, 'credential yonlendirmeyle tasinmamali');
  });

  it('401 saglayici reddi olarak siniflanir', async () => {
    const stub = await stubFor((_req, res) => res.writeHead(401).end());
    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    assert.deepEqual(await provider.analyze(input(await receiptFile())), {
      ok: false,
      errorClass: 'provider_rejected',
    });
  });

  it('400 okunamadi olarak siniflanir', async () => {
    const stub = await stubFor((_req, res) => res.writeHead(400).end());
    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin }),
    );
    assert.deepEqual(await provider.analyze(input(await receiptFile())), {
      ok: false,
      errorClass: 'unreadable',
    });
  });

  it('429 Retry-After ile TEK kontrollu tekrar yapar', async () => {
    let posts = 0;
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        posts += 1;
        if (posts === 1) {
          res.writeHead(429, { 'retry-after': '1' }).end();
          return;
        }
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(germanDieselBody()));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 10_000 }),
    );
    const result = await provider.analyze(input(await receiptFile()));

    assert.equal(result.ok, true);
    assert.equal(posts, 2, 'tam olarak bir kez tekrar denenmeli');
  });

  it('belirsiz ag hatasinda ANALYZE TEKRAR EDILMEZ — cift ucret', async () => {
    let posts = 0;
    const stub = await stubFor((req, res) => {
      if (req.method === 'POST') {
        posts += 1;
        // Baglantiyi yanitsiz kapat: istegin Azure'a ULASIP ulasmadigi belirsiz.
        req.socket.destroy();
        return;
      }
      res.writeHead(500).end();
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 5_000 }),
    );
    const result = await provider.analyze(input(await receiptFile()));

    assert.equal(result.ok, false);
    assert.equal(posts, 1, 'ayni sayfa iki kez faturalandirilmamali');
  });

  it('polling sirasinda gecici 5xx tolere edilir', async () => {
    let polls = 0;
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      polls += 1;
      if (polls < 3) {
        res.writeHead(503).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(germanDieselBody()));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 20_000 }),
    );
    const result = await provider.analyze(input(await receiptFile()));
    assert.equal(result.ok, true);
    assert.ok(polls >= 3);
  });

  it('running durumu sonuca kadar beklenir', async () => {
    let polls = 0;
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      polls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(polls < 2 ? { status: 'running' } : germanDieselBody()));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 20_000 }),
    );
    assert.equal((await provider.analyze(input(await receiptFile()))).ok, true);
  });

  it('failed durumu okunamadi olur', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'failed' }));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 10_000 }),
    );
    assert.deepEqual(await provider.analyze(input(await receiptFile())), {
      ok: false,
      errorClass: 'unreadable',
    });
  });

  it('BOZUK JSON uygulamayi cokertmez', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{ bu gecerli json degil');
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 10_000 }),
    );
    assert.deepEqual(await provider.analyze(input(await receiptFile())), {
      ok: false,
      errorClass: 'provider_unavailable',
    });
  });

  it('beklenen alanlar yoksa BOS okuma doner, patlamaz', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'succeeded', analyzeResult: {} }));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 10_000 }),
    );
    const result = await provider.analyze(input(await receiptFile()));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Manuel girise dusuluyor; hicbir alan uydurulmuyor.
    assert.equal(result.extraction.fuelGrossAmount.value, null);
    assert.equal(result.extraction.stationName.value, null);
  });

  it('ZAMAN ASIMINDA manuel girise duser', async () => {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      // Hic bitmeyen islem.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'running' }));
    });

    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 5_000 }),
    );
    const started = Date.now();
    const result = await provider.analyze(input(await receiptFile()));

    assert.equal(result.ok, false);
    assert.ok(Date.now() - started < 12_000, 'sonsuz polling olmamali');
  });

  it('yapilandirilmamis saglayici cagri YAPMAZ', async () => {
    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ apiKey: '' }),
    );
    assert.equal(provider.isConfigured(), false);
    assert.deepEqual(await provider.analyze(input(await receiptFile())), {
      ok: false,
      errorClass: 'not_configured',
    });
  });
});

describe('normalize okuma — karma ve TR fisleri', () => {
  async function analyzeBody(body: unknown) {
    const stub = await stubFor((req, res, ctx) => {
      if (req.method === 'POST') {
        res.setHeader('operation-location', `${ctx.origin}/op/1`);
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    const provider = new AzureDocumentIntelligenceFuelReceiptOcrProvider(
      config({ endpoint: stub.origin, timeoutMs: 10_000 }),
    );
    return provider.analyze(input(await receiptFile()));
  }

  it('KARMA fiste yalnizca yakit satiri maliyete onerilir', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Total: { valueCurrency: { amount: 92.22, currencyCode: 'EUR' }, confidence: 0.96 },
              Items: {
                valueArray: [
                  {
                    valueObject: {
                      Description: { valueString: 'Diesel', confidence: 0.94 },
                      Quantity: { valueNumber: 45.32 },
                      Price: { valueNumber: 1.759 },
                      TotalPrice: { valueNumber: 79.72 },
                    },
                  },
                  {
                    valueObject: {
                      Description: { valueString: 'Kaffee', confidence: 0.9 },
                      TotalPrice: { valueNumber: 2.5 },
                    },
                  },
                  {
                    valueObject: {
                      Description: { valueString: 'Autowäsche', confidence: 0.9 },
                      TotalPrice: { valueNumber: 10.0 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Fis toplami 92,22 ama araca yazilacak tutar YALNIZCA yakit satiri.
    assert.equal(result.extraction.fuelGrossAmount.value, 79.72);
    assert.equal(result.extraction.receiptGrossAmount.value, 92.22);
    assert.equal(result.extraction.hasNonFuelItems, true);
  });

  it('Turkce motorin fisi TRY ile okunur', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              MerchantName: { valueString: 'Petrol Ofisi Kadıköy', confidence: 0.92 },
              Total: { content: '2.450,75 TL', confidence: 0.9 },
              Items: {
                valueArray: [
                  {
                    valueObject: {
                      Description: { valueString: 'MOTORIN', confidence: 0.91 },
                      Quantity: { content: '50,00' },
                      Price: { content: '49,015' },
                      TotalPrice: { content: '2.450,75' },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.extraction.fuelProduct.value, 'DIESEL');
    assert.equal(result.extraction.currency.value, 'TRY');
    assert.equal(result.extraction.liters.value, 50);
    assert.equal(result.extraction.fuelGrossAmount.value, 2450.75);
  });

  it('BELIRSIZ urun kesinlestirilmez, ham etiket tasinir', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Items: {
                valueArray: [
                  {
                    valueObject: {
                      Description: { valueString: 'Kurşunsuz 95', confidence: 0.9 },
                      TotalPrice: { valueNumber: 60 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.extraction.fuelProduct.value, null, 'E5/E10 uydurulmamali');
    assert.equal(result.extraction.rawFuelLabel, 'Kurşunsuz 95');
  });

  it('birden fazla yakit satirinda hicbiri kesinlestirilmez', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Items: {
                valueArray: [
                  { valueObject: { Description: { valueString: 'Diesel' }, TotalPrice: { valueNumber: 50 } } },
                  { valueObject: { Description: { valueString: 'Super E10' }, TotalPrice: { valueNumber: 40 } } },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.extraction.fuelGrossAmount.value, null);
    assert.equal(result.extraction.fuelProduct.value, null);
    assert.ok(result.extraction.rawFuelLabel?.includes('Diesel'));
  });

  it('litre x fiyat tutmuyorsa deger DUZELTILMEZ, guven dusurulur', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Items: {
                valueArray: [
                  {
                    valueObject: {
                      Description: { valueString: 'Diesel', confidence: 0.95 },
                      Quantity: { valueNumber: 45.32 },
                      Price: { valueNumber: 1.759 },
                      TotalPrice: { valueNumber: 12.5 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Deger AYNEN duruyor — sunucu sessizce duzeltmiyor.
    assert.equal(result.extraction.fuelGrossAmount.value, 12.5);
    assert.equal(result.extraction.fuelGrossAmount.confidence, null, 'guven dusurulmeli');
  });

  it('AdBlue yakit satiri olarak SECILMEZ', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Items: {
                valueArray: [
                  {
                    valueObject: {
                      Description: { valueString: 'Diesel' },
                      Quantity: { valueNumber: 40 },
                      Price: { valueNumber: 1.7 },
                      TotalPrice: { valueNumber: 68 },
                    },
                  },
                  {
                    valueObject: {
                      Description: { valueString: 'AdBlue 10L' },
                      TotalPrice: { valueNumber: 9.9 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.extraction.fuelProduct.value, 'DIESEL');
    assert.equal(result.extraction.fuelGrossAmount.value, 68);
  });

  it('para birimi kaniti yoksa UYDURULMAZ', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Total: { valueNumber: 79.72, confidence: 0.9 },
              Items: {
                valueArray: [
                  { valueObject: { Description: { valueString: 'Diesel' }, TotalPrice: { valueNumber: 79.72 } } },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.extraction.currency.value, null, 'surucu secmeli');
  });

  it('odeme karti bilgisi normalize modele TASINMAZ', async () => {
    const result = await analyzeBody({
      status: 'succeeded',
      analyzeResult: {
        documents: [
          {
            fields: {
              Total: { valueNumber: 79.72 },
              CountryRegion: { valueString: 'DEU' },
              // Azure bazi fislerde bunu dondurur — SAKLANMAMALI.
              PaymentDetails: {
                valueArray: [
                  { valueObject: { CardNumber: { valueString: '**** **** **** 4242' } } },
                ],
              },
            },
          },
        ],
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.extraction);
    assert.ok(!serialized.includes('4242'), 'kart bilgisi normalize modelde OLMAMALI');
    assert.ok(!serialized.includes('CardNumber'));
  });
});
