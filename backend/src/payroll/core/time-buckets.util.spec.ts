import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bucketWorkIntervals, localDateOf, type BucketOptions } from './time-buckets.util';

/** §3b'nin tipik penceresi: 20:00–06:00, cekirdek 00:00–04:00. */
function options(overrides: Partial<BucketOptions> = {}): BucketOptions {
  return {
    night: { startMinute: 20 * 60, endMinute: 6 * 60 },
    nightCore: { startMinute: 0, endMinute: 4 * 60 },
    holidayDates: new Set<string>(),
    ...overrides,
  };
}

function interval(fromIso: string, toIso: string) {
  return { from: new Date(fromIso), to: new Date(toIso) };
}

describe('bucketWorkIntervals', () => {
  it('gunduz vardiyasini tek gune yazar, gece kovasi bos kalir', () => {
    // 2026-08-10 Pazartesi, yaz saati (UTC+2): 07:00–15:30 yerel.
    const days = bucketWorkIntervals(
      [interval('2026-08-10T05:00:00.000Z', '2026-08-10T13:30:00.000Z')],
      options(),
    );

    assert.equal(days.length, 1);
    assert.deepEqual(days[0], {
      localDate: '2026-08-10',
      workedMinutes: 510,
      nightMinutes: 0,
      nightCoreMinutes: 0,
      sundayMinutes: 0,
      holidayMinutes: 0,
    });
  });

  it('yaz saatinde gece penceresini YEREL saate gore uygular', () => {
    // 19:00–21:00 yerel (17:00–19:00 UTC). Yalnizca son saat gece penceresinde.
    // UTC uzerinden hesaplansaydi pencere iki saat kayar ve sonuc 0 cikardi.
    const days = bucketWorkIntervals(
      [interval('2026-08-10T17:00:00.000Z', '2026-08-10T19:00:00.000Z')],
      options(),
    );

    assert.equal(days[0].workedMinutes, 120);
    assert.equal(days[0].nightMinutes, 60);
  });

  it('gece yarisini asan vardiyayi iki yerel gune boler', () => {
    // 22:00 (10 Ags) – 04:00 (11 Ags) yerel.
    const days = bucketWorkIntervals(
      [interval('2026-08-10T20:00:00.000Z', '2026-08-11T02:00:00.000Z')],
      options(),
    );

    assert.equal(days.length, 2);
    assert.deepEqual(
      days.map((day) => [day.localDate, day.workedMinutes, day.nightMinutes, day.nightCoreMinutes]),
      [
        ['2026-08-10', 120, 120, 0], // 22:00–00:00, cekirdek disi
        ['2026-08-11', 240, 240, 240], // 00:00–04:00, tamami cekirdek
      ],
    );
  });

  it('Pazar dakikalarini ayirir', () => {
    // 2026-08-09 Pazar, 08:00–12:00 yerel.
    const days = bucketWorkIntervals(
      [interval('2026-08-09T06:00:00.000Z', '2026-08-09T10:00:00.000Z')],
      options(),
    );

    assert.equal(days[0].sundayMinutes, 240);
    assert.equal(days[0].holidayMinutes, 0);
  });

  it('tatil Pazari ezer, ikisi ust uste binmez', () => {
    // Ayni Pazar gunu tatil olarak isaretli.
    const days = bucketWorkIntervals(
      [interval('2026-08-09T06:00:00.000Z', '2026-08-09T10:00:00.000Z')],
      options({ holidayDates: new Set(['2026-08-09']) }),
    );

    assert.equal(days[0].holidayMinutes, 240);
    assert.equal(days[0].sundayMinutes, 0);
  });

  it('yaz saatine GECIS gecesinde eksilen saati saymaz', () => {
    // 2026-03-29: yerel 02:00 hic yasanmiyor. 00:00→05:00 yerel = 4 saat.
    // Aralik aritmetigi yerel alanlar uzerinden yapilsaydi 5 saat cikardi.
    const days = bucketWorkIntervals(
      [interval('2026-03-28T23:00:00.000Z', '2026-03-29T03:00:00.000Z')],
      options(),
    );

    assert.equal(days.length, 1);
    assert.equal(days[0].localDate, '2026-03-29');
    assert.equal(days[0].workedMinutes, 240);
    assert.equal(days[0].nightMinutes, 240);
    // Cekirdek 00:00–04:00 ama 02:00–03:00 yasanmadi: 00:00–02:00 + 03:00–04:00.
    assert.equal(days[0].nightCoreMinutes, 180);
  });

  it('kis saatine DONUS gecesinde tekrarlanan saati sayar', () => {
    // 2026-10-25: yerel 02:00–03:00 iki kez yasaniyor. 00:00→05:00 = 6 saat.
    const days = bucketWorkIntervals(
      [interval('2026-10-24T22:00:00.000Z', '2026-10-25T04:00:00.000Z')],
      options(),
    );

    assert.equal(days[0].localDate, '2026-10-25');
    assert.equal(days[0].workedMinutes, 360);
    assert.equal(days[0].nightMinutes, 360);
    // Cekirdek bandi 00:00–04:00 icinde tekrarlanan saatle birlikte 5 saat.
    assert.equal(days[0].nightCoreMinutes, 300);
  });

  it('saniyeleri dakikaya hizalar ve bitis dakikasini cift saymaz', () => {
    const days = bucketWorkIntervals(
      [
        interval('2026-08-10T05:00:30.000Z', '2026-08-10T06:00:00.000Z'),
        interval('2026-08-10T06:00:00.000Z', '2026-08-10T07:00:00.000Z'),
      ],
      options(),
    );

    assert.equal(days[0].workedMinutes, 120);
  });

  it('bos ve ters araliklari yok sayar', () => {
    const days = bucketWorkIntervals(
      [
        interval('2026-08-10T09:00:00.000Z', '2026-08-10T09:00:00.000Z'),
        interval('2026-08-10T10:00:00.000Z', '2026-08-10T09:00:00.000Z'),
      ],
      options(),
    );

    assert.deepEqual(days, []);
  });

  it('bos pencere hicbir dakikayi gece saymaz', () => {
    const days = bucketWorkIntervals(
      [interval('2026-08-10T20:00:00.000Z', '2026-08-10T22:00:00.000Z')],
      options({ night: { startMinute: 0, endMinute: 0 } }),
    );

    assert.equal(days[0].nightMinutes, 0);
  });
});

describe('localDateOf', () => {
  it('UTC gunu degil YEREL gunu verir', () => {
    // 22:30 UTC = ertesi gun 00:30 Berlin.
    assert.equal(localDateOf(new Date('2026-08-10T22:30:00.000Z')), '2026-08-11');
  });
});
