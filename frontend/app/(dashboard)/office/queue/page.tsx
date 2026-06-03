import { Suspense } from 'react';
import { OfficeQueuePage } from '@/components/office/OfficeQueuePage';

export default function OfficeQueueRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <OfficeQueuePage />
    </Suspense>
  );
}
