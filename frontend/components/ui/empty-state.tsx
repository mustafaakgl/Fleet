import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-white p-3 shadow-sm">
        <Icon className="h-6 w-6 text-slate-500" />
      </div>
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-lg text-sm text-slate-600">{subtitle}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
