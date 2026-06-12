import { OperionLogo } from './OperionLogo';

type MyFleetLogoProps = {
  className?: string;
  height?: number;
  href?: string | null;
  onDark?: boolean;
  priority?: boolean;
  fillWidth?: boolean;
};

/** @deprecated Use OperionLogo — kept for existing imports during rebrand. */
export function MyFleetLogo({
  className,
  href = '/',
  onDark = false,
  fillWidth = false,
}: MyFleetLogoProps) {
  return (
    <OperionLogo
      className={className}
      href={href}
      onDark={onDark}
      compact={fillWidth}
      showTagline={fillWidth}
    />
  );
}
