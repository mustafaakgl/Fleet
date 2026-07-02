'use client';

import { useEffect } from 'react';

const APP_NAME = 'Fleet';

export function usePageTitle(pageTitle: string | null | undefined) {
  useEffect(() => {
    if (!pageTitle) return;
    document.title = `${pageTitle} · ${APP_NAME}`;
    return () => {
      document.title = `${APP_NAME} — Fleet Management Platform`;
    };
  }, [pageTitle]);
}
