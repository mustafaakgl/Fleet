export const FLEET_MAINTENANCE_DUE_SOON_KM = 500;
export const FLEET_MAINTENANCE_DUE_SOON_DAYS = 14;

export type MaintenanceRuleInput = {
  id: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneAtKm: number | null;
  lastDoneAtDate: Date | null;
  createdAt: Date;
};

export type MaintenanceRuleStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown';

export type MaintenanceRuleStatusView = {
  id: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneAtKm: number | null;
  lastDoneAtDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  nextDueAtKm: number | null;
  nextDueAtDate: string | null;
  status: MaintenanceRuleStatus;
};

export function computeMaintenanceRuleStatus(
  rule: MaintenanceRuleInput,
  currentOdometerKm: number,
  today: Date = new Date(),
): MaintenanceRuleStatusView {
  let remainingKm: number | null = null;
  let remainingDays: number | null = null;
  let nextDueAtKm: number | null = null;
  let nextDueAtDate: string | null = null;
  let status: MaintenanceRuleStatus = 'unknown';

  if (rule.intervalKm != null && rule.intervalKm > 0) {
    const anchorKm = rule.lastDoneAtKm ?? 0;
    nextDueAtKm = round(anchorKm + rule.intervalKm, 3);
    remainingKm = round(nextDueAtKm - currentOdometerKm, 3);
    status = mergeStatus(status, classifyRemaining(remainingKm, FLEET_MAINTENANCE_DUE_SOON_KM));
  }

  if (rule.intervalDays != null && rule.intervalDays > 0) {
    const anchorDate = rule.lastDoneAtDate ?? rule.createdAt;
    const dueDate = addDays(anchorDate, rule.intervalDays);
    nextDueAtDate = dueDate.toISOString().slice(0, 10);
    remainingDays = Math.ceil(
      (startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / 86_400_000,
    );
    status = mergeStatus(status, classifyRemaining(remainingDays, FLEET_MAINTENANCE_DUE_SOON_DAYS));
  }

  if (status === 'unknown' && (rule.intervalKm != null || rule.intervalDays != null)) {
    status = 'ok';
  }

  return {
    id: rule.id,
    name: rule.name,
    intervalKm: rule.intervalKm,
    intervalDays: rule.intervalDays,
    lastDoneAtKm: rule.lastDoneAtKm,
    lastDoneAtDate: rule.lastDoneAtDate?.toISOString().slice(0, 10) ?? null,
    remainingKm,
    remainingDays,
    nextDueAtKm,
    nextDueAtDate,
    status,
  };
}

function classifyRemaining(remaining: number, dueSoonThreshold: number): MaintenanceRuleStatus {
  if (remaining < 0) {
    return 'overdue';
  }
  if (remaining <= dueSoonThreshold) {
    return 'due_soon';
  }
  return 'ok';
}

function mergeStatus(
  current: MaintenanceRuleStatus,
  next: MaintenanceRuleStatus,
): MaintenanceRuleStatus {
  const priority: Record<MaintenanceRuleStatus, number> = {
    unknown: 0,
    ok: 1,
    due_soon: 2,
    overdue: 3,
  };

  return priority[next] > priority[current] ? next : current;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
