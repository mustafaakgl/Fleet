export function formatTachographDurationS(
  totalS: number,
  t: (key: string, opts?: Record<string, string | number>) => string,
): string {
  const rounded = Math.round(totalS);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0 && minutes > 0) {
    return t('tachograph.duration.hoursMinutes', { hours, minutes });
  }
  if (hours > 0) {
    return t('tachograph.duration.hours', { hours });
  }
  if (minutes > 0) {
    return t('tachograph.duration.minutes', { minutes });
  }
  return t('tachograph.duration.seconds', { seconds });
}
