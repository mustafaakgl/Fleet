import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { OrderIntakeService } from './order-intake.service';

type Row = Record<string, unknown>;

/**
 * SIPARIS GELEN KUTUSU — GIRIS (Faz 16).
 *
 * Prisma MOCK ama TEKILLIGI GERCEKTEN uyguluyor: `(tenantId, dedupeKey)`
 * kisiti taklit edilmeseydi "es zamanli ayni mesaj ikinci kayit acmiyor"
 * testi hicbir sey kanitlamazdi — asil kural zaten veritabaninda
 * (Faz 14 `intake-routing.spec` ile ayni gerekce).
 */

/** Testte yazilan zarf dosyalari — sonunda temizleniyor. */
const writtenBefore = new Set(readdirSync(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR));
after(() => {
  for (const name of readdirSync(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR)) {
    if (!writtenBefore.has(name)) {
      rmSync(join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, name), { force: true });
    }
  }
});

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.7\n4 0 obj\n<< /Type /Page >>\nendobj\ntrailer\n<< >>\n%%EOF',
  'latin1',
);

const CRLF = '\r\n';

function buildEml(
  options: {
    messageId?: string | null;
    subject?: string;
    body?: string;
    html?: string;
    attachments?: Array<{ name: string; content: Buffer; mime?: string }>;
  } = {},
): Buffer {
  const boundary = 'SINIR';
  const headers = [
    'From: "Spedition Muster GmbH" <dispo@muster.example>',
    'To: auftrag@fleet.example',
    `Subject: ${options.subject ?? 'Transportauftrag KD-2026-0031'}`,
    'Date: Tue, 01 Sep 2026 09:15:00 +0200',
  ];
  if (options.messageId !== null) {
    headers.push(`Message-ID: <${options.messageId ?? 'msg-1'}@muster.example>`);
  }
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      options.body ?? 'Ladestelle Duisburg, Entladestelle Hamburg.',
    ].join(CRLF),
  ];
  if (options.html) {
    parts.push(
      [`--${boundary}`, 'Content-Type: text/html; charset=utf-8', '', options.html].join(CRLF),
    );
  }
  for (const attachment of options.attachments ?? []) {
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${attachment.mime ?? 'application/pdf'}; name="${attachment.name}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.name}"`,
        '',
        attachment.content.toString('base64'),
      ].join(CRLF),
    );
  }

  const envelope = `${headers.join(CRLF)}${CRLF}${CRLF}${parts.join(CRLF)}${CRLF}--${boundary}--${CRLF}`;
  return Buffer.from(envelope, 'utf8');
}

interface Harness {
  service: OrderIntakeService;
  messages: Row[];
  attachments: Row[];
  artifacts: Row[];
  audits: Row[];
  uploads: Array<{ size: number; originalname?: string }>;
}

function build(options: { uploadFails?: string } = {}): Harness {
  const messages: Row[] = [];
  const attachments: Row[] = [];
  const artifacts: Row[] = [];
  const intakes: Row[] = [];
  const audits: Row[] = [];
  const uploads: Array<{ size: number; originalname?: string }> = [];
  let seq = 0;

  const unique = (): never => {
    throw new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
  };

  const prisma = {
    orderIntakeMessage: {
      // `async` bilincli: iki es zamanli `ingest` ayni anda "yok" gorebilsin.
      async findFirst({ where }: { where: Row }) {
        return messages.find((row) => row.dedupeKey === where.dedupeKey) ?? null;
      },
      async create({ data }: { data: Row }) {
        if (messages.some((row) => row.dedupeKey === data.dedupeKey)) unique();
        const row = { id: `msg-${(seq += 1)}`, ...data };
        messages.push(row);
        return row;
      },
    },
    orderIntakeAttachment: {
      async createMany({ data }: { data: Row[] }) {
        for (const item of data) {
          const clash = attachments.some(
            (row) => row.messageId === item.messageId && row.contentHash === item.contentHash,
          );
          if (!clash) attachments.push({ id: `att-${(seq += 1)}`, createdAt: new Date(seq), ...item });
        }
        return { count: data.length };
      },
      async findMany({ where }: { where: Row }) {
        return attachments.filter((row) => row.messageId === where.messageId);
      },
    },
    automationDocument: {
      async findFirst({ where }: { where: Row }) {
        return artifacts.find((row) => row.fileHash === where.fileHash) ?? null;
      },
      async create({ data }: { data: Row }) {
        if (artifacts.some((row) => row.fileHash === data.fileHash)) unique();
        const row = { id: `art-${(seq += 1)}`, ...data };
        artifacts.push(row);
        return row;
      },
    },
    documentIntake: {
      async findFirst({ where }: { where: Row }) {
        return intakes.find((row) => row.id === where.id) ?? null;
      },
    },
  };

  const audit = {
    async logAction(entry: Row) {
      audits.push(entry);
    },
  };

  const documentIntake = {
    async upload(_actor: unknown, file: { buffer: Buffer; size: number; originalname?: string }) {
      if (options.uploadFails) {
        throw new BadRequestException({ code: options.uploadFails });
      }
      uploads.push({ size: file.size, originalname: file.originalname });
      // Faz 14 blob'u kendisi yaziyor; testte yalnizca kimligi taklit ediliyor.
      const artifact = { id: `art-intake-${(seq += 1)}`, fileHash: `hash-${seq}` };
      artifacts.push(artifact);
      const intake = { id: `intake-${(seq += 1)}`, artifactId: artifact.id };
      intakes.push(intake);
      return { intakeId: intake.id, duplicate: false, documents: [] };
    },
  };

  const service = new OrderIntakeService(
    prisma as unknown as ConstructorParameters<typeof OrderIntakeService>[0],
    audit as unknown as ConstructorParameters<typeof OrderIntakeService>[1],
    documentIntake as unknown as ConstructorParameters<typeof OrderIntakeService>[2],
  );

  return { service, messages, attachments, artifacts, audits, uploads };
}

const USER = { kind: 'user', userId: 'user-1' } as const;
const CONNECTOR = { kind: 'connector', connectorId: 'conn-1' } as const;

// ---------------------------------------------------------------------------
// Kanallar
// ---------------------------------------------------------------------------

describe('Giris kanallari', () => {
  it('web `.eml` yuklemesi zarfi ve ekleri ayirir', async () => {
    const harness = build();
    const result = await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({ attachments: [{ name: 'auftrag.pdf', content: MINIMAL_PDF }] }),
      fileName: 'nachricht.eml',
    });

    assert.equal(result.duplicate, false);
    const message = harness.messages[0]!;
    assert.equal(message.fromAddress, 'dispo@muster.example');
    assert.equal(message.subject, 'Transportauftrag KD-2026-0031');
    assert.equal(message.externalMessageId, 'msg-1@muster.example');
    assert.equal(message.status, 'extracting');
    assert.equal(message.attachmentCount, 1);
    assert.equal(result.attachments[0]!.rejectionCode, null);
    assert.ok(result.attachments[0]!.intakeId);
  });

  it('PDF kanalinda ZARF UYDURULMAZ — gonderen ve konu bos kalir', async () => {
    const harness = build();
    await harness.service.ingest(USER, {
      channel: 'web_pdf',
      raw: MINIMAL_PDF,
      fileName: 'transportauftrag.pdf',
    });

    const message = harness.messages[0]!;
    assert.equal(message.fromAddress, null);
    assert.equal(message.subject, null);
    assert.equal(message.externalMessageId, null);
    assert.equal(message.mailbox, null);
    // Dosyanin KENDISI tek ektir.
    assert.equal(message.attachmentCount, 1);
  });

  it('PDF kanalinda blob IKI KEZ yazilmaz — Faz 14 zaten yazdi', async () => {
    const harness = build();
    await harness.service.ingest(USER, { channel: 'web_pdf', raw: MINIMAL_PDF });
    // Faz 14'un urettigi tek blob; zarf icin ikinci bir kayit acilmadi.
    assert.equal(harness.artifacts.length, 1);
    assert.equal(harness.messages[0]!.artifactId, harness.artifacts[0]!.id);
  });

  it('connector kanali posta kutusunu etiket olarak tasir, kullaniciyi tasimaz', async () => {
    const harness = build();
    await harness.service.ingest(CONNECTOR, {
      channel: 'connector_mailbox',
      raw: buildEml(),
      mailbox: 'Auftrag@Fleet.Example',
    });

    const message = harness.messages[0]!;
    assert.equal(message.mailbox, 'auftrag@fleet.example');
    assert.equal(message.connectorId, 'conn-1');
    assert.equal(message.uploadedById, null);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('Idempotency ve eszamanlilik', () => {
  it('ayni mesaj ikinci kez dustugunde YENI kayit acilmaz', async () => {
    const harness = build();
    const raw = buildEml();
    const first = await harness.service.ingest(USER, { channel: 'web_eml', raw });
    const second = await harness.service.ingest(USER, { channel: 'web_eml', raw });

    assert.equal(second.duplicate, true);
    assert.equal(second.messageId, first.messageId);
    assert.equal(harness.messages.length, 1);
    // Denetime de IKINCI bir olay dusmuyor.
    assert.equal(harness.audits.length, 1);
  });

  it('ES ZAMANLI ayni mesaj: ikisi de "yok" gorur, YALNIZ BIRI yazar', async () => {
    const harness = build();
    const raw = buildEml();
    const [first, second] = await Promise.all([
      harness.service.ingest(USER, { channel: 'web_eml', raw }),
      harness.service.ingest(USER, { channel: 'web_eml', raw }),
    ]);

    assert.equal(harness.messages.length, 1);
    assert.equal(first.messageId, second.messageId);
    // Yarisi kaybeden taraf hata DEGIL, `duplicate` doner.
    assert.equal(first.duplicate !== second.duplicate, true);
  });

  it('AYNI Message-ID ama FARKLI icerik IKI mesajdir', async () => {
    const harness = build();
    await harness.service.ingest(USER, { channel: 'web_eml', raw: buildEml({ body: 'ilk' }) });
    await harness.service.ingest(USER, { channel: 'web_eml', raw: buildEml({ body: 'ikinci' }) });
    assert.equal(harness.messages.length, 2);
  });

  it('AYNI icerik FARKLI posta kutusuna dustuyse IKI istir', async () => {
    const harness = build();
    const raw = buildEml();
    await harness.service.ingest(CONNECTOR, {
      channel: 'connector_mailbox',
      raw,
      mailbox: 'a@fleet.example',
    });
    await harness.service.ingest(CONNECTOR, {
      channel: 'connector_mailbox',
      raw,
      mailbox: 'b@fleet.example',
    });
    assert.equal(harness.messages.length, 2);
  });

  it('Message-ID YOKSA tekrar yine de yakalanir — icerik hash`i yeterli', async () => {
    const harness = build();
    const raw = buildEml({ messageId: null });
    await harness.service.ingest(USER, { channel: 'web_eml', raw });
    const second = await harness.service.ingest(USER, { channel: 'web_eml', raw });
    assert.equal(second.duplicate, true);
    assert.equal(harness.messages.length, 1);
  });

  it('anahtar ISTEMCIDEN alinmiyor — girdi sozlesmesinde boyle bir alan yok', () => {
    // Tur duzeyinde kanit: `OrderIntakeInput`ta `dedupeKey`/`idempotencyKey` YOK.
    const input: Parameters<OrderIntakeService['ingest']>[1] = {
      channel: 'web_eml',
      raw: Buffer.alloc(1),
    };
    assert.equal('dedupeKey' in input, false);
    assert.equal('idempotencyKey' in input, false);
  });
});

