import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveBreakCandidates, type BreakCandidateDraft } from './break-candidate.util';

/** "12:06" → 10.08.2026 12:06 UTC. Testlerin okunur kalmasi icin. */
function at(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 7, 10, hours, minutes, 0, 0));
}

function interval(from: string, to: string) {
  return { from: at(from), to: at(to) };
}

const SHIFT = interval('07:00', '17:19');

function derive(overrides: Partial<Parameters<typeof deriveBreakCandidates>[0]> = {}) {
  return deriveBreakCandidates({
    restIntervals: [],
    shiftWindow: SHIFT,
    recordedBreaks: [],
    minMinutes: 15,
    ...overrides,
  });
}

function shape(drafts: BreakCandidateDraft[]): string[] {
  return drafts.map(
    (draft) =>
      `${draft.startedAt.toISOString().slice(11, 16)}-${draft.endedAt
        .toISOString()
        .slice(11, 16)}/${draft.durationMinutes}`,
  );
}

describe('deriveBreakCandidates', () => {
  it('turns an unrecorded tacho rest into a candidate', () => {
    // Senaryonun kendisi: surucu 07:00'de basladi, 12:06–12:47 arasi REST,
    // mola dugmesine hic basmadi.
    const drafts = derive({ restIntervals: [interval('12:06', '12:47')] });

    assert.deepEqual(shape(drafts), ['12:06-12:47/41']);
  });

  it('produces nothing when the driver already recorded the break', () => {
    // Surucu 12:05–12:48 bastiysa takograf 12:06–12:47 zaten kapsanmis;
    // ayni molayi ikinci kez sormak olurdu.
    const drafts = derive({
      restIntervals: [interval('12:06', '12:47')],
      recordedBreaks: [interval('12:05', '12:48')],
    });

    assert.deepEqual(drafts, []);
  });

  it('offers only the part the driver did not record', () => {
    // 47 dakikalik REST'in 30 dakikasi kayitli — kalan 17 dakika gercekten
    // eksik ve aday olmali. Gun seviyesindeki "17 dk fark" uyarisinin eyleme
    // donusmus hali.
    const drafts = derive({
      restIntervals: [interval('12:00', '12:47')],
      recordedBreaks: [interval('12:00', '12:30')],
    });

    assert.deepEqual(shape(drafts), ['12:30-12:47/17']);
  });

  it('drops the leftover when it falls under the threshold', () => {
    // Ayni desen ama artan parca 8 dakika: bu bir mola degil, olcum farki.
    const drafts = derive({
      restIntervals: [interval('12:00', '12:38')],
      recordedBreaks: [interval('12:00', '12:30')],
    });

    assert.deepEqual(drafts, []);
  });

  it('ignores short rests', () => {
    const drafts = derive({
      restIntervals: [interval('09:10', '09:13'), interval('10:00', '10:07')],
    });

    assert.deepEqual(drafts, []);
  });

  it('does not round a 14:59 rest up to the threshold', () => {
    const almost = { from: at('12:00'), to: new Date(at('12:14').getTime() + 59_000) };

    assert.deepEqual(derive({ restIntervals: [almost] }), []);
  });

  it('merges rest records that the DDD file split apart', () => {
    // Iki 8 dakikalik ardisik kayit tek bir 16 dakikalik dinlenmedir;
    // birlestirmeden ikisi de esigin altinda kalip elenirdi.
    const drafts = derive({
      restIntervals: [interval('12:00', '12:08'), interval('12:08', '12:16')],
    });

    assert.deepEqual(shape(drafts), ['12:00-12:16/16']);
  });

  it('does not merge across a real working stretch', () => {
    // Aradaki 30 dakika calisma; iki ayri dinlenme, ikisi de esigin altinda.
    assert.deepEqual(derive({ restIntervals: [interval('12:00', '12:10'), interval('12:40', '12:50')] }), []);
  });

  it('clips a rest that starts before the shift', () => {
    // Takograf araca bagli: surucu vardiyaya baslamadan once de arac REST
    // yaziyor olabilir. Yalnizca vardiyaya dusen kisim mola olabilir.
    const drafts = derive({ restIntervals: [interval('06:00', '07:20')] });

    assert.deepEqual(shape(drafts), ['07:00-07:20/20']);
  });

  it('never turns the nightly daily rest into a candidate', () => {
    // Vardiya penceresi yoksa (surucu hic giris yapmamis) aday uretilmez;
    // aksi halde her gece 11 saatlik bir "mola" onerisi cikardi.
    const nightlyRest = { from: at('20:00'), to: new Date(at('23:59').getTime() + 60_000) };

    assert.deepEqual(derive({ shiftWindow: null, restIntervals: [nightlyRest] }), []);
  });

  it('keeps several candidates in chronological order', () => {
    const drafts = derive({
      restIntervals: [interval('15:00', '15:30'), interval('09:30', '10:00')],
    });

    assert.deepEqual(shape(drafts), ['09:30-10:00/30', '15:00-15:30/30']);
  });

  it('carries the evidence that explains the suggestion', () => {
    // "Bu 17 dakikayi neden onerdiniz?" sorusunun alti ay sonraki cevabi.
    const [draft] = derive({
      restIntervals: [interval('12:00', '12:47')],
      recordedBreaks: [interval('12:00', '12:30')],
    });

    assert.equal(draft.durationMinutes, 17);
    assert.equal(draft.evidence.restMinutes, 47);
    assert.equal(draft.evidence.recordedBreakMinutes, 30);
    assert.equal(draft.evidence.startedAt.toISOString(), at('12:00').toISOString());
    assert.equal(draft.evidence.endedAt.toISOString(), at('12:47').toISOString());
  });

  it('keeps each evidence block separate instead of summing them', () => {
    // Iki ayri dinlenmenin sayilari toplanirsa aciklama anlamini yitirir.
    const drafts = derive({
      restIntervals: [interval('09:00', '09:30'), interval('14:00', '14:40')],
    });

    assert.deepEqual(
      drafts.map((draft) => draft.evidence.restMinutes),
      [30, 40],
    );
  });

  it('reports zero recorded minutes when the driver pressed nothing', () => {
    const [draft] = derive({ restIntervals: [interval('12:06', '12:47')] });

    assert.equal(draft.evidence.restMinutes, 41);
    assert.equal(draft.evidence.recordedBreakMinutes, 0);
  });

  it('gives both halves of a split rest the same parent evidence', () => {
    // Ortadan kesilen tek bir dinlenme: iki aday, tek delil blogu.
    const drafts = derive({
      restIntervals: [interval('12:00', '13:00')],
      recordedBreaks: [interval('12:20', '12:30')],
    });

    assert.deepEqual(shape(drafts), ['12:00-12:20/20', '12:30-13:00/30']);
    assert.deepEqual(
      drafts.map((draft) => `${draft.evidence.restMinutes}/${draft.evidence.recordedBreakMinutes}`),
      ['60/10', '60/10'],
    );
  });

  it('treats a zero threshold as "every rest counts"', () => {
    const drafts = derive({ restIntervals: [interval('09:10', '09:13')], minMinutes: 0 });

    assert.deepEqual(shape(drafts), ['09:10-09:13/3']);
  });
});
