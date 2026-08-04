import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CompanyEmailsService } from './company-emails.service';

type Candidate = {
  id: string;
  recipientEmail: string;
  company: { name: string } | null;
};

/**
 * Servisi gercek bagimliliklari olmadan kurar.
 *
 * Yalnizca toplu gonderim akisi test ediliyor: hangi satirlar atlanir, tek bir
 * hata digerlerini durdurur mu, ozet dogru mu. Posta gonderimi ve veritabani
 * disaridan verilir.
 */
function buildService(options: {
  candidates: Candidate[];
  send: (id: string) => Promise<{ mail_sent: boolean; mail_mode: string }>;
}) {
  const prisma = {
    companyEmail: {
      findMany: async () => options.candidates,
    },
  };

  const service = new CompanyEmailsService(
    prisma as never,
    { logAction: async () => undefined } as never,
    {} as never,
  );

  // sendEmail tek satir gonderiminin kendi testleri var; burada davranisi taklit
  // edilerek yalnizca toplu akis olculuyor.
  (service as unknown as { sendEmail: (id: string) => Promise<unknown> }).sendEmail = (id) =>
    options.send(id);

  return service;
}

const OK = { mail_sent: true, mail_mode: 'smtp' };

describe('sendAllForDates', () => {
  it('sends every candidate and reports the total', async () => {
    const sent: string[] = [];
    const service = buildService({
      candidates: [
        { id: 'a', recipientEmail: 'a@example.com', company: { name: 'Alpha' } },
        { id: 'b', recipientEmail: 'b@example.com', company: { name: 'Beta' } },
      ],
      send: async (id) => {
        sent.push(id);
        return OK;
      },
    });

    const result = await service.sendAllForDates(['2026-08-03']);

    assert.deepEqual(sent, ['a', 'b']);
    assert.equal(result.total, 2);
    assert.equal(result.sent, 2);
    assert.deepEqual(result.failed, []);
  });

  it('keeps going when one company fails and names it', async () => {
    const service = buildService({
      candidates: [
        { id: 'a', recipientEmail: 'a@example.com', company: { name: 'Alpha' } },
        { id: 'b', recipientEmail: 'b@example.com', company: { name: 'Beta' } },
        { id: 'c', recipientEmail: 'c@example.com', company: { name: 'Gamma' } },
      ],
      send: async (id) => {
        if (id === 'b') throw new Error('smtp down');
        return OK;
      },
    });

    const result = await service.sendAllForDates(['2026-08-03']);

    assert.equal(result.total, 3);
    assert.equal(result.sent, 2);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].company, 'Beta');
  });

  it('skips a draft without a recipient instead of sending', async () => {
    const attempted: string[] = [];
    const service = buildService({
      candidates: [
        { id: 'a', recipientEmail: '   ', company: { name: 'Alpha' } },
        { id: 'b', recipientEmail: 'b@example.com', company: { name: 'Beta' } },
      ],
      send: async (id) => {
        attempted.push(id);
        return OK;
      },
    });

    const result = await service.sendAllForDates(['2026-08-03']);

    assert.deepEqual(attempted, ['b']);
    assert.equal(result.sent, 1);
    assert.equal(result.failed[0].reason, 'missing_recipient');
  });

  it('treats the development log mode as delivered', async () => {
    const service = buildService({
      candidates: [{ id: 'a', recipientEmail: 'a@example.com', company: { name: 'Alpha' } }],
      send: async () => ({ mail_sent: false, mail_mode: 'log' }),
    });

    const result = await service.sendAllForDates(['2026-08-03']);
    assert.equal(result.sent, 1);
  });

  it('reports an undelivered mail as failed', async () => {
    const service = buildService({
      candidates: [{ id: 'a', recipientEmail: 'a@example.com', company: { name: 'Alpha' } }],
      send: async () => ({ mail_sent: false, mail_mode: 'smtp' }),
    });

    const result = await service.sendAllForDates(['2026-08-03']);
    assert.equal(result.sent, 0);
    assert.equal(result.failed[0].reason, 'delivery_failed');
  });

  it('refuses an empty date list', async () => {
    const service = buildService({ candidates: [], send: async () => OK });
    await assert.rejects(() => service.sendAllForDates([]), /At least one date/);
  });
});