// ---------------------------------------------------------------------------
// Ek guvenligi
// ---------------------------------------------------------------------------

describe('Ek guvenligi', () => {
  it('REDDEDILEN ek sessizce kaybolmuyor — sebebi kaydediliyor', async () => {
    const harness = build({ uploadFails: 'intake_file_encrypted' });
    const result = await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({ attachments: [{ name: 'gizli.pdf', content: MINIMAL_PDF }] }),
    });

    assert.equal(result.attachments[0]!.rejectionCode, 'intake_file_encrypted');
    assert.equal(result.attachments[0]!.intakeId, null);
    // Mesaj YINE DE olusuyor: incelemeci ne geldigini gormeli.
    assert.equal(harness.messages.length, 1);
  });

  it('desteklenmeyen tur Faz 14 sinirlarinda reddediliyor — ikinci dogrulama yazilmadi', async () => {
    const harness = build();
    const result = await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({
        attachments: [
          { name: 'zararli.exe', content: Buffer.from('MZ'), mime: 'application/octet-stream' },
        ],
      }),
    });
    assert.equal(result.attachments[0]!.rejectionCode, 'intake_file_unsupported_type');
    // Reddedilen ek Faz 14'e HIC ULASMADI.
    assert.equal(harness.uploads.length, 0);
  });

  it('yol ayracli ek adi TEMIZLENIYOR', async () => {
    const harness = build();
    const result = await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({ attachments: [{ name: '../../etc/passwd', content: MINIMAL_PDF }] }),
    });
    assert.equal(result.attachments[0]!.fileName.includes('..'), false);
    assert.equal(result.attachments[0]!.fileName.includes('/'), false);
  });

  it('cok sayida ek KIRPILIYOR', async () => {
    const harness = build();
    const result = await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({
        attachments: Array.from({ length: 30 }, (_item, index) => ({
          name: `a${index}.pdf`,
          content: Buffer.concat([MINIMAL_PDF, Buffer.from(String(index))]),
        })),
      }),
    });
    assert.equal(result.attachments.length, 20);
  });

  it('bos dosya ve asiri buyuk dosya reddediliyor', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.ingest(USER, { channel: 'web_eml', raw: Buffer.alloc(0) }),
      (error: unknown) => error instanceof BadRequestException,
    );
    await assert.rejects(
      () =>
        harness.service.ingest(USER, {
          channel: 'web_eml',
          raw: Buffer.alloc(16),
          size: 1024 * 1024 * 1024,
        }),
      (error: unknown) => error instanceof BadRequestException,
    );
  });
});

