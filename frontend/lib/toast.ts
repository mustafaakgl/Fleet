'use client';

export type AppToastType = 'success' | 'error' | 'info';

export type AppToastDetail = {
  message: string;
  type?: AppToastType;
  durationMs?: number;
};

export const APP_TOAST_EVENT = 'app:toast';

export function showToast(detail: AppToastDetail): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail }));
}
