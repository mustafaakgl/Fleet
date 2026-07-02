'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function KpiRowSkeleton({
  count = 5,
  className,
  ...props
}: {
  count?: number;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-5', className)}
      data-testid="skeleton-kpi-row"
      {...props}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function MatrixSkeleton({
  rows = 8,
  columns = 6,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}
      data-testid="skeleton-matrix"
    >
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="space-y-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={`head-${index}`} className="h-3 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, colIndex) => (
              <Skeleton key={`${rowIndex}-${colIndex}`} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ className, heightClass = 'h-64' }: { className?: string; heightClass?: string }) {
  return (
    <div
      className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}
      data-testid="skeleton-chart"
    >
      <Skeleton className="mb-4 h-5 w-48" />
      <div className={cn('relative', heightClass)}>
        <Skeleton className="absolute inset-0 rounded-md" />
        <Skeleton className="absolute bottom-4 left-4 h-px w-[calc(100%-2rem)]" />
        <Skeleton className="absolute bottom-4 left-4 h-[calc(100%-2rem)] w-px" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}
      data-testid="skeleton-card-grid"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
          <Skeleton className="mt-2 h-2 w-3/4 rounded-full" />
        </div>
      ))}
    </div>
  );
}
