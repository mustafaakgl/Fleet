'use client';

import { useEffect } from 'react';
import { driverPortalApi } from '@/lib/api';
import { applyDriverPortalLanguage } from '@/lib/driver-portal-language';

export function DriverLanguageSync() {
  useEffect(() => {
    driverPortalApi
      .me()
      .then((profile) => applyDriverPortalLanguage(profile.user.language))
      .catch(() => undefined);
  }, []);

  return null;
}
