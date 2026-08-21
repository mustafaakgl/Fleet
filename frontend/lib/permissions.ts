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

/**
 * Arac yakit uyumlulugunu DEGISTIREBILENLER.
 *
 * Muhasebe bilincli olarak DISARIDA: sunucuda PUT
 * /vehicles/:id/fuel-compatibility `@RequiresWrite()` tasiyor ve WriteRoleGuard
 * yalnizca OPERATIONAL_WRITE_ROLES'e (admin, boss, office) izin veriyor.
 * Muhasebe araci GOREBILIR ama kaydedemez — buraya eklenirse arayuz duzenleme
 * dugmesi acar ve kullanici kaydederken 403 alir. Ikisi birlikte degismeli.
 */
export function canEditVehicleFuelCompatibility(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'office';
}

/**
 * Arac KAPASITE ve KISIT alanlarini degistirebilenler (Faz 17g).
 *
 * Yakit uyumlulugu ile AYNI kume ve ayni gerekce: sunucuda
 * `PATCH /vehicles/:id` `@RequiresWrite()` tasiyor ve `WriteRoleGuard`
 * yalnizca `OPERATIONAL_WRITE_ROLES`e (admin, boss, office) izin veriyor.
 * Muhasebe araci ve kapasitesini GORUR ama kaydedemez — buraya eklenirse
 * arayuz duzenleme dugmesi acar ve kullanici kaydederken 403 alir.
 */
export function canEditVehicleCapacity(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'office';
}

/**
 * Dispatch plani ACABILEN roller (Faz 17g).
 *
 * Sunucuda `POST /dispatch/proposals` `@RequiresWrite()` tasiyor ve
 * `WriteRoleGuard` yalnizca `OPERATIONAL_WRITE_ROLES`e izin veriyor. Muhasebe
 * kuyrugu ve finansal alanlari GORUR ama plan uretemez ve uygulayamaz.
 */
export function canPlanDispatch(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'office';
}

export function canImportCsv(role: Role) {
  return role === 'admin' || role === 'office';
}

export function canViewOperationalTachograph(role: Role) {
  return role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office';
}
