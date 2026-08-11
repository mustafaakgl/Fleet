import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeTourSchedule, type EtaStopInput } from './tour-eta.util';

const START = new Date('2026-08-12T06:00:00.000Z');

function stop(id: string, serviceMinutes: number, legDurationMin: number | null): EtaStopInput {
  return { id, serviceMinutes, legDurationMin };
}

describe('computeTourSchedule', () => {
  it('starts the first stop at the departure time, without a leg', () => {
    const schedule = computeTourSchedule(START, [stop('a', 15, null)]);

    assert.equal(schedule.stops[0].plannedArrivalAt?.toISOString(), '2026-08-12T06:00:00.000Z');
    assert.equal(schedule.stops[0].plannedDepartureAt?.toISOString(), '2026-08-12T06:15:00.000Z');
  });

  it('chains travel time and service time across stops', () => {
    const schedule = computeTourSchedule(START, [
      stop('depot', 10, null),
      stop('first', 20, 45),
      stop('second', 5, 30),
    ]);

    // depot: 06:00 varis, 06:10 kalkis
    // first: +45 dk yol -> 06:55 varis, +20 dk is -> 07:15 kalkis
    // second: +30 dk yol -> 07:45 varis, +5 dk is -> 07:50 kalkis
    assert.equal(schedule.stops[1].plannedArrivalAt?.toISOString(), '2026-08-12T06:55:00.000Z');
    assert.equal(schedule.stops[1].plannedDepartureAt?.toISOString(), '2026-08-12T07:15:00.000Z');
    assert.equal(schedule.stops[2].plannedArrivalAt?.toISOString(), '2026-08-12T07:45:00.000Z');
    assert.equal(schedule.endAt?.toISOString(), '2026-08-12T07:50:00.000Z');
  });

  it('reports no times at all when the departure time is unknown', () => {
    // Uydurma bir baslangic saati varsaymaktansa bos birakiliyor.
    const schedule = computeTourSchedule(null, [stop('a', 10, null), stop('b', 0, 20)]);

    assert.deepEqual(
      schedule.stops.map((entry) => entry.plannedArrivalAt),
      [null, null],
    );
    assert.equal(schedule.endAt, null);
  });

  it('breaks the chain instead of treating a missing leg as zero', () => {
    // Eksik bacagi sifir saymak sonraki tum saatleri erkene ceker; gec kalmaktan
    // daha kotu bir yanlis bilgidir.
    const schedule = computeTourSchedule(START, [
      stop('depot', 0, null),
      stop('broken', 10, null),
      stop('after', 10, 30),
    ]);

    assert.equal(schedule.stops[0].plannedArrivalAt?.toISOString(), '2026-08-12T06:00:00.000Z');
    assert.equal(schedule.stops[1].plannedArrivalAt, null);
    assert.equal(schedule.stops[2].plannedArrivalAt, null);
    assert.equal(schedule.endAt, null);
  });

  it('ignores a negative service time rather than travelling back in time', () => {
    const schedule = computeTourSchedule(START, [stop('a', -30, null)]);

    assert.equal(schedule.stops[0].plannedDepartureAt?.toISOString(), '2026-08-12T06:00:00.000Z');
  });

  it('returns an empty schedule for an empty tour', () => {
    const schedule = computeTourSchedule(START, []);

    assert.deepEqual(schedule.stops, []);
    assert.equal(schedule.endAt, null);
  });
});
