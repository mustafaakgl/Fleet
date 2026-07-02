const PER100KM_BANDS = [
  { max: 0.5, className: 'bg-red-50' },
  { max: 1.5, className: 'bg-red-100' },
  { max: 3, className: 'bg-red-200' },
  { max: Number.POSITIVE_INFINITY, className: 'bg-red-300' },
] as const;

export function per100KmIntensityClass(value: number): string {
  if (value <= 0) return 'bg-transparent';
  for (const band of PER100KM_BANDS) {
    if (value <= band.max) return band.className;
  }
  return PER100KM_BANDS[PER100KM_BANDS.length - 1]!.className;
}

export function driverScoreTextClass(score: number | null, insufficientData: boolean): string {
  if (insufficientData || score === null) return 'text-slate-500';
  if (score >= 80) return 'text-emerald-700';
  if (score >= 60) return 'text-amber-700';
  return 'text-red-700';
}

export function coolantTempClass(celsius: number | null): string {
  if (celsius === null) return '';
  if (celsius > 105) return 'text-red-700';
  return '';
}

export function voltageClass(volts: number | null): string {
  if (volts === null) return '';
  if (volts < 11.3) return 'text-red-700';
  if (volts < 11.8) return 'text-amber-700';
  return '';
}
