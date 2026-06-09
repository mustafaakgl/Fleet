import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_ACTIONS,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
} from '@/lib/fleet-table';

type PageHeaderProps = {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  count?: number | string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  icon: Icon,
  iconClassName,
  title,
  count,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn(FLEET_PAGE_HEADER, className)}>
      <div className="min-w-0">
        <div className={FLEET_PAGE_HEADER_TITLE}>
          {Icon ? (
            <Icon className={cn('h-5 w-5 shrink-0 sm:h-6 sm:w-6', iconClassName)} />
          ) : null}
          <h1 className={cn(FLEET_PAGE_TITLE, 'truncate')}>{title}</h1>
          {count !== undefined ? (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">
              {count}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className={FLEET_PAGE_HEADER_ACTIONS}>{actions}</div> : null}
    </div>
  );
}
