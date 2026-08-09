import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAppendWorkTimeEvent,
  foldWorkTimeEvents,
  requiredBreakMinutes,
  type FoldableWorkTimeEvent,
  type WorkTimeEventKind,
} from './work-time-fold.util';

const DAY = '2026-08-08';

function at(time: string): Date {
  return new Date(`${DAY}T${time}:00.000Z`);
}

function event(type: WorkTimeEventKind, time: string, sequence?: number): FoldableWorkTimeEvent {
  return { type, occurredAt: at(time), sequence };
}

/** Kullanicinin ornek gunu: 07:02 giris, iki mola, 17:19 cikis. */
function fullDay(): FoldableWorkTimeEvent[] {
  return [
    event('clock_in', '07:02'),
    event('break_start', '10:14'),
    event('break_end', '10:44'),
    event('break_start', '13:08'),
    event('break_end', '13:22'),
    event('clock_out', '17:19'),
  ];
}

describe('requiredBreakMinutes (ArbZG §4)', () => {
  it('asilmayan esikte mola istemez', () => {
    assert.equal(requiredBreakMinutes(6 * 60), 0);
    assert.equal(requiredBreakMinutes(0), 0);
  });

  it('6 saati asinca 30, 9 saati asinca 45 dakika ister', () => {
    assert.equal(requiredBreakMinutes(6 * 60 + 1), 30);
    assert.equal(requiredBreakMinutes(9 * 60), 30);
    assert.equal(requiredBreakMinutes(9 * 60 + 1), 45);
  });
});

describe('foldWorkTimeEvents', () => {
  it('tam gunu brut, mola ve net olarak hesaplar', () => {
    const result = foldWorkTimeEvents(fullDay(), at('18:00'));

    assert.equal(result.state, 'off');
    assert.equal(result.startedAt?.toISOString(), at('07:02').toISOString());
    assert.equal(result.endedAt?.toISOString(), at('17:19').toISOString());
    assert.equal(result.grossMinutes, 617); // 10s 17dk
    assert.equal(result.breakMinutes, 44); // 30 + 14
    assert.equal(result.netMinutes, 573); // 9s 33dk
    assert.equal(result.requiredBreakMinutes, 45);
    // 44 dk mola, 9,5 saatlik calismada 45 dk gerekiyordu.
    assert.deepEqual(result.anomalies, ['break_shorter_than_required']);
    assert.equal(result.ignoredCount, 0);
  });

  it('gelis sirasi bozuk olsa da ayni sonucu verir', () => {
    const shuffled = [
      event('break_end', '13:22'),
      event('clock_out', '17:19'),
      event('clock_in', '07:02'),
      event('break_end', '10:44'),
      event('break_start', '13:08'),
      event('break_start', '10:14'),
    ];

    const ordered = foldWorkTimeEvents(fullDay(), at('18:00'));
    const outOfOrder = foldWorkTimeEvents(shuffled, at('18:00'));

    assert.deepEqual(
      { net: outOfOrder.netMinutes, brk: outOfOrder.breakMinutes, state: outOfOrder.state },
      { net: ordered.netMinutes, brk: ordered.breakMinutes, state: ordered.state },
    );
  });

  it('acik vardiyada sureyi su ana kadar sayar', () => {
    const result = foldWorkTimeEvents([event('clock_in', '07:02')], at('11:39'));

    assert.equal(result.state, 'working');
    assert.equal(result.grossMinutes, 277); // 4s 37dk
    assert.equal(result.netMinutes, 277);
    assert.deepEqual(result.anomalies, ['missing_clock_out']);
  });

  it('devam eden molayi da su ana kadar sayar', () => {
    const result = foldWorkTimeEvents(
      [event('clock_in', '07:02'), event('break_start', '10:14')],
      at('10:35'),
    );

    assert.equal(result.state, 'on_break');
    assert.equal(result.breakMinutes, 21);
    assert.equal(result.grossMinutes, 213);
    assert.equal(result.netMinutes, 192);
  });

  it('12 saati asan acik vardiyayi ayrica isaretler', () => {
    const result = foldWorkTimeEvents([event('clock_in', '07:02')], new Date('2026-08-08T20:03:00.000Z'));

    assert.equal(result.state, 'working');
    assert.deepEqual(result.anomalies.slice(0, 2), ['missing_clock_out', 'open_shift_too_long']);
  });

  it('mola kapatilmadan cikista molayi cikista kapatir ve isaretler', () => {
    const result = foldWorkTimeEvents(
      [event('clock_in', '07:02'), event('break_start', '16:49'), event('clock_out', '17:19')],
      at('18:00'),
    );

    assert.equal(result.state, 'off');
    assert.equal(result.breakMinutes, 30);
    assert.ok(result.anomalies.includes('missing_break_end'));
  });

  it('girissiz olay dizisini eksik giris olarak isaretler ve hicbirini uygulamaz', () => {
    const result = foldWorkTimeEvents([event('break_start', '10:14'), event('clock_out', '17:19')], at('18:00'));

    assert.equal(result.state, 'off');
    assert.equal(result.startedAt, null);
    assert.equal(result.grossMinutes, 0);
    assert.deepEqual(result.anomalies, ['missing_clock_in']);
    assert.equal(result.ignoredCount, 2);
  });

  it('tekrarlanan girisi yok sayar, baslangici geri almaz', () => {
    const result = foldWorkTimeEvents(
      [event('clock_in', '07:02'), event('clock_in', '07:05'), event('clock_out', '17:19')],
      at('18:00'),
    );

    assert.equal(result.startedAt?.toISOString(), at('07:02').toISOString());
    assert.equal(result.ignoredCount, 1);
  });

  it('bos gunde anomali uretmez', () => {
    const result = foldWorkTimeEvents([], at('18:00'));

    assert.equal(result.state, 'off');
    assert.equal(result.netMinutes, 0);
    assert.deepEqual(result.anomalies, []);
  });
});

