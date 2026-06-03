import { Suspense } from 'react';
import { LiveTrackingPage } from '@/components/live-tracking/LiveTrackingPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <LiveTrackingPage />
    </Suspense>
  );
}
