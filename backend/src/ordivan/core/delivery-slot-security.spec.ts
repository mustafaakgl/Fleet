import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_TOKEN_ATTEMPTS,
  SLOT_CHANGE_CUTOFF_MS,
  activeTargetKey,
  capacityClaimWhere,
  evaluateInvitation,
  evaluateSlot,
  formatInZone,
  hashSlotToken,
  isLocked,
  issueSlotToken,
  registerFailedAttempt,
  resolveSlotTimeZone,
  tokenHashMatches,
} from './delivery-slot-security';

/**
 * SLOT DAVETI GUVENLIGI (Faz 17e).
 *
 * Girissiz bir baglantinin tek savunmasi token. Olculen sey: tahmin
 * edilebilir mi, sizarsa ne acar, ve basarisiz sonuclar birbirinden ayirt
 * edilebilir mi.
 */

const NOW = new Date('2026-09-01T08:00:00.000Z');

describe('Token uretimi', () => {
  it('EN AZ 128 bit rastgelelik — 256 bit uretiliyor', () => {
    const { token } = issueSlotToken();
    // base64url: 32 bayt -> 43 karakter.
    assert.ok(token.length >= 43, `cok kisa: ${token.length}`);
    assert.equal(Buffer.from(token, 'base64url').length, 32);
  });

  it('her token FARKLI', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => issueSlotToken().token));
    assert.equal(tokens.size, 200);
  });

  it('URL guvenli alfabe — kacis gerekmiyor', () => {
    for (let index = 0; index < 50; index += 1) {
      assert.match(issueSlotToken().token, /^[A-Za-z0-9_-]+$/);
    }
  });

  it('VERITABANINDA YALNIZCA OZET durur', () => {
    const issued = issueSlotToken();
    assert.equal(issued.tokenHash, hashSlotToken(issued.token));
    assert.equal(issued.tokenHash.length, 64);
    // Ozet duz metni ICERMIYOR.
    assert.equal(issued.tokenHash.includes(issued.token), false);
  });

  it('onek KISA — destek icin yeterli, tahmin icin anlamsiz', () => {
    const issued = issueSlotToken();
    assert.equal(issued.tokenPrefix.length, 8);
    assert.ok(issued.token.startsWith(issued.tokenPrefix));
  });

  it('ozet karsilastirmasi SABIT ZAMANLI ve dogru', () => {
    const issued = issueSlotToken();
    assert.equal(tokenHashMatches(hashSlotToken(issued.token), issued.tokenHash), true);
    assert.equal(tokenHashMatches(hashSlotToken('baska'), issued.tokenHash), false);
    assert.equal(tokenHashMatches('', issued.tokenHash), false);
  });
});

describe('Tek aktif davet anahtari', () => {
  it('kalem + uc birlesimi', () => {
    assert.equal(activeTargetKey('con-1', 'pickup'), 'con-1:pickup');
    assert.notEqual(activeTargetKey('con-1', 'pickup'), activeTargetKey('con-1', 'delivery'));
  });
});

describe('Davet gecerliligi', () => {
  const base = {
    status: 'open' as const,
    expiresAt: new Date('2026-09-05T00:00:00.000Z'),
    sourceRevision: 3,
    attemptCount: 0,
    lockedUntil: null,
  };

  it('acik ve suresi gecmemis davet kullanilabilir', () => {
    assert.deepEqual(evaluateInvitation(base, NOW, 3), { usable: true });
  });

  it('SURESI DOLMUS davet reddedilir', () => {
    const result = evaluateInvitation({ ...base, expiresAt: new Date('2026-08-01T00:00:00.000Z') }, NOW);
    assert.equal(result.usable, false);
    assert.equal(result.reason, 'expired');
  });

  it('IPTAL EDILMIS davet reddedilir', () => {
    for (const status of ['revoked', 'cancelled'] as const) {
      assert.equal(evaluateInvitation({ ...base, status }, NOW).usable, false, status);
    }
  });

  it('ZATEN REZERVE davet ikinci kez kullanilamaz', () => {
    const result = evaluateInvitation({ ...base, status: 'booked' }, NOW);
    assert.equal(result.reason, 'already_booked');
  });

  it('ESKI REVIZYONA ait davet gecersiz', () => {
    // Musteri siparisi degistirdi: o davetle secilen saat artik var olmayan
    // bir pencereye baglanirdi.
    const result = evaluateInvitation(base, NOW, 4);
    assert.equal(result.usable, false);
    assert.equal(result.reason, 'stale_revision');
  });

  it('KILITLI davet, gecerli olsa bile reddedilir', () => {
    const locked = { ...base, lockedUntil: new Date('2026-09-01T08:10:00.000Z') };
    assert.equal(evaluateInvitation(locked, NOW, 3).reason, 'locked');
  });
});

