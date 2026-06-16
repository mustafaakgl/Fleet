'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_TOAST_EVENT, type AppToastDetail, type AppToastType } from '@/lib/toast';

type ToastState = {
  id: number;
  message: string;
  type: AppToastType;
};

function toastClass(type: AppToastType): string {
  if (type === 'success') return 'bg-emerald-700';
  if (type === 'error') return 'bg-red-700';
  return 'bg-slate-800';
}

export function GlobalToaster() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const customEvent = event as CustomEvent<AppToastDetail>;
      const detail = customEvent.detail;
      if (!detail?.message) {
        return;
      }

      const nextToast: ToastState = {
        id: Date.now(),
        message: detail.message,
        type: detail.type ?? 'info',
      };
      setToast(nextToast);

      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setToast((current) => (current?.id === nextToast.id ? null : current));
      }, detail.durationMs ?? 2800);
    };

    window.addEventListener(APP_TOAST_EVENT, onToast as EventListener);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, onToast as EventListener);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const className = useMemo(() => {
    if (!toast) return '';
    return toastClass(toast.type);
  }, [toast]);

  if (!toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
      <div className={`max-w-lg rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${className}`}>
        {toast.message}
      </div>
    </div>
  );
}
