import { WEEKLY_REST } from './constants';
import { addMs } from './time';
import type { CompensationDebt } from './types';

export function createCompensationDebt(owedSeconds: number, incurredAtMs: number): CompensationDebt {
  return {
    owedSeconds,
    incurredAtMs,
    dueByMs: addMs(incurredAtMs, WEEKLY_REST.COMPENSATION_DEADLINE_WEEKS * 7 * 24 * 3600 * 1000),
    repaidSeconds: 0,
  };
}

export function applyCompensationRepayment(
  debt: CompensationDebt,
  restSeconds: number,
  minimumRestS: number,
): CompensationDebt {
  if (restSeconds <= minimumRestS || debt.owedSeconds <= debt.repaidSeconds) {
    return debt;
  }

  const repayable = restSeconds - minimumRestS;
  return {
    ...debt,
    repaidSeconds: Math.min(debt.owedSeconds, debt.repaidSeconds + repayable),
  };
}

export function isCompensationDebtUnpaid(debt: CompensationDebt, atMs: number): boolean {
  return debt.repaidSeconds < debt.owedSeconds && atMs > debt.dueByMs;
}
