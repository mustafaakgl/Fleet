import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  DeliverySlotSessionService,
  SLOT_SESSION_COOKIE,
  SLOT_SESSION_TTL_MS,
  slotSessionCookieOptions,
} from './delivery-slot-session.service';

/**
 * SLOT OTURUMU (Faz 17g).
 *
 * OLCULEN SEY: token'in oturuma cevrildikten sonra BIR DAHA gerekmemesi ve
 * oturumun GERI ALINABILIR olmasi. Imzali bir cookie ikincisini veremezdi —
 * calinmis bir cookie suresi dolana kadar gecerli kalirdi.
 */

type Row = Record<string, unknown>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function build() {
  const sessions: Row[] = [];
  const audits: Row[] = [];
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const cleared: string[] = [];
  let seq = 0;

  const table = {
    async findUnique({ where }: { where: Row }) {
      return sessions.find((row) => row.tokenHash === where.tokenHash) ?? null;
    },
    async create({ data }: { data: Row }) {
      const row = { id: `sess-${(seq += 1)}`, revokedAt: null, lastUsedAt: null, ...data };
      sessions.push(row);
      return row;
    },
    async updateMany({ where, data }: { where: Row; data: Row }) {
      let count = 0;
      for (const row of sessions) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.tokenHash !== undefined && row.tokenHash !== where.tokenHash) continue;
        if (where.invitationId !== undefined && row.invitationId !== where.invitationId) continue;
        if ('revokedAt' in where && row.revokedAt !== where.revokedAt) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  const prisma = { unscoped: { deliverySlotSession: table } };
  const audit = {
    async logAction(entry: Row) {
      audits.push(entry);
      return {};
    },
  };
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
    },
    clearCookie(name: string) {
      cleared.push(name);
    },
  };

  const service = new DeliverySlotSessionService(prisma as never, audit as never);
  return { service, sessions, audits, cookies, cleared, response };
}

describe('Cookie secenekleri', () => {
  it('HttpOnly, SameSite=strict ve DAR path', () => {
    const options = slotSessionCookieOptions(SLOT_SESSION_TTL_MS);
    assert.equal(options.httpOnly, true);
    // XSS oturumu okuyamaz.
    assert.equal(options.sameSite, 'strict');
    // Cookie yalnizca public slot uclarina gidiyor; baska hicbir uca DEGIL.
    assert.equal(options.path, '/api/v1/public/delivery-slots');
    assert.equal(options.maxAge, SLOT_SESSION_TTL_MS);
  });

  it('uretimde Secure', () => {
    const original = process.env.NODE_ENV;
    const originalFlag = process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = 'production';
    try {
      assert.equal(slotSessionCookieOptions().secure, true);
    } finally {
      process.env.NODE_ENV = original;
      if (originalFlag !== undefined) process.env.COOKIE_SECURE = originalFlag;
    }
  });

  it('oturum omru davetten COK daha kisa — 30 dakika', () => {
    assert.equal(SLOT_SESSION_TTL_MS, 30 * 60 * 1000);
  });
});

describe('Oturum acma', () => {
  it('cookie veriliyor, DB`de yalnizca OZET duruyor', async () => {
    const harness = build();
    await harness.service.create('inv-1', 't1', harness.response as never);

    const issued = harness.cookies[0]!;
    assert.equal(issued.name, SLOT_SESSION_COOKIE);
    assert.ok(issued.value.length >= 40);
    // Duz metin oturum kimligi VERITABANINDA YOK.
    assert.equal(harness.sessions[0]!.tokenHash, sha256(issued.value));
    assert.equal(
      JSON.stringify(harness.sessions).includes(issued.value),
      false,
      'duz metin DB`ye yazilmis',
    );
  });

  it('YENI oturum eskisini kapatiyor', async () => {
    const harness = build();
    await harness.service.create('inv-1', 't1', harness.response as never);
    await harness.service.create('inv-1', 't1', harness.response as never);

    assert.equal(harness.sessions.length, 2);
    // Paylasilan cihazda birakilmis eski oturum yasamaya devam etmiyor.
    assert.notEqual(harness.sessions[0]!.revokedAt, null);
    assert.equal(harness.sessions[1]!.revokedAt, null);
  });

  it('denetimde token, ozet ve oturum kimligi YOK', async () => {
    const harness = build();
    await harness.service.create('inv-1', 't1', harness.response as never);
    const serialized = JSON.stringify(harness.audits);
    assert.equal(serialized.includes(harness.cookies[0]!.value), false);
    assert.equal(serialized.toLowerCase().includes('hash'), false);
    assert.equal(serialized.toLowerCase().includes('token'), false);
  });
});

