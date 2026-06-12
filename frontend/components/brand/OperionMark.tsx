import { cn } from '@/lib/utils';

type OperionMarkProps = {
  className?: string;
  size?: number;
};

/** Car silhouette with upward trend — fleet analytics mark for 10–100 vehicle operators. */
export function OperionMark({ className, size = 32 }: OperionMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path
        d="M8 28c0-1.1.9-2 2-2h1.2l1.4-4.2A3 3 0 0 1 15.3 20h17.4a3 3 0 0 1 2.7 1.8L37 26h1c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2h-1.1a3 3 0 0 1-5.8 0H16.9a3 3 0 0 1-5.8 0H10c-1.1 0-2-.9-2-2v-6Z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="16" cy="34" r="2.4" fill="#fff" />
      <circle cx="32" cy="34" r="2.4" fill="#fff" />
      <path
        d="M10 38.5 L16 32 L22 35 L28 28 L34 31 L40 24"
        fill="none"
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M36 24 L40 24 L40 28"
        fill="none"
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
