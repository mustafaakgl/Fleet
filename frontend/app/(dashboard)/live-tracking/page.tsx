import { Suspense } from 'react';
import { LiveTrackingPage } from '@/components/live-tracking/LiveTrackingPage';
import { Skeleton } from '@/components/ui/skeleton';

export default function Page() {
  return (
    <Suspense fallback={<div className="space-y-3 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-[420px] w-full" /></div>}>
      <LiveTrackingPage />
    </Suspense>
  );
}