describe('Kaba kuvvet korumasi', () => {
  it('sinira gelince KILITLENIYOR', () => {
    let state = { attemptCount: MAX_TOKEN_ATTEMPTS - 1, lockedUntil: null as Date | null };
    state = registerFailedAttempt(state, NOW);
    assert.equal(state.attemptCount, MAX_TOKEN_ATTEMPTS);
    assert.ok(state.lockedUntil);
    assert.equal(isLocked(state, NOW), true);
  });

  it('sinir altinda kilit YOK', () => {
    const state = registerFailedAttempt({ attemptCount: 0, lockedUntil: null }, NOW);
    assert.equal(state.lockedUntil, null);
    assert.equal(isLocked(state, NOW), false);
  });

  it('kilit SURESI DOLUNCA acilir', () => {
    const state = { attemptCount: 99, lockedUntil: new Date('2026-09-01T07:00:00.000Z') };
    assert.equal(isLocked(state, NOW), false);
  });
});

describe('Slot secilebilirligi', () => {
  const slot = {
    startsAt: new Date('2026-09-02T08:00:00.000Z'),
    endsAt: new Date('2026-09-02T10:00:00.000Z'),
    capacity: 2,
    bookedCount: 0,
    status: 'open' as const,
  };

  it('acik, gelecekte ve bos slot secilebilir', () => {
    assert.deepEqual(evaluateSlot(slot, NOW), { selectable: true });
  });

  it('KAPALI slot secilemez', () => {
    assert.equal(evaluateSlot({ ...slot, status: 'closed' }, NOW).reason, 'closed');
  });

  it('GECMIS slot secilemez', () => {
    const past = { ...slot, startsAt: new Date('2026-08-30T08:00:00.000Z') };
    assert.equal(evaluateSlot(past, NOW).reason, 'past');
  });

  it('DOLU slot secilemez', () => {
    assert.equal(evaluateSlot({ ...slot, bookedCount: 2 }, NOW).reason, 'full');
  });

  it('KESIM SURESINE girmis slot secilemez', () => {
    const soon = { ...slot, startsAt: new Date(NOW.getTime() + SLOT_CHANGE_CUTOFF_MS - 1) };
    assert.equal(evaluateSlot(soon, NOW).reason, 'cutoff');
  });

  it('kesim UTC uzerinden — DST gecisinden ETKILENMEZ', () => {
    // 2026 Almanya yaz saati sonu: 25 Ekim 03:00 -> 02:00 (yerel).
    const dstNow = new Date('2026-10-25T00:30:00.000Z');
    const after = {
      ...slot,
      startsAt: new Date(dstNow.getTime() + SLOT_CHANGE_CUTOFF_MS + 60_000),
      endsAt: new Date(dstNow.getTime() + SLOT_CHANGE_CUTOFF_MS + 3_660_000),
    };
    // Yerel saat bir saat geri gitse de UTC farki degismedigi icin secilebilir.
    assert.equal(evaluateSlot(after, dstNow).selectable, true);
  });
});

describe('Kapasite kosulu', () => {
  it('"once say sonra ekle" DEGIL — kosul `where` icinde', () => {
    assert.deepEqual(capacityClaimWhere('slot-1', 3), {
      id: 'slot-1',
      status: 'open',
      bookedCount: { lt: 3 },
    });
  });

  it('kapali slot kosulu da tasiyor', () => {
    assert.equal(capacityClaimWhere('slot-1', 1).status, 'open');
  });
});

describe('Zaman dilimi', () => {
  it('SABIT Europe/Berlin YOK — konum dilimi kazaniyor', () => {
    assert.equal(resolveSlotTimeZone('Europe/Amsterdam', 'Europe/Berlin'), 'Europe/Amsterdam');
  });

  it('konum dilimi yoksa KIRACININ dilimi', () => {
    assert.equal(resolveSlotTimeZone(null, 'Europe/Istanbul'), 'Europe/Istanbul');
    assert.equal(resolveSlotTimeZone('   ', 'Europe/Istanbul'), 'Europe/Istanbul');
  });

  it('ayni UTC ani FARKLI dilimlerde farkli gosteriliyor', () => {
    const instant = new Date('2026-09-01T08:00:00.000Z');
    const berlin = formatInZone(instant, 'Europe/Berlin');
    const istanbul = formatInZone(instant, 'Europe/Istanbul');
    assert.notEqual(berlin, istanbul);
  });

  it('DST gecisi dogru cozuluyor — elle saat eklenmiyor', () => {
    // Yaz saati (UTC+2) ve kis saati (UTC+1) ayni yerel saati farkli UTC
    // anlarina karsilik getirir.
    const summer = formatInZone(new Date('2026-07-01T10:00:00.000Z'), 'Europe/Berlin');
    const winter = formatInZone(new Date('2026-12-01T10:00:00.000Z'), 'Europe/Berlin');
    assert.match(summer, /12:00/);
    assert.match(winter, /11:00/);
  });
});
