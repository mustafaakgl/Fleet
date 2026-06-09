import { cn } from '@/lib/utils';
import { FLEET_MOBILE_CARD } from '@/lib/fleet-table';

type MobileDataCardProps = {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function MobileDataCard({
  title,
  subtitle,
  badge,
  onClick,
  children,
  actions,
  className,
}: MobileDataCardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(onClick && FLEET_MOBILE_CARD, !onClick && 'rounded-lg border border-slate-200 bg-white p-3', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>{actions}</div> : null}
    </Component>
  );
}

export function MobileFieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">{children}</dl>;
}

export function MobileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-700">{value}</dd>
    </div>
  );
}
