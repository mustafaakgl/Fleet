import type { UserRole } from '@/lib/types';

const STORAGE_PREFIX = 'operion-contact-profile';

export type ContactUserAccess = 'enabled' | 'none';

export type ContactProfile = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  group?: string;
  profilePhotoDataUrl?: string;
  operator?: boolean;
  employee?: boolean;
  technician?: boolean;
  userAccess?: ContactUserAccess;
  userRole?: UserRole;
  mobilePhone?: string;
  homePhone?: string;
  workPhone?: string;
  otherPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  jobTitle?: string;
  dateOfBirth?: string;
  employeeNumber?: string;
  startDate?: string;
  leaveDate?: string;
  licenseNumber?: string;
  licenseClass?: string;
  licenseState?: string;
  hourlyLaborRate?: string;
  samlId?: string;
};

export const EMPTY_CONTACT_PROFILE: ContactProfile = {
  userAccess: 'none',
  userRole: 'office',
  operator: false,
  employee: false,
  technician: false,
  country: 'DE',
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function emailStorageKey(email: string) {
  return `${STORAGE_PREFIX}:email:${email.trim().toLowerCase()}`;
}

export function loadContactProfile(userId: string, email?: string): ContactProfile {
  if (typeof window === 'undefined') return { ...EMPTY_CONTACT_PROFILE };

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      return { ...EMPTY_CONTACT_PROFILE, ...(JSON.parse(raw) as ContactProfile) };
    }

    if (email) {
      const byEmail = localStorage.getItem(emailStorageKey(email));
      if (byEmail) {
        const parsed = { ...EMPTY_CONTACT_PROFILE, ...(JSON.parse(byEmail) as ContactProfile) };
        localStorage.setItem(storageKey(userId), JSON.stringify(parsed));
        localStorage.removeItem(emailStorageKey(email));
        return parsed;
      }
    }

    return { ...EMPTY_CONTACT_PROFILE };
  } catch {
    return { ...EMPTY_CONTACT_PROFILE };
  }
}

export function saveContactProfile(userId: string, profile: ContactProfile) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId), JSON.stringify(profile));
}

export function saveContactProfileByEmail(email: string, profile: ContactProfile) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(emailStorageKey(email), JSON.stringify(profile));
}

export function buildContactFullName(profile: ContactProfile) {
  return [profile.firstName?.trim(), profile.middleName?.trim(), profile.lastName?.trim()]
    .filter(Boolean)
    .join(' ');
}

export function splitContactFullName(fullName: string): Pick<ContactProfile, 'firstName' | 'middleName' | 'lastName'> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function contactInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function inferUserAccess(userStatus: 'active' | 'inactive', profile: ContactProfile): ContactUserAccess {
  if (profile.userAccess) return profile.userAccess;
  return userStatus === 'active' ? 'enabled' : 'none';
}
