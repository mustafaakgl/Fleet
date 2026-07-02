/** Regulation 561/2006 thresholds in seconds (UTC-based calculations). */

export const SECONDS = {
  MINUTE: 60,
  HOUR: 3600,
} as const;

export const BREAK = {
  /** Art. 7 — continuous driving before break required */
  MAX_CONTINUOUS_DRIVING: 4.5 * SECONDS.HOUR,
  FULL_BREAK: 45 * SECONDS.MINUTE,
  SPLIT_FIRST_MIN: 15 * SECONDS.MINUTE,
  SPLIT_SECOND_MIN: 30 * SECONDS.MINUTE,
  /** Severity threshold: overrun beyond 4.5h without valid break */
  OVERRUN_CRITICAL: 30 * SECONDS.MINUTE,
} as const;

export const DAILY_DRIVING = {
  STANDARD: 9 * SECONDS.HOUR,
  EXTENDED: 10 * SECONDS.HOUR,
  /** Weekly extension allowance (Art. 6/1) */
  MAX_EXTENSIONS_PER_WEEK: 2,
} as const;

export const DAILY_REST = {
  WINDOW: 24 * SECONDS.HOUR,
  NORMAL: 11 * SECONDS.HOUR,
  REDUCED: 9 * SECONDS.HOUR,
  /** Max reduced daily rests between two weekly rests (Art. 8/2) */
  MAX_REDUCED_BETWEEN_WEEKLY: 3,
} as const;

export const WEEKLY_DRIVING = {
  /** ISO week totals — simplified Mon 00:00 UTC (LEGAL-REVIEW) */
  STANDARD: 56 * SECONDS.HOUR,
  MEDIUM_CAP: 60 * SECONDS.HOUR,
  TWO_WEEK_STANDARD: 90 * SECONDS.HOUR,
  TWO_WEEK_CRITICAL: 96 * SECONDS.HOUR,
} as const;

export const WEEKLY_REST = {
  NORMAL: 45 * SECONDS.HOUR,
  REDUCED: 24 * SECONDS.HOUR,
  /** Max gap between consecutive weekly rests (Art. 8/6) */
  MAX_GAP: 6 * 24 * SECONDS.HOUR,
  /** Compensation must be repaid within 3 weeks */
  COMPENSATION_DEADLINE_WEEKS: 3,
} as const;
