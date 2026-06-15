import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type OperionLogoProps = {
  className?: string;
  href?: string | null;
  /** Sidebar / dark header — logo asset includes a light background */
  onDark?: boolean;
  /** Smaller logo on md, full size from lg (collapsed tablet sidebar) */
  compact?: boolean;
  /** @deprecated Wordmark is in the logo image */
  iconOnly?: boolean;
  showTagline?: boolean;
  height?: number;
  priority?: boolean;
  /** Dashboard sidebar: full-width white pill like product mock */
  variant?: 'default' | 'sidebar';
};

export function OperionLogo({
  className,
  href = '/dashboard',
  onDark = false,
  compact = false,
  showTagline = false,
  height = 36,
  priority = false,
  variant = 'default',
}: OperionLogoProps) {
  const logoHeight = compact ? Math.min(height, 30) : height;

  const content =
    variant === 'sidebar' ? (
      <div
        className={cn(
          'w-full rounded-lg bg-white px-2.5 py-1 shadow-sm',
          compact && 'px-1.5 py-0.5 lg:px-2.5 lg:py-1',
          className,
        )}
      >
        <div
          className={cn(
            'relative w-full overflow-hidden',
            compact ? 'h-8 lg:h-10' : 'h-10',
          )}
        >
          <Image
            src="/operion-logo.png"
            alt="Operion"
            fill
            priority={priority}
            sizes={compact ? '72px' : '240px'}
            className={cn(
              'object-cover',
              compact ? 'object-[left_50%]' : 'object-[center_50%]',
            )}
            style={{
              transform: 'scale(0.82)',
              transformOrigin: compact ? 'left center' : 'center center',
            }}
          />
        </div>
      </div>
    ) : (
      <div className="inline-flex min-w-0 flex-col gap-1">
        <Image
          src="/operion-logo.png"
          alt="Operion"
          width={1024}
          height={1024}
          priority={priority}
          className={cn('w-auto max-w-full object-contain', onDark && 'rounded-md', className)}
          style={{ height: logoHeight }}
        />
        {showTagline ? (
          <span
            className={cn(
              'text-[10px] font-medium uppercase tracking-[0.14em]',
              onDark ? 'text-blue-100/70' : 'text-slate-500',
            )}
          >
            10–100 vehicles
          </span>
        ) : null}
      </div>
    );

  if (href) {
    return (
      <Link
        href={href}
        className={cn('inline-flex shrink-0 items-center', variant === 'sidebar' && 'w-full min-w-0')}
      >
        {content}
      </Link>
    );
  }

  return content;
}
