import type { FineStatus } from '@/lib/types';

export function fineStatusClass(status: FineStatus): string {
  if (status === 'neu') return 'bg-slate-100 text-slate-700';
  if (status === 'fahrer_zugeordnet') return 'bg-blue-100 text-blue-700';
  if (status === 'fahrer_benachrichtigt') return 'bg-amber-100 text-amber-800';
  if (status === 'bezahlt') return 'bg-emerald-100 text-emerald-700';
  if (status === 'widerspruch') return 'bg-rose-100 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

export function FineStatusBadge({
  status,
  label,
}: {
  status: FineStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${fineStatusClass(status)}`}
    >
      {label}
    </span>
  );
}
