import { AuthUser } from './types';
import { jwtDecode } from 'jwt-decode';

const TOKEN_KEY = 'accessToken';
const USER_KEY = 'user';
const LEGACY_TOKEN_KEY = 'fleet_access_token';
const LEGACY_USER_KEY = 'fleet_user';
const SKIP_AUTO_LOGIN_KEY = 'fleet_skip_auto_login';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  department_id?: string;
  iat: number;
  exp: number;
}

export function saveAuth(token: string, user: AuthUser): void {
  if (typeof window === 'undefined') return;
  const normalizedUser = normalizeUserRole({
    ...user,
    name: user.name ?? user.email,
  });
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
  // Keep legacy keys for backward compatibility during transition.
  localStorage.setItem(LEGACY_TOKEN_KEY, token);
  localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(normalizedUser));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY) ?? localStorage.getItem(LEGACY_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.email || !parsed.role) return null;
    return normalizeUserRole({
      id: parsed.id ?? 'unknown',
      email: parsed.email,
      role: parsed.role,
      name: parsed.name ?? parsed.email,
      department: parsed.department,
      language: parsed.language,
      fleet_ops: parsed.fleet_ops,
      companyIds: parsed.companyIds,
      companyId: parsed.companyId,
      companies: parsed.companies,
    });
  } catch {
    return null;
  }
}

function normalizeUserRole(user: AuthUser): AuthUser {
  if (
    user.role === 'admin' ||
    user.role === 'boss' ||
    user.role === 'accounting' ||
    user.role === 'office' ||
    user.role === 'driver' ||
    user.role === 'customer'
  ) {
    return user;
  }

  return {
    ...user,
    role: 'office',
  };
}

export function getPostLoginPath(role: AuthUser['role'] | string): string {
  if (role === 'customer') {
    return '/portal/dashboard';
  }

  if (role === 'driver') {
    return '/driver';
  }

  return '/dashboard';
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

/** After explicit logout, skip dev auto-login so the user can sign in manually. */
export function markManualLoginRequired(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SKIP_AUTO_LOGIN_KEY, '1');
}

export function shouldSkipAutoLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SKIP_AUTO_LOGIN_KEY) === '1';
}

export function clearManualLoginRequired(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SKIP_AUTO_LOGIN_KEY);
}

/** Update cached user fields after profile edits (keeps existing token). */
export function updateLocalUser(partial: Partial<AuthUser>): void {
  const token = getToken();
  const user = getUser();
  if (!token || !user) return;
  saveAuth(token, { ...user, ...partial });
}

/** Clear session, revoke the server-side refresh token, and redirect to login. */
export function performLogout(redirectTo = '/login?manual=1'): void {
  clearAuth();
  markManualLoginRequired();
  if (typeof window !== 'undefined') {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
    // Fire-and-forget: revoke the refresh cookie server-side before navigating.
    void fetch(`${base}/auth/logout`, { method: 'POST', credentials: 'include' })
      .catch(() => undefined)
      .finally(() => {
        window.location.assign(redirectTo);
      });
  }
}

export function isTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;

  // Some environments can return opaque (non-JWT) access tokens.
  // In that case, treat a present token as authenticated on the client.
  if (!token.includes('.')) {
    return true;
  }

  try {
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.exp * 1000 > Date.now();
  } catch {
    return true;
  }
}

export function isAuthenticated(): boolean {
  return isTokenValid() && getUser() !== null;
}
