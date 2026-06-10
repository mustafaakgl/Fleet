'use client';

import { useAuthenticatedImageUrl } from '@/lib/file-access';

export function LicenseCheckPhoto({
  apiPath,
  alt,
  className,
}: {
  apiPath?: string | null;
  alt: string;
  className?: string;
}) {
  const url = useAuthenticatedImageUrl(apiPath ?? null);

  if (!apiPath) {
    return (
      <div className={className ?? 'flex h-48 items-center justify-center rounded-lg border bg-gray-50 text-sm text-gray-400'}>
        Kein Foto
      </div>
    );
  }

  if (!url) {
    return (
      <div className={className ?? 'flex h-48 items-center justify-center rounded-lg border bg-gray-50 text-sm text-gray-400'}>
        Lädt…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className ?? 'h-48 w-full rounded-lg border object-cover'} />
  );
}
