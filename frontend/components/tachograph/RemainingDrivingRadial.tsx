'use client';

import { RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { formatTachographDurationS } from '@/lib/tachograph-format';
import type { TachographRemainingDriver } from '@/lib/types';

function remainingRadialColor(remainingS: number): string {
  if (remainingS < 3600) return '#dc2626';
  if (remainingS < 2 * 3600) return '#f59e0b';
  return '#059669';
}

export function RemainingDrivingRadial({
  driver,
  t,
  estimated,
}: {
  driver: TachographRemainingDriver;
  t: (key: string, opts?: Record<string, string | number>) => string;
  estimated?: boolean;
}) {
  const dailyLimitS = driver.todayDrivingS + driver.todayRemainingDrivingS;
  const fillPct = dailyLimitS > 0 ? Math.round((driver.todayRemainingDrivingS / dailyLimitS) * 100) : 0;
  const radialFill = remainingRadialColor(driver.todayRemainingDrivingS);
  const breakSoon = driver.nextMandatoryBreakInS > 0 && driver.nextMandatoryBreakInS < 30 * 60;

  return (
    <div className="space-y-2">
      <div className="relative mx-auto h-32 w-full max-w-[190px]" data-testid="remaining-driving-radial">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={[{ name: 'remaining', value: fillPct, fill: radialFill }]}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#f1f5f9' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'tabular-nums text-lg font-semibold',
              driver.todayRemainingDrivingS < 3600
                ? 'text-red-700'
                : driver.todayRemainingDrivingS < 2 * 3600
                  ? 'text-amber-700'
                  : 'text-slate-900',
            )}
          >
            {formatTachographDurationS(driver.todayRemainingDrivingS, t)}
          </span>
          <span className="text-[10px] text-slate-500">{t('liveTracking.remainingDrivingLabel')}</span>
        </div>
      </div>

      <p className="text-center text-xs text-slate-600">
        {breakSoon ? <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
        {t('tachograph.remaining.nextBreak', {
          duration: formatTachographDurationS(driver.nextMandatoryBreakInS, t),
        })}
      </p>
      {estimated ? <p className="text-center text-[11px] text-slate-400">{t('liveTracking.estimatedData')}</p> : null}
    </div>
  );
}
