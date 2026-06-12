import Link from 'next/link';
import { cn } from '@/lib/utils';
import { OperionMark } from './OperionMark';

type OperionLogoProps = {
  className?: string;
  href?: string | null;
  /** Sidebar / dark header */
  onDark?: boolean;
  /** Hide wordmark on md, show from lg (collapsed tablet sidebar) */
  compact?: boolean;
  /** Icon only — never show wordmark */
  iconOnly?: boolean;
  showTagline?: boolean;
};

export function OperionLogo({
  className,
  href = '/dashboard',
  onDark = false,
  compact = false,
  iconOnly = false,
  showTagline = false,
}: OperionLogoProps) {
  const content = (
    <div className={cn('flex items-center gap-2.5', className)}>
      <OperionMark size={32} className={onDark ? 'text-white' : 'text-slate-900'} />
      {!iconOnly ? (
        <div className={cn('min-w-0 leading-none', compact ? 'hidden lg:block' : '')}>
          <span
            className={cn(
              'block text-lg font-bold tracking-tight',
              onDark ? 'text-white' : 'text-slate-900',
            )}
          >
            Operion
          </span>
          {showTagline ? (
            <span
              className={cn(
                'mt-0.5 block text-[10px] font-medium uppercase tracking-[0.14em]',
                onDark ? 'text-blue-100/70' : 'text-slate-500',
              )}
            >
              10–100 vehicles
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center">
        {content}
      </Link>
    );
  }

  return content;
}
