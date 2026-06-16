'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CustomerPortalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CustomerPortalError({ error, reset }: CustomerPortalErrorProps) {
  useEffect(() => {
    console.error('[customer-portal] route error', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-red-50 p-3">
        <AlertTriangle className="h-7 w-7 text-red-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900">Something went wrong</h2>
      <p className="text-sm text-slate-600">
        We could not load this page. Please try again.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
