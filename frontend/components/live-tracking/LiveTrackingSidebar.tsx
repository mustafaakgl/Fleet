'use client';

import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { LiveTrackingItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { LiveTrackingDetail } from './LiveTrackingDetail';
import {
  formatSpeed,
  formatTrackingTimestamp,
  type StatusFilter,
  statusBadgeVariant,
} from './tracking-utils';

interface LiveTrackingSidebarProps {
  items: LiveTrackingItem[];
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  includeOffline: boolean;
  onIncludeOfflineChange: (value: boolean) => void;
  selectedDriverId: string | null;
  onSelect: (item: LiveTrackingItem) => void;
  lastFetchedAt: Date | null;
}

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'stale', label: 'Stale' },
  { value: 'offline', label: 'Offline' },
];

export function LiveTrackingSidebar({
  items,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  includeOffline,
  onIncludeOfflineChange,
  selectedDriverId,
  onSelect,
  lastFetchedAt,
}: LiveTrackingSidebarProps) {
  const selectedItem = items.find((item) => item.driverId === selectedDriverId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search driver, plate, company..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusFilterChange(filter.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === filter.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeOffline}
            onChange={(event) => onIncludeOfflineChange(event.target.checked)}
            className="rounded border-slate-300"
          />
          Include offline drivers
        </label>

        <p className="text-xs text-slate-500">
          Last update:{' '}
          {lastFetchedAt
            ? new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(lastFetchedAt)
            : '—'}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            No vehicles match the current filters.
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.driverId}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                selectedDriverId === item.driverId
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{item.plateNumber ?? 'No vehicle'}</p>
                  <p className="text-sm text-slate-600">{item.driverName}</p>
                  {item.companyName ? (
                    <p className="mt-1 text-xs text-slate-500">{item.companyName}</p>
                  ) : null}
                </div>
                <Badge variant={statusBadgeVariant(item.status)} className="capitalize">
                  {item.status}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>{formatSpeed(item.speedKmh)}</span>
                <span>{formatTrackingTimestamp(item.receivedAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      <LiveTrackingDetail item={selectedItem} />
    </div>
  );
}
