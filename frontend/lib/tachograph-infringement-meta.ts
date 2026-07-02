export const INFRINGEMENT_TYPE_LABEL_KEYS: Record<string, string> = {
  daily_driving_exceeded: 'tachograph.infringements.types.dailyDrivingExceeded',
  insufficient_daily_rest: 'tachograph.infringements.types.insufficientDailyRest',
  insufficient_break: 'tachograph.infringements.types.insufficientBreak',
  exceeded_weekly_driving: 'tachograph.infringements.types.exceededWeeklyDriving',
  exceeded_two_week_driving: 'tachograph.infringements.types.exceededTwoWeekDriving',
  insufficient_weekly_rest: 'tachograph.infringements.types.insufficientWeeklyRest',
  driving_without_card: 'tachograph.infringements.types.drivingWithoutCard',
};

export const INFRINGEMENT_TYPES = Object.keys(INFRINGEMENT_TYPE_LABEL_KEYS);

export function infringementTypeLabelKey(type: string): string {
  return INFRINGEMENT_TYPE_LABEL_KEYS[type] ?? type;
}
