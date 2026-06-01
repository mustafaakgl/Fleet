const AUTH_TOKEN_KEY = 'fleet_auth_token';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getAuthToken(): string | null {
  if (!canUseStorage()) {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export { AUTH_TOKEN_KEY };