describe('ofis duzeltmesi (ustu cizme)', () => {
  it('cikis saatini GERIYE ceken duzeltmeyi uygular', () => {
    const result = foldWorkTimeEvents(
      [
        { ...event('clock_in', '07:02', 1), id: 'in-1' },
        { ...event('clock_out', '17:19', 2), id: 'out-1' },
        { ...event('clock_out', '16:30', 3), id: 'out-2', supersedesEventId: 'out-1' },
      ],
      at('18:00'),
    );

    assert.equal(result.endedAt?.toISOString(), at('16:30').toISOString());
    assert.equal(result.grossMinutes, 568);
    assert.equal(result.ignoredCount, 0);
  });

  it('cikis saatini ILERI alan duzeltmeyi de uygular', () => {
    // Zamana gore siralama tek basina yetseydi orijinal cikis once gelip
    // uygulanir, duzeltme yok sayilirdi. Bu testin korudugu sey tam olarak bu.
    const result = foldWorkTimeEvents(
      [
        { ...event('clock_in', '07:02', 1), id: 'in-1' },
        { ...event('clock_out', '17:19', 2), id: 'out-1' },
        { ...event('clock_out', '18:00', 3), id: 'out-2', supersedesEventId: 'out-1' },
      ],
      at('19:00'),
    );

    assert.equal(result.endedAt?.toISOString(), at('18:00').toISOString());
    assert.equal(result.grossMinutes, 658);
    assert.equal(result.ignoredCount, 0);
  });

  it('duzeltmenin duzeltmesinde son halkayi uygular', () => {
    const result = foldWorkTimeEvents(
      [
        { ...event('clock_in', '07:02', 1), id: 'in-1' },
        { ...event('clock_out', '17:19', 2), id: 'out-1' },
        { ...event('clock_out', '18:00', 3), id: 'out-2', supersedesEventId: 'out-1' },
        { ...event('clock_out', '16:45', 4), id: 'out-3', supersedesEventId: 'out-2' },
      ],
      at('19:00'),
    );

    assert.equal(result.endedAt?.toISOString(), at('16:45').toISOString());
    assert.equal(result.ignoredCount, 0);
  });
});

describe('canAppendWorkTimeEvent', () => {
  it('vardiya baslamadan mola baslatilamaz', () => {
    assert.deepEqual(canAppendWorkTimeEvent([], event('break_start', '10:14')), {
      apply: false,
      reason: 'not_working',
    });
  });

  it('calisirken ikinci giris reddedilir', () => {
    assert.deepEqual(canAppendWorkTimeEvent([event('clock_in', '07:02')], event('clock_in', '09:00')), {
      apply: false,
      reason: 'already_working',
    });
  });

  it('mola disinda mola bitisi reddedilir', () => {
    assert.deepEqual(canAppendWorkTimeEvent([event('clock_in', '07:02')], event('break_end', '10:44')), {
      apply: false,
      reason: 'not_on_break',
    });
  });

  it('acilmamis vardiyada cikis reddedilir', () => {
    assert.deepEqual(canAppendWorkTimeEvent([], event('clock_out', '17:19')), {
      apply: false,
      reason: 'shift_not_started',
    });
  });

  it('gecerli sirayi kabul eder', () => {
    const existing = [event('clock_in', '07:02', 1)];
    assert.deepEqual(canAppendWorkTimeEvent(existing, event('break_start', '10:14')), { apply: true });

    const onBreak = [...existing, event('break_start', '10:14', 2)];
    assert.deepEqual(canAppendWorkTimeEvent(onBreak, event('break_end', '10:44')), { apply: true });
  });

  it('karari olayin KENDI anina gore verir, son duruma gore degil', () => {
    // Cevrimdisi kuyruk 10:14'teki mola baslangicini ancak cikistan sonra
    // gonderebiliyor. "Son durum kapali" mantigi bunu reddederdi.
    const existing = [event('clock_in', '07:02', 1), event('clock_out', '17:19', 2)];

    assert.deepEqual(canAppendWorkTimeEvent(existing, event('break_start', '10:14')), { apply: true });
  });

  it('ayni ani tasiyan mevcut olaydan sonra siralanir', () => {
    // 10:14'te zaten mola baslamis; ayni dakikaya ikinci bir mola baslangici
    // gelirse aday sonraya duser ve reddedilir.
    const existing = [event('clock_in', '07:02', 1), event('break_start', '10:14', 2)];

    assert.deepEqual(canAppendWorkTimeEvent(existing, event('break_start', '10:14')), {
      apply: false,
      reason: 'not_working',
    });
  });
});
