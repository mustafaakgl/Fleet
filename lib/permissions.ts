import type { Role } from './types';

export function canViewFinancials(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'accounting';
}

export function canManageUsers(role: Role) {
  return role === 'admin';
}

export function canManageSettings(role: Role) {
  return role === 'admin';
}

export function canViewVehicleHandovers(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office';
}

export function canEditVehicleHandovers(role: Role) {
  return role === 'admin' || role === 'office';
}
