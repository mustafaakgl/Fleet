'use client';

import { useEffect, useState } from 'react';

export function useDriverPortalServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let mounted = true;
    let removeListeners = () => undefined;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/driver-portal-sw.js', {
          scope: '/driver',
        });

        if (!mounted) return;

        const markUpdateAvailable = () => {
          if (navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        };

        if (registration.waiting) {
          markUpdateAvailable();
        }

        const onUpdateFound = () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
              markUpdateAvailable();
            }
          });
        };

        const checkForUpdate = () => {
          void registration.update();
        };

        registration.addEventListener('updatefound', onUpdateFound);
        window.addEventListener('focus', checkForUpdate);
        document.addEventListener('visibilitychange', checkForUpdate);

        removeListeners = () => {
          registration.removeEventListener('updatefound', onUpdateFound);
          window.removeEventListener('focus', checkForUpdate);
          document.removeEventListener('visibilitychange', checkForUpdate);
        };
      } catch {
        return;
      }
    };

    void register();

    return () => {
      mounted = false;
      removeListeners();
    };
  }, []);

  return {
    updateAvailable,
    acknowledgeUpdate: () => setUpdateAvailable(false),
  };
}
