import type { PlanStatus } from './types';

interface StatusBadgeProps {
  status: PlanStatus;
}

const styleByStatus: Record<PlanStatus, string> = {
  planned: 'bg-surface text-brand-primary',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  sick: 'bg-rose-100 text-rose-700',
  vacation: 'bg-violet-100 text-violet-700',
  empty: 'bg-gray-100 text-gray-600',
};

function label(status: PlanStatus): string {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styleByStatus[status]}`}>
      {label(status)}
    </span>
  );
}
