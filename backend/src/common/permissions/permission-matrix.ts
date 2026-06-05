import type { UserRole } from '../utils/permissions';
import {
  ADMIN_ONLY_ROLES,
  FINANCIAL_ROLES,
  OPERATIONAL_ROLES,
  OPERATIONAL_WRITE_ROLES,
} from '../utils/permissions';

export type PermissionAction = 'read' | 'write' | 'admin';

export type ModulePermission = {
  module: string;
  read: UserRole[];
  write: UserRole[];
  admin?: UserRole[];
  notes?: string;
};

/** Canonical RBAC matrix — keep in sync with controller @Roles decorators. */
export const PERMISSION_MATRIX: ModulePermission[] = [
  {
    module: 'users',
    read: ADMIN_ONLY_ROLES,
    write: ADMIN_ONLY_ROLES,
    admin: ADMIN_ONLY_ROLES,
  },
  {
    module: 'drivers',
    read: OPERATIONAL_ROLES,
    write: OPERATIONAL_WRITE_ROLES,
  },
  {
    module: 'vehicles',
    read: OPERATIONAL_ROLES,
    write: OPERATIONAL_WRITE_ROLES,
  },
  {
    module: 'companies',
    read: OPERATIONAL_ROLES,
    write: OPERATIONAL_WRITE_ROLES,
    notes: 'accounting: read + financial fields; no master-data writes',
  },
  {
    module: 'assignments',
    read: OPERATIONAL_ROLES,
    write: OPERATIONAL_WRITE_ROLES,
  },
  {
    module: 'service_records',
    read: OPERATIONAL_ROLES,
    write: OPERATIONAL_WRITE_ROLES,
    notes: 'accounting: read costs masked unless FINANCIAL_ROLES',
  },
  {
    module: 'billing',
    read: ADMIN_ONLY_ROLES,
    write: ADMIN_ONLY_ROLES,
  },
  {
    module: 'privacy',
    read: ADMIN_ONLY_ROLES,
    write: ADMIN_ONLY_ROLES,
  },
  {
    module: 'audit_logs',
    read: ['admin', 'boss'],
    write: [],
  },
  {
    module: 'customer_portal',
    read: ['customer'],
    write: [],
  },
  {
    module: 'driver_mobile',
    read: ['driver'],
    write: ['driver'],
  },
];

export function canPerformAction(role: UserRole | undefined, action: PermissionAction): boolean {
  if (!role) return false;
  if (action === 'admin') return ADMIN_ONLY_ROLES.includes(role);
  if (action === 'write') return OPERATIONAL_WRITE_ROLES.includes(role);
  if (action === 'read') return OPERATIONAL_ROLES.includes(role) || FINANCIAL_ROLES.includes(role);
  return false;
}
