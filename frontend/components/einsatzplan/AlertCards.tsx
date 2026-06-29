import type { AlertItem } from './types';

interface AlertCardsProps {
  alerts: AlertItem[];
}

const toneStyles: Record<AlertItem['tone'], string> = {
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-rose-200 bg-rose-50',
  info: 'border-surface-border bg-surface',
  success: 'border-emerald-200 bg-emerald-50',
};

export function AlertCards({ alerts }: AlertCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {alerts.map((alert) => (
        <div key={alert.id} className={`rounded-xl border p-4 shadow-sm ${toneStyles[alert.tone]}`}>
          <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
          <p className="mt-1 text-xs text-gray-600">{alert.description}</p>
        </div>
      ))}
    </div>
  );
}
