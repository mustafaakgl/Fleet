import type { Role } from './types';

export function canViewFinancials(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'accounting';
}

export function canViewCriticalAlerts(role: Role) {
  return role === 'office';
}

export function canViewOfficeQueue(role: Role) {
  return role === 'office';
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

/**
 * Muhasebe de dahil: servis kayitlari maliyet kaydidir ve faturasi muhasebede
 * duruyor. Sunucu tarafinda karsiligi service-records uclarindaki
 * `@RequiresWrite('accounting')` — biri degisirse digeri de degismeli, yoksa
 * arayuz duzenleme acar ve kaydederken 403 doner.
 */
export function canEditServiceRecords(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'office' || role === 'accounting';
}

export function canEditDriverVacationEntitlement(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'office';
}

export function canImportCsv(role: Role) {
  return role === 'admin' || role === 'office';
}

export function canViewOperationalTachograph(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office';
}
