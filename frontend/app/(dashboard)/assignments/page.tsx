import { Suspense } from 'react';
import { EinsatzplanPage } from '@/components/einsatzplan/EinsatzplanPage';
import { Skeleton } from '@/components/ui/skeleton';

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<div className="space-y-3 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>}>
      <EinsatzplanPage />
    </Suspense>
  );
}
