import { AuthUser } from './types';
import { jwtDecode } from 'jwt-decode';

const TOKEN_KEY = 'accessToken';
const USER_KEY = 'user';
const LEGACY_TOKEN_KEY = 'fleet_access_token';
const LEGACY_USER_KEY = 'fleet_user';

export const MOCK_CURRENT_USER: AuthUser = {
  id: 'u1',
  name: 'Meryem Erdogan',
  email: 'meryem@fleet.com',
  role: 'office',
  department: 'fleet',
};

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
    });
  } catch {
    return null;
  }
}

export function setDevelopmentRole(role: AuthUser['role']): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const current = getUser() ?? MOCK_CURRENT_USER;
  const next: AuthUser = {
    ...current,
    role,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

function normalizeUserRole(user: AuthUser): AuthUser {
  if (user.role === 'admin' || user.role === 'boss' || user.role === 'accounting' || user.role === 'office') {
    return user;
  }

  return {
    ...user,
    role: 'office',
  };
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
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
