import type { TachoActivityLike } from './types';
import { activity, chain, hours, minutes } from './test-helpers';

export type GoldenScenario = {
  name: string;
  driverId: string;
  activities: TachoActivityLike[];
  /** Which evaluators to run for this row in the seed reference table. */
  evaluators: Array<
    | 'breaks'
    | 'daily-driving'
    | 'daily-rest'
    | 'weekly-driving'
    | 'weekly-rest'
    | 'card-events'
  >;
  expected: Array<{ type: string; count: number }>;
};

const DRIVER_A = 'tacho-demo-driver-a';
const DRIVER_B = 'tacho-demo-driver-b';

/** Mirrors seed-tacho-demo.mjs header table — activity-level golden reference. */
export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    name: 'exactly_9h_driving_clean',
    driverId: DRIVER_A,
    activities: [activity('driving', '2026-06-01T08:00:00.000Z', hours(9))],
    evaluators: ['daily-driving'],
    expected: [],
  },
  {
    name: '9h1m_after_two_extensions',
    driverId: DRIVER_A,
    activities: chain(
      activity('driving', '2026-06-02T06:00:00.000Z', hours(9) + minutes(30)),
      activity('rest', '2026-06-02T15:30:00.000Z', hours(11)),
      activity('driving', '2026-06-03T06:00:00.000Z', hours(9) + minutes(30)),
      activity('rest', '2026-06-03T15:30:00.000Z', hours(11)),
      activity('driving', '2026-06-04T06:00:00.000Z', hours(9) + minutes(1)),
    ),
    evaluators: ['daily-driving'],
    expected: [{ type: 'daily_driving_exceeded', count: 1 }],
  },
  {
    name: 'valid_15_then_30_break',
    driverId: DRIVER_B,
    activities: chain(
      activity('driving', '2026-06-05T08:00:00.000Z', hours(4)),
      activity('rest', '2026-06-05T12:00:00.000Z', minutes(15)),
      activity('rest', '2026-06-05T12:15:00.000Z', minutes(30)),
      activity('driving', '2026-06-05T12:45:00.000Z', hours(4)),
    ),
    evaluators: ['breaks'],
    expected: [],
  },
  {
    name: 'invalid_30_then_15_break',
    driverId: DRIVER_B,
    activities: chain(
      activity('driving', '2026-06-06T08:00:00.000Z', hours(4)),
      activity('rest', '2026-06-06T12:00:00.000Z', minutes(30)),
      activity('rest', '2026-06-06T12:30:00.000Z', minutes(15)),
      activity('driving', '2026-06-06T12:45:00.000Z', hours(1) + minutes(1)),
    ),
    evaluators: ['breaks'],
    expected: [{ type: 'insufficient_break', count: 1 }],
  },
  {
    name: 'iso_week_56h_plus',
    driverId: DRIVER_A,
    activities: chain(
      activity('driving', '2026-06-09T06:00:00.000Z', hours(11) + minutes(30)),
      activity('rest', '2026-06-09T17:30:00.000Z', hours(12)),
      activity('driving', '2026-06-10T06:00:00.000Z', hours(11) + minutes(30)),
      activity('rest', '2026-06-10T17:30:00.000Z', hours(12)),
      activity('driving', '2026-06-11T06:00:00.000Z', hours(11) + minutes(30)),
      activity('rest', '2026-06-11T17:30:00.000Z', hours(12)),
      activity('driving', '2026-06-12T06:00:00.000Z', hours(11) + minutes(30)),
      activity('rest', '2026-06-12T17:30:00.000Z', hours(12)),
      activity('driving', '2026-06-13T06:00:00.000Z', hours(11) + minutes(30)),
    ),
    evaluators: ['weekly-driving'],
    expected: [{ type: 'exceeded_weekly_driving', count: 1 }],
  },
];

export function buildGoldenActivitiesForDriver(driverId: string): TachoActivityLike[] {
  return GOLDEN_SCENARIOS.filter((scenario) => scenario.driverId === driverId).flatMap(
    (scenario) => scenario.activities.map((row) => ({ ...row, driverId })),
  );
}

export function buildAllGoldenActivities(): TachoActivityLike[] {
  return GOLDEN_SCENARIOS.flatMap((scenario) =>
    scenario.activities.map((row) => ({ ...row, driverId: scenario.driverId })),
  );
}
