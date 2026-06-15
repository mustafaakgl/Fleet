'use client';

import { ImageIcon } from 'lucide-react';
import { documentDownloadApiPath, useAuthenticatedImageUrl } from '@/lib/file-access';
import { cn } from '@/lib/utils';

type EquipmentPhotoPreviewProps = {
  documentId?: string | null;
  alt: string;
  className?: string;
  placeholderClassName?: string;
};

export function EquipmentPhotoPreview({
  documentId,
  alt,
  className,
  placeholderClassName,
}: EquipmentPhotoPreviewProps) {
  const imageUrl = useAuthenticatedImageUrl(
    documentId ? documentDownloadApiPath(documentId) : null,
  );

  if (!imageUrl) {
    return (
      <div
        className={cn(
          'flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50',
          placeholderClassName,
        )}
      >
        <ImageIcon className="h-8 w-8 text-slate-300" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={alt}
      className={cn(
        'w-full rounded-md border border-slate-200 object-cover',
        className ?? 'aspect-[4/3]',
      )}
    />
  );
}
