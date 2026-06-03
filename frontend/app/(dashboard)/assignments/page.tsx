import { Suspense } from 'react';
import { EinsatzplanPage } from '@/components/einsatzplan/EinsatzplanPage';

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <EinsatzplanPage />
    </Suspense>
  );
}
