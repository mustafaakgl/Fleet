import type { TachoInfringementType } from '@prisma/client';

export type InfringementMeta = {
  article: string;
  labelKey: string;
};

const INFRINGEMENT_META: Record<TachoInfringementType, InfringementMeta> = {
  daily_driving_exceeded: { article: 'Art. 6/1', labelKey: 'tachograph.infringements.types.dailyDrivingExceeded' },
  insufficient_daily_rest: { article: 'Art. 8/2', labelKey: 'tachograph.infringements.types.insufficientDailyRest' },
  insufficient_break: { article: 'Art. 7', labelKey: 'tachograph.infringements.types.insufficientBreak' },
  exceeded_weekly_driving: { article: 'Art. 6/2', labelKey: 'tachograph.infringements.types.exceededWeeklyDriving' },
  exceeded_two_week_driving: { article: 'Art. 6/3', labelKey: 'tachograph.infringements.types.exceededTwoWeekDriving' },
  insufficient_weekly_rest: { article: 'Art. 8/6', labelKey: 'tachograph.infringements.types.insufficientWeeklyRest' },
  driving_without_card: { article: 'Art. 16', labelKey: 'tachograph.infringements.types.drivingWithoutCard' },
};

export function getInfringementMeta(type: TachoInfringementType): InfringementMeta {
  return INFRINGEMENT_META[type];
}
