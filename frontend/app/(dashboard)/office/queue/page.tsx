import { Suspense } from 'react';
import { OfficeQueuePage } from '@/components/office/OfficeQueuePage';
import { Skeleton } from '@/components/ui/skeleton';

export default function OfficeQueueRoute() {
  return (
    <Suspense fallback={<div className="space-y-3 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>}>
      <OfficeQueuePage />
    </Suspense>
  );
}
