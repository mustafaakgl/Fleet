import { MessengerDepartment } from '@prisma/client';
import type { UserRole } from '@prisma/client';

export const MESSENGER_DEPARTMENTS = [
  'dispatch',
  'hr',
  'accounting',
  'maintenance',
  'general',
] as const satisfies readonly MessengerDepartment[];

export type MessengerDepartmentValue = (typeof MESSENGER_DEPARTMENTS)[number];

const DEPARTMENT_ACCESS: Record<UserRole, MessengerDepartmentValue[]> = {
  admin: ['dispatch', 'hr', 'accounting', 'maintenance', 'general'],
  boss: ['dispatch', 'hr', 'accounting', 'maintenance', 'general'],
  office: ['dispatch', 'hr', 'maintenance', 'general'],
  accounting: ['accounting', 'general'],
  driver: ['dispatch', 'hr', 'accounting', 'maintenance', 'general'],
  customer: ['general'],
};

export function normalizeMessengerDepartment(value?: string): MessengerDepartmentValue {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed && MESSENGER_DEPARTMENTS.includes(trimmed as MessengerDepartmentValue)) {
    return trimmed as MessengerDepartmentValue;
  }
  return 'general';
}

export function allowedDepartmentsForRole(role: UserRole): MessengerDepartmentValue[] {
  return DEPARTMENT_ACCESS[role] ?? ['general'];
}

export function canAccessDepartment(role: UserRole, department: MessengerDepartmentValue): boolean {
  return allowedDepartmentsForRole(role).includes(department);
}
