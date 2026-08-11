import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { CompanyEmailsService } from './company-emails.service';

/**
 * 18:00 cron yolunun davranisi.
 *
 * Bu yolun daha once hic testi yoktu ve uc sorunu vardi: taslagi uretir uretmez
 * gonderiyordu, elle duzenlenmis metni eziyordu ve zaten gonderilmis bir postayi
 * ikinci kez yolluyordu. Asagidaki testler ucunu de sabitler.
 */

type Draft = {
  id: string;
  status: string;
  recipientEmail?: string | null;
  lastSentAt?: Date | null;
};

function buildService(drafts: Draft[]) {
  const service = new CompanyEmailsService(
    {} as never,
    { logAction: async () => undefined } as never,
    {} as never,
  );

  const sent: string[] = [];
  const patched = service as unknown as {
    generateDraftsForDate: () => Promise<Draft[]>;
    sendEmail: (id: string) => Promise<{ mail_sent: boolean; mail_mode: string }>;
    markAsDraftReady: (id: string) => Promise<unknown>;
    markAsFailed: (id: string) => Promise<unknown>;
  };

  patched.generateDraftsForDate = async () => drafts;
  patched.sendEmail = async (id) => {
    sent.push(id);
    return { mail_sent: true, mail_mode: 'smtp' };
  };
  patched.markAsDraftReady = async () => undefined;
  patched.markAsFailed = async () => undefined;

  return { service, sent };
}

describe('runScheduledEmailsForDate', () => {
  beforeEach(() => {
    delete process.env.COMPANY_EMAIL_AUTO_SEND;
  });

  it('only prepares drafts when auto-send is not configured', async () => {
    const { service, sent } = buildService([
      { id: 'a', status: 'draft', recipientEmail: 'a@example.com' },
    ]);

    const result = await service.runScheduledEmailsForDate('2026-08-12');

    assert.deepEqual(sent, [], 'varsayilan davranis posta gondermemeli');
    assert.equal(result.autoSend, false);
    assert.equal(result.draftsCreated, 1);
    assert.equal(result.skipped, 1);
  });

  it('sends when auto-send is switched on explicitly', async () => {
    process.env.COMPANY_EMAIL_AUTO_SEND = 'true';
    const { service, sent } = buildService([
      { id: 'a', status: 'draft', recipientEmail: 'a@example.com' },
    ]);

    const result = await service.runScheduledEmailsForDate('2026-08-12');

    assert.deepEqual(sent, ['a']);
    assert.equal(result.sent, 1);
  });

  it('never sends a second time to a company that already got the mail', async () => {
    // Yeniden uretim durumu needs_review'a cekiyor; "sent" damgasina bakan eski
    // kontrol bu satiri kaciriyordu ve musteri postayi iki kez aliyordu.
    process.env.COMPANY_EMAIL_AUTO_SEND = 'true';
    const { service, sent } = buildService([
      {
        id: 'already-sent',
        status: 'needs_review',
        recipientEmail: 'a@example.com',
        lastSentAt: new Date('2026-08-11T12:00:00Z'),
      },
      { id: 'fresh', status: 'draft', recipientEmail: 'b@example.com' },
    ]);

    const result = await service.runScheduledEmailsForDate('2026-08-12');

    assert.deepEqual(sent, ['fresh']);
    assert.equal(result.skipped, 1);
  });

  it('marks a draft without a recipient as failed instead of sending', async () => {
    process.env.COMPANY_EMAIL_AUTO_SEND = 'true';
    const { service, sent } = buildService([{ id: 'a', status: 'draft', recipientEmail: '  ' }]);

    const result = await service.runScheduledEmailsForDate('2026-08-12');

    assert.deepEqual(sent, []);
    assert.equal(result.failed, 1);
  });
});

