import type { HTMLAttributes } from 'react';

type SkeletonLoaderProps = HTMLAttributes<HTMLDivElement>;

export function SkeletonLoader({ className = '', ...props }: SkeletonLoaderProps) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`.trim()} {...props} />;
}

type TableRowSkeletonProps = {
  rows?: number;
};

export function TableRowSkeleton({ rows = 5 }: TableRowSkeletonProps) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`table-row-skeleton-${rowIndex}`} className="grid grid-cols-5 gap-3">
          <SkeletonLoader className="h-8 w-full" />
          <SkeletonLoader className="h-8 w-full" />
          <SkeletonLoader className="h-8 w-full" />
          <SkeletonLoader className="h-8 w-full" />
          <SkeletonLoader className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <SkeletonLoader className="mb-4 h-5 w-1/3" />
      <div className="space-y-2">
        <SkeletonLoader className="h-4 w-full" />
        <SkeletonLoader className="h-4 w-5/6" />
        <SkeletonLoader className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <SkeletonLoader className="mb-2 h-8 w-24" />
      <SkeletonLoader className="h-4 w-1/2" />
    </div>
  );
}
