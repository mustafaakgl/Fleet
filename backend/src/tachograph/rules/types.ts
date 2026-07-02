/** Pure rule-engine types — no Prisma imports. All times are UTC epoch milliseconds. */

export type TachoWorkStateLike = 'driving' | 'rest' | 'work' | 'available';

export type TachoActivityLike = {
  id?: string;
  driverId?: string;
  startedAtMs: number;
  endedAtMs: number;
  durationS: number;
  workState: TachoWorkStateLike;
};

export type InfringementTypeLike =
  | 'daily_driving_exceeded'
  | 'insufficient_daily_rest'
  | 'insufficient_break'
  | 'exceeded_weekly_driving'
  | 'exceeded_two_week_driving'
  | 'insufficient_weekly_rest'
  | 'driving_without_card';

export type SeverityLike = 'medium' | 'critical';

export type InfringementEvidence = {
  rule: string;
  article?: string;
  activityIds?: string[];
  calculatedValues: Record<string, number | string | boolean | null>;
};

export type InfringementCandidate = {
  type: InfringementTypeLike;
  severity: SeverityLike;
  occurredAtMs: number;
  driverId?: string;
  evidence: InfringementEvidence;
};

export type EvaluationRange = {
  fromMs: number;
  toMs: number;
};

export type CardEventLike = {
  type: 'driving_without_card' | 'overspeed' | 'fault' | 'event';
  occurredAtMs: number;
  durationS?: number;
  severity?: SeverityLike;
};

export type ReducedRestContext = {
  /** Reduced daily rests already used in the current fortnight window. */
  reducedDailyRestCount: number;
};

export type CompensationDebt = {
  owedSeconds: number;
  incurredAtMs: number;
  dueByMs: number;
  repaidSeconds: number;
};
