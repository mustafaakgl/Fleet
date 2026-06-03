import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const LOGO_WIDTH = 658;
const LOGO_HEIGHT = 368;

type MyFleetLogoProps = {
  className?: string;
  height?: number;
  href?: string | null;
  onDark?: boolean;
  priority?: boolean;
};

export function MyFleetLogo({
  className,
  height = 44,
  href = '/',
  onDark = false,
  priority = false,
}: MyFleetLogoProps) {
  const width = Math.round((LOGO_WIDTH / LOGO_HEIGHT) * height);

  const image = (
    <Image
      src="/myfleet-logo.png"
      alt="MyFleet"
      width={width}
      height={height}
      priority={priority}
      className={cn(
        'h-auto object-contain',
        onDark && 'rounded-lg bg-white px-2 py-1',
        className,
      )}
      style={{ height, width: 'auto', maxWidth: width }}
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
