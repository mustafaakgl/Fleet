import { create } from 'zustand';
import type { DriverSession } from '@/domain/models';
import { locationTrackingStore } from '@/features/tracking/store';
import { stopForegroundLocationWatcher } from '@/lib/location-tracking';
import { driverApi } from '@/api/endpoints';
import { storage } from '@/lib/storage';

const TOKEN_KEY = 'fleet.driver.accessToken';
const SESSION_KEY = 'fleet.driver.session';

type AuthState = {
  hydrated: boolean;
  accessToken: string | null;
  session: DriverSession | null;
  hydrate: () => Promise<void>;
  setSession: (session: DriverSession) => Promise<void>;
  updateSessionLanguage: (language: string) => Promise<void>;
  clearSession: () => Promise<void>;
};

export const authStore = create<AuthState>((set) => ({
  hydrated: false,
  accessToken: null,
  session: null,
  hydrate: async () => {
    try {
      const [accessToken, rawSession] = await Promise.all([
        storage.getItem(TOKEN_KEY),
        storage.getItem(SESSION_KEY),
      ]);
      let session: DriverSession | null = null;
      if (rawSession) {
        try {
          session = JSON.parse(rawSession) as DriverSession;
        } catch {
          await storage.deleteItem(SESSION_KEY);
        }
      }
      set({
        hydrated: true,
        accessToken: accessToken ?? null,
        session,
      });
    } catch {
      set({ hydrated: true, accessToken: null, session: null });
    }
  },
  setSession: async (session) => {
    await Promise.all([
      storage.setItem(TOKEN_KEY, session.accessToken),
      storage.setItem(SESSION_KEY, JSON.stringify(session)),
    ]);
    set({ accessToken: session.accessToken, session });
  },
  updateSessionLanguage: async (language) => {
    const current = authStore.getState().session;
    if (!current) {
      return;
    }
    const session: DriverSession = {
      ...current,
      user: { ...current.user, language },
    };
    await storage.setItem(SESSION_KEY, JSON.stringify(session));
    set({ session });
  },
  clearSession: async () => {
    try {
      await driverApi.clearPushToken();
    } catch {
      // ignore when offline or already logged out
    }
    try {
      const tracking = locationTrackingStore.getState();
      if (tracking.status?.sharingActive) {
        await tracking.endSharing();
      } else {
        await stopForegroundLocationWatcher();
      }
    } catch {
      await stopForegroundLocationWatcher();
    }
    locationTrackingStore.setState({
      status: null,
      loading: false,
      busy: false,
      lastLocalUploadAt: null,
      permissionDenied: false,
      uploadError: null,
      watcherActive: false,
      initialized: false,
    });
    await Promise.all([
      storage.deleteItem(TOKEN_KEY),
      storage.deleteItem(SESSION_KEY),
    ]);
    set({ accessToken: null, session: null });
  },
}));
