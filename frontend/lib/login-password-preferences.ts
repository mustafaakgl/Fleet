const STORAGE_PREFIX = 'operion-login-password';

export type LoginPasswordPreferences = {
  username?: string;
  marketingOptIn?: boolean;
  timeZone?: string;
};

export const DEFAULT_LOGIN_PASSWORD_PREFERENCES: LoginPasswordPreferences = {
  marketingOptIn: false,
  timeZone: 'Europe/Berlin',
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function loadLoginPasswordPreferences(userId: string): LoginPasswordPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_LOGIN_PASSWORD_PREFERENCES };

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_LOGIN_PASSWORD_PREFERENCES };
    return { ...DEFAULT_LOGIN_PASSWORD_PREFERENCES, ...(JSON.parse(raw) as LoginPasswordPreferences) };
  } catch {
    return { ...DEFAULT_LOGIN_PASSWORD_PREFERENCES };
  }
}

export function saveLoginPasswordPreferences(userId: string, prefs: LoginPasswordPreferences) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
}

export function defaultUsernameFromEmail(email: string) {
  return email.split('@')[0]?.trim() ?? '';
}
