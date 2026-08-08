'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Registers the driver portal service worker and surfaces waiting updates.
 *
 * Not registered in development. Dev chunk URLs are unhashed (`…/driver/page.js`),
 * so a cached copy shadowed every later edit: restarting the dev server, clearing
 * .next and hard-reloading all had no effect, and only unregistering by hand
 * brought the new code back. Production names are content-hashed, so the cache
 * only ever helps there.
 */
const SW_URL = '/driver-portal-sw.js';
const SW_SCOPE = '/driver';
const SW_VERSION = process.env.NEXT_PUBLIC_SW_VERSION || 'dev';

export function useDriverPortalServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let mounted = true;
    let removeListeners = () => undefined as void;

    // Clean up after ourselves on machines that already registered a worker
    // before this guard existed, otherwise those browsers stay stuck on the
    // cached shell with no obvious cause.
    const unregisterInDevelopment = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('driver-portal-shell-')).map((key) => caches.delete(key)),
      );
    };

    if (process.env.NODE_ENV === 'development') {
      void unregisterInDevelopment().catch(() => undefined);
      return;
    }

    const register = async () => {
      try {
        // The version in the query makes each build a different worker URL, which
        // is what triggers an install and lets activate drop the previous cache.
        const registration = await navigator.serviceWorker.register(
          `${SW_URL}?v=${encodeURIComponent(SW_VERSION)}`,
          { scope: SW_SCOPE },
        );

        if (!mounted) return;

        const markWaiting = (worker: ServiceWorker | null) => {
          // Only meaningful once a worker already controls the page; on a first
          // visit the freshly installed worker is not an "update".
          if (worker && navigator.serviceWorker.controller) {
            waitingRef.current = worker;
            setUpdateAvailable(true);
          }
        };

        markWaiting(registration.waiting);

        const onUpdateFound = () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
              markWaiting(registration.waiting ?? installing);
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

  /**
   * Hands over to the waiting worker, then reloads once it controls the page.
   * Reloading without this leaves the old worker in charge and the banner comes
   * straight back.
   */
  const applyUpdate = useCallback(() => {
    const waiting = waitingRef.current;
    setUpdateAvailable(false);

    if (!waiting) {
      window.location.reload();
      return;
    }

    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // If the handover does not land, reload anyway rather than stranding the driver.
    window.setTimeout(reload, 3000);
  }, []);

  return { updateAvailable, applyUpdate };
}
