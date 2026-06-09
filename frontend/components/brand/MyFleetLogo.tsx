import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const LOGO_WIDTH = 680;
const LOGO_HEIGHT = 548;

type MyFleetLogoProps = {
  className?: string;
  height?: number;
  href?: string | null;
  onDark?: boolean;
  priority?: boolean;
};

export function MyFleetLogo({
  className,
  height = 52,
  href = '/',
  priority = false,
}: MyFleetLogoProps) {
  const width = Math.round((LOGO_WIDTH / LOGO_HEIGHT) * height);

  const image = (
    <Image
      src="/transiq-logo.png"
      alt="TRANSIQ"
      width={width}
      height={height}
      priority={priority}
      className={cn('h-auto w-auto max-w-full object-contain', className)}
      style={{ height, minHeight: height, width: 'auto', maxWidth: Math.max(width, height * 1.4) }}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center">
        {image}
      </Link>
    );
  }

  return image;
}
