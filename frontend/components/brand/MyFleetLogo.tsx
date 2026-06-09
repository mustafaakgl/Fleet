import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const LOGO_WIDTH = 1156;
const LOGO_HEIGHT = 654;

type MyFleetLogoProps = {
  className?: string;
  height?: number;
  href?: string | null;
  onDark?: boolean;
  priority?: boolean;
  /** Stretch to fill parent box (sidebar header). Parent must set height. */
  fillWidth?: boolean;
};

export function MyFleetLogo({
  className,
  height = 52,
  href = '/',
  priority = false,
  fillWidth = false,
}: MyFleetLogoProps) {
  const width = Math.round((LOGO_WIDTH / LOGO_HEIGHT) * height);

  if (fillWidth) {
    const image = (
      <div className={cn('h-full w-full', className)}>
        <Image
          src="/transiq-logo.png"
          alt="TRANSIQ"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          priority={priority}
          sizes="(max-width: 1024px) 72px, 256px"
          className="h-full w-full object-contain object-center"
        />
      </div>
    );

    if (href) {
      return (
        <Link href={href} className="block h-full w-full">
          {image}
        </Link>
      );
    }

    return image;
  }

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