describe('Oturum cozme', () => {
  async function opened() {
    const harness = build();
    await harness.service.create('inv-1', 't1', harness.response as never);
    return { harness, cookie: harness.cookies[0]!.value };
  }

  it('gecerli cookie daveti cozuyor', async () => {
    const { harness, cookie } = await opened();
    const context = await harness.service.resolve(cookie);
    assert.equal(context.invitationId, 'inv-1');
    assert.equal(context.tenantId, 't1');
  });

  it('kullanim damgasi guncelleniyor', async () => {
    const { harness, cookie } = await opened();
    await harness.service.resolve(cookie);
    assert.notEqual(harness.sessions[0]!.lastUsedAt, null);
  });

  /**
   * BUTUN BASARISIZ SONUCLAR AYNI CEVAP.
   *
   * Yok, kisa, suresi dolmus ve iptal edilmis — dordu de ayni. Ayirt
   * edilebilselerdi saldirgan gecerli bir oturum kimliginin VARLIGINI
   * ogrenirdi.
   */
  it('yok / kisa / suresi dolmus / iptal edilmis AYNI cevabi verir', async () => {
    const cases: Array<[string, () => Promise<{ harness: ReturnType<typeof build>; cookie?: string }>]> = [
      ['cookie yok', async () => ({ harness: build(), cookie: undefined })],
      ['kisa cookie', async () => ({ harness: build(), cookie: 'kisa' })],
      [
        'bilinmeyen cookie',
        async () => ({ harness: build(), cookie: 'bilinmeyen-oturum-kimligi-1234567890' }),
      ],
      [
        'suresi dolmus',
        async () => {
          const { harness, cookie } = await opened();
          harness.sessions[0]!.expiresAt = new Date(Date.now() - 1000);
          return { harness, cookie };
        },
      ],
      [
        'iptal edilmis',
        async () => {
          const { harness, cookie } = await opened();
          harness.sessions[0]!.revokedAt = new Date();
          return { harness, cookie };
        },
      ],
    ];

    for (const [label, make] of cases) {
      const { harness, cookie } = await make();
      await assert.rejects(
        () => harness.service.resolve(cookie),
        (error: unknown) =>
          error instanceof NotFoundException &&
          JSON.stringify(error.getResponse()).includes('slot_invitation_invalid'),
        label,
      );
    }
  });
});

describe('Oturum kapatma', () => {
  it('cookie siliniyor VE sunucudaki satir damgalaniyor', async () => {
    const harness = build();
    await harness.service.create('inv-1', 't1', harness.response as never);
    const cookie = harness.cookies[0]!.value;

    const result = await harness.service.revoke(cookie, harness.response as never);
    assert.equal(result.closed, true);
    assert.deepEqual(harness.cleared, [SLOT_SESSION_COOKIE]);
    assert.notEqual(harness.sessions[0]!.revokedAt, null);

    // Kapatildiktan sonra AYNI cookie ise yaramiyor — kopyalanmis olsa bile.
    await assert.rejects(
      () => harness.service.resolve(cookie),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('cookie yoksa da cerez temizleniyor — IDEMPOTENT', async () => {
    const harness = build();
    const result = await harness.service.revoke(undefined, harness.response as never);
    assert.equal(result.closed, false);
    assert.deepEqual(harness.cleared, [SLOT_SESSION_COOKIE]);
  });

  it('davet iptal edilince ACIK oturumlar kapaniyor', async () => {
    const harness = build();
    await harness.service.create('inv-1', 't1', harness.response as never);
    await harness.service.revokeForInvitation('inv-1');
    assert.notEqual(harness.sessions[0]!.revokedAt, null);
  });
});
