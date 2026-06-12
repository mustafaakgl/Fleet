const STORAGE_PREFIX = 'operion-user-profile';

export type FuelEconomyDisplay = 'mpg_us' | 'mpg_uk' | 'l_per_100km' | 'km_per_l';
export type TableDensity = 'default' | 'compact';

export type UserProfilePreferences = {
  profilePhotoDataUrl?: string;
  fuelEconomyDisplay?: FuelEconomyDisplay;
  itemsPerPage?: number;
  tableDensity?: TableDensity;
};

export const DEFAULT_USER_PROFILE_PREFERENCES: UserProfilePreferences = {
  fuelEconomyDisplay: 'l_per_100km',
  itemsPerPage: 50,
  tableDensity: 'default',
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function loadUserProfilePreferences(userId: string): UserProfilePreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_PROFILE_PREFERENCES };

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_USER_PROFILE_PREFERENCES };
    return { ...DEFAULT_USER_PROFILE_PREFERENCES, ...(JSON.parse(raw) as UserProfilePreferences) };
  } catch {
    return { ...DEFAULT_USER_PROFILE_PREFERENCES };
  }
}

export function saveUserProfilePreferences(userId: string, prefs: UserProfilePreferences) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
}

export function splitDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildDisplayName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}