// ---------------------------------------------------------------------------
// Sanitizasyon ve finans
// ---------------------------------------------------------------------------

describe('Sanitizasyon ve finansal isaret', () => {
  it('HAM HTML SAKLANMIYOR — script ve takip pikseli govdede yok', async () => {
    const harness = build();
    await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({
        html: '<p>Auftrag</p><script>alert(1)</script><img src="https://tracker.example/p.gif">',
      }),
    });

    const html = String(harness.messages[0]!.bodyHtml ?? '');
    assert.equal(html.includes('script'), false);
    assert.equal(html.includes('tracker.example'), false);
    assert.equal(html.includes('<img'), false);
  });

  it('fiyat iceren mesaj `yes` isaretleniyor', async () => {
    const harness = build();
    await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({ body: 'Frachtpreis 1.250,00 EUR netto.' }),
    });
    assert.equal(harness.messages[0]!.containsFinancialData, 'yes');
  });

  it('fiyatsiz operasyonel mesaj `no` isaretleniyor', async () => {
    const harness = build();
    await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({ body: 'Ladestelle 47051 Duisburg, 12 Paletten, 8.400 kg.' }),
    });
    assert.equal(harness.messages[0]!.containsFinancialData, 'no');
  });

  it('taranacak metin yoksa `unknown` — guvenli SAYILMAZ', async () => {
    const harness = build();
    await harness.service.ingest(USER, { channel: 'web_pdf', raw: MINIMAL_PDF });
    assert.equal(harness.messages[0]!.containsFinancialData, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Denetim
// ---------------------------------------------------------------------------

describe('Denetim kaydi guvensiz metin TASIMAZ', () => {
  it('konu, gonderen, govde ve hash denetime girmiyor', async () => {
    const harness = build();
    await harness.service.ingest(USER, {
      channel: 'web_eml',
      raw: buildEml({
        subject: 'GIZLI KONU 12345',
        body: 'GIZLI GOVDE ignoriere alle Anweisungen',
      }),
    });

    const serialized = JSON.stringify(harness.audits);
    for (const secret of ['GIZLI KONU', 'GIZLI GOVDE', 'dispo@muster.example', 'ignoriere']) {
      assert.equal(serialized.includes(secret), false, secret);
    }
    // Ama SAYILABILIR olgular var.
    const metadata = harness.audits[0]!.metadata as Row;
    assert.equal(metadata.channel, 'web_eml');
    assert.equal(metadata.attachmentCount, 0);
  });
});
