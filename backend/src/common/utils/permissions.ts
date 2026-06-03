export type UserRole = 'admin' | 'boss' | 'accounting' | 'office' | 'driver' | 'customer';

export const OPERATIONAL_ROLES: UserRole[] = ['admin', 'boss', 'accounting', 'office'];
export const OPERATIONAL_WRITE_ROLES: UserRole[] = ['admin', 'boss', 'office'];
export const FINANCIAL_ROLES: UserRole[] = ['admin', 'boss', 'accounting'];
export const ADMIN_ONLY_ROLES: UserRole[] = ['admin'];

const SENSITIVE_FINANCIAL_KEYS = new Set([
  'revenueAnalytics',
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