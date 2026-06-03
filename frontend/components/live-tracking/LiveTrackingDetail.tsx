'use client';

import { Badge } from '@/components/ui/badge';
import type { LiveTrackingItem } from '@/lib/types';
import {
  formatSpeed,
  formatTrackingTimestamp,
  statusBadgeVariant,
} from './tracking-utils';

interface LiveTrackingDetailProps {
  item: LiveTrackingItem | null;
}

export function LiveTrackingDetail({ item }: LiveTrackingDetailProps) {
  if (!item) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Select a driver or vehicle to view details.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{item.plateNumber ?? 'No vehicle'}</p>
          <p className="text-sm text-slate-600">{item.driverName}</p>
        </div>
        <Badge variant={statusBadgeVariant(item.status)} className="capitalize">
          {item.status}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm">
        <div>
          <dt className="text-slate-500">Company</dt>
          <dd className="font-medium text-slate-900">{item.companyName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Cargo</dt>
          <dd className="font-medium text-slate-900">{item.cargoName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Speed</dt>
          <dd className="font-medium text-slate-900">{formatSpeed(item.speedKmh)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Last update</dt>
          <dd className="font-medium text-slate-900">{formatTrackingTimestamp(item.receivedAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recorded at</dt>
          <dd className="font-medium text-slate-900">{formatTrackingTimestamp(item.recordedAt)}</dd>
        </div>
        {item.accuracyM !== null && item.accuracyM !== undefined ? (
          <div>
            <dt className="text-slate-500">Accuracy</dt>
            <dd className="font-medium text-slate-900">{Math.round(item.accuracyM)} m</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