describe('generateDraftForCompany', () => {
  /** Var olan bir kayit uzerinde yeniden uretim calistirir, yazilan alanlari dondurur. */
  async function regenerateOver(existing: Record<string, unknown>) {
    let written: Record<string, unknown> = {};

    const prisma = {
      company: {
        findUnique: async () => ({ id: 'c1', name: 'Alpha GmbH', email: 'alpha@example.com' }),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          companyEmail: {
            findUnique: async () => existing,
            update: async ({ data }: { data: Record<string, unknown> }) => {
              written = data;
              return { id: 'e1', ...data };
            },
          },
        }),
    };

    const service = new CompanyEmailsService(
      prisma as never,
      { logAction: async () => undefined } as never,
      {} as never,
    );

    (
      service as unknown as { loadCompanyAssignmentsForDate: () => Promise<unknown[]> }
    ).loadCompanyAssignmentsForDate = async () => [
      {
        companyId: 'c1',
        company: { name: 'Alpha GmbH' },
        driver: { firstName: 'Max', lastName: 'Mustermann' },
        vehicle: { plateNumber: 'B-XY-123' },
        startTime: '07:00',
        routeName: 'Berlin - Hamburg',
        cargoName: 'Paletten',
        pickupAddress: 'Berlin',
        deliveryAddress: 'Hamburg',
      },
    ];

    await service.generateDraftForCompany('2026-08-12', 'c1');
    return written;
  }

  it('keeps text a human edited and only asks for a review', async () => {
    const written = await regenerateOver({
      id: 'e1',
      subject: 'Elle yazilmis konu',
      body: 'Elle yazilmis govde',
      manuallyEditedAt: new Date('2026-08-11T16:00:00Z'),
    });

    assert.equal(written.subject, undefined, 'elle yazilan konu ezilmemeli');
    assert.equal(written.body, undefined, 'elle yazilan govde ezilmemeli');
    assert.equal(written.status, 'needs_review');
    assert.equal(written.recipientEmail, 'alpha@example.com', 'adres yine de tazelenmeli');
  });

  it('refreshes text that nobody touched', async () => {
    const written = await regenerateOver({
      id: 'e1',
      subject: 'Uretilmis konu',
      body: 'Uretilmis govde',
      manuallyEditedAt: null,
    });

    assert.ok(typeof written.subject === 'string' && written.subject.length > 0);
    assert.ok(typeof written.body === 'string' && written.body.includes('Mustermann'));
    assert.equal(written.status, 'needs_review');
  });
});

describe('sendEmail resend guard', () => {
  function serviceWith(row: Record<string, unknown>) {
    const service = new CompanyEmailsService(
      {} as never,
      { logAction: async () => undefined } as never,
      {} as never,
    );
    (service as unknown as { getCompanyEmailById: () => Promise<unknown> }).getCompanyEmailById =
      async () => row;
    return service;
  }

  it('refuses to send an email that already went out', async () => {
    const service = serviceWith({
      id: 'a',
      recipientEmail: 'a@example.com',
      lastSentAt: new Date('2026-08-11T12:00:00Z'),
    });

    await assert.rejects(() => service.sendEmail('a'), /already sent/i);
  });

  it('still refuses when the status was reset but the mail did go out', async () => {
    const service = serviceWith({
      id: 'a',
      status: 'needs_review',
      recipientEmail: 'a@example.com',
      lastSentAt: new Date('2026-08-11T12:00:00Z'),
    });

    await assert.rejects(() => service.sendEmail('a'), /already sent/i);
  });

  it('allows a deliberate resend', async () => {
    const service = serviceWith({
      id: 'a',
      subject: 's',
      body: 'b',
      recipientEmail: 'a@example.com',
      lastSentAt: new Date('2026-08-11T12:00:00Z'),
      company: { name: 'Alpha' },
    });

    // Posta ve veritabani yazimi bu testin konusu degil; korumanin gecirdigini
    // gormek yetiyor.
    (service as unknown as { mailService: unknown }).mailService = {
      sendMail: async () => ({ sent: true, mode: 'smtp' }),
    };
    (service as unknown as { prisma: unknown }).prisma = {
      companyEmail: { update: async () => ({ id: 'a', status: 'sent' }) },
    };

    const result = await service.sendEmail('a', undefined, { allowResend: true });
    assert.equal(result.mail_sent, true);
  });
});
