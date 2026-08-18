export type UserRole = 'admin' | 'boss' | 'accounting' | 'office' | 'driver' | 'customer';

export const OPERATIONAL_ROLES: UserRole[] = ['admin', 'boss', 'accounting', 'office'];
export const OPERATIONAL_WRITE_ROLES: UserRole[] = ['admin', 'boss', 'office'];
export const FINANCIAL_ROLES: UserRole[] = ['admin', 'boss', 'accounting'];
/**
 * Giden faturalari gorup duzenleyebilenler.
 *
 * FINANCIAL_ROLES'ten AYRI tutuluyor, ona office EKLENMIYOR: o grup ayni
 * zamanda Lohnvorbereitung'u (maas verisi) ve Stripe aboneligini koruyor.
 * Office'in fatura kesmesi gerekiyor, calisanlarin ucretini gormesi
 * gerekmiyor — iki yetkiyi tek listede birlestirmek maas verisini sessizce
 * acardi.
 *
 * Bu grup fatura controller'inin VARSAYILANI; sirketin kendi banka/vergi
 * bilgileri (billing-profile), DATEV ihracati ve odeme silme uc bazinda
 * FINANCIAL_ROLES'te kaliyor.
 */
export const INVOICING_ROLES: UserRole[] = [...FINANCIAL_ROLES, 'office'];
/**
 * Ordivan otomasyonu (Faz 12): connector ekrani ve oneri kuyrugu.
 *
 * `admin` + `boss`. Accounting ve office BILINCLI OLARAK DISARIDA: bu ekran
 * bir makineye kiraci capinda yetki veren enrollment kodu uretiyor ve ajan
 * onerilerini onayliyor. Yetki devri kararidir, gunluk operasyon degil.
 */
export const AUTOMATION_ROLES: UserRole[] = ['admin', 'boss'];

export const ADMIN_ONLY_ROLES: UserRole[] = ['admin'];
export const CSV_IMPORT_ROLES: UserRole[] = ['admin', 'office'];

const SENSITIVE_FINANCIAL_KEYS = new Set([
  'revenueAnalytics',
  'chartAnalytics',
  'dailyRevenue',
  'monthlyRevenue',
  'todayRevenue',
  'weeklyRevenue',
  'monthlyRevenue',
  'revenueByCompany',
  'revenue',
  'expectedRevenue',
  'amount',
  'defaultDailyRevenue',
  'default_daily_revenue',
  'damageValue',
  'damage_value',
  'cost',
  'costAmount',
  'cost_amount',
  'serviceCost',
  'service_cost',
  'fuelCost',
  'fuel_cost',
  'price',
  'salary',
  'invoice',
  'financial',
]);

export function canViewFinancialFields(role?: string): boolean {
  return FINANCIAL_ROLES.includes((role ?? '') as UserRole);
}

export function maskFinancialFields<T>(data: T, role?: string): T {
  if (canViewFinancialFields(role)) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskFinancialFields(item, role)) as T;
  }

  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_FINANCIAL_KEYS.has(key)) {
        result[key] = null;
        continue;
      }

      result[key] = maskFinancialFields(value, role);
    }

    return result as T;
  }

  return data;
}