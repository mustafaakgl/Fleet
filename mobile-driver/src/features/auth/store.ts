import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { DriverSession } from '@/domain/models';

const TOKEN_KEY = 'fleet.driver.accessToken';
const SESSION_KEY = 'fleet.driver.session';

type AuthState = {
  hydrated: boolean;
  accessToken: string | null;
  session: DriverSession | null;
  hydrate: () => Promise<void>;
  setSession: (session: DriverSession) => Promise<void>;
  clearSession: () => Promise<void>;
};

export const authStore = create<AuthState>((set) => ({
  hydrated: false,
  accessToken: null,
  session: null,
  hydrate: async () => {
    const [accessToken, rawSession] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(SESSION_KEY),
    ]);
    set({
      hydrated: true,
      accessToken: accessToken ?? null,
      session: rawSession ? (JSON.parse(rawSession) as DriverSession) : null,
    });
  },
  setSession: async (session) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, session.accessToken),
      SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session)),
    ]);
    set({ accessToken: session.accessToken, session });
  },
  clearSession: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(SESSION_KEY),
    ]);
    set({ accessToken: null, session: null });
  },
}));
